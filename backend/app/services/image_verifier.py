"""
Image verification service using OpenAI CLIP (ViT-B/32).

CLIP is a real vision-language model trained on 400M image-text pairs.
It performs zero-shot image classification by comparing image embeddings
against text prompt embeddings — no fine-tuning required.

Disaster labels are crafted as natural-language prompts that CLIP understands
from its pretraining (it has seen millions of disaster/weather images).
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

DisasterType = Literal["rain", "fire", "flood", "smoke", "clear", "unknown"]


@dataclass
class ImageVerificationResult:
    accepted: bool
    disaster_type: DisasterType
    confidence: float
    message: str
    signals: dict


# ---------------------------------------------------------------------------
# CLIP label prompts — multiple prompts per class improve accuracy
# ---------------------------------------------------------------------------
LABEL_GROUPS: dict[DisasterType, list[str]] = {
    "rain": [
        "a photo of heavy monsoon rain flooding Indian streets",
        "a photo of a rainstorm with waterlogged roads and puddles",
        "a photo of dark storm clouds with torrential rainfall",
        "a photo of a delivery worker standing in heavy rain",
        "a photo of rain pouring down on buildings and vehicles",
        "a photo of a thunderstorm with lightning over a city",
        "a photo of wet flooded road during heavy downpour",
        "a photo of rainwater overflowing drains on a street",
    ],
    "fire": [
        "a photo of fire and flames burning a building",
        "a photo of a structure on fire with thick black smoke",
        "a photo of wildfire with intense orange and red flames",
        "a photo of fire engulfing a market or shop at night",
        "a photo of burning vehicles or property with flames",
        "a photo of a large fire with firefighters responding",
        "a photo of flames and embers from a burning structure",
        "a photo of fire destroying property with smoke rising",
    ],
    "flood": [
        "a photo of flood water completely submerging streets and cars",
        "a photo of a flooded Indian neighbourhood with water everywhere",
        "a photo of vehicles stuck in waist-deep flood water",
        "a photo of a flooded area after heavy monsoon rain",
        "a photo of people wading through knee-deep flood water",
        "a photo of a river overflowing its banks into streets",
        "a photo of submerged roads and buildings during a flood",
        "a photo of rescue boats in a flooded residential area",
    ],
    "smoke": [
        "a photo of thick black smoke filling the sky over a city",
        "a photo of hazy smoggy sky with extremely poor visibility",
        "a photo of smoke from a fire covering an entire area",
        "a photo of heavy air pollution with dense smog over buildings",
        "a photo of industrial smoke and pollution in the air",
        "a photo of a city skyline obscured by dense smoke haze",
        "a photo of smoke from burning fields or waste",
        "a photo of a person wearing a mask due to heavy smog",
    ],
    "clear": [
        "a photo of clear sunny weather with bright blue sky",
        "a photo of a normal day outdoors with no disaster",
        "a photo of a person taking a selfie on a sunny day",
        "a photo of a dry road with no rain or flooding",
        "a photo of people walking normally on a clear day",
        "a photo of a sunny street with no emergency or disaster",
        "a photo of a park or garden on a pleasant day",
        "a photo of a building exterior on a clear sunny day",
    ],
}

# Flatten all labels and track which group each belongs to
_ALL_LABELS: list[str] = []
_LABEL_TO_CLASS: dict[str, DisasterType] = {}
for _cls, _prompts in LABEL_GROUPS.items():
    for _p in _prompts:
        _ALL_LABELS.append(_p)
        _LABEL_TO_CLASS[_p] = _cls

DISASTER_MESSAGES: dict[DisasterType, str] = {
    "rain": "CLIP model detected rain / storm conditions — accepted as disruption proof.",
    "fire": "CLIP model detected fire / blaze — accepted as disruption proof.",
    "flood": "CLIP model detected flooding / water accumulation — accepted as disruption proof.",
    "smoke": "CLIP model detected smoke / haze — accepted as disruption proof.",
    "clear": "CLIP model detected clear weather — does not support a disruption claim.",
    "unknown": "Image accepted with moderate confidence — manual review recommended.",
}

ACCEPTED_TYPES: set[DisasterType] = {"rain", "fire", "flood", "smoke", "unknown"}

# ---------------------------------------------------------------------------
# Lazy-load CLIP model (singleton, thread-safe)
# ---------------------------------------------------------------------------
_model_lock = threading.Lock()
_clip_model = None
_clip_processor = None


def _load_clip():
    global _clip_model, _clip_processor
    if _clip_model is not None:
        return _clip_model, _clip_processor
    with _model_lock:
        if _clip_model is not None:
            return _clip_model, _clip_processor
        try:
            import torch
            from transformers import CLIPModel, CLIPProcessor
            _clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
            _clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
            _clip_model.eval()
        except Exception as e:
            _clip_model = None
            _clip_processor = None
            raise RuntimeError(f"CLIP load failed: {e}")
    return _clip_model, _clip_processor


def _classify_with_clip(file_path: str) -> tuple[DisasterType, float, dict]:
    """
    Run CLIP zero-shot classification on the image.
    Returns (disaster_type, confidence, raw_scores_dict).
    """
    import torch
    from PIL import Image

    model, processor = _load_clip()

    with Image.open(file_path) as img:
        img_rgb = img.convert("RGB")

    inputs = processor(
        text=_ALL_LABELS,
        images=img_rgb,
        return_tensors="pt",
        padding=True,
        truncation=True,
    )

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)[0].tolist()

    # Aggregate probabilities per class (sum of all prompts for that class)
    class_scores: dict[DisasterType, float] = {c: 0.0 for c in LABEL_GROUPS}
    for label, prob in zip(_ALL_LABELS, probs):
        cls = _LABEL_TO_CLASS[label]
        class_scores[cls] += prob

    # Normalise so scores sum to 1
    total = sum(class_scores.values()) or 1.0
    class_scores = {k: round(v / total, 4) for k, v in class_scores.items()}

    best_class = max(class_scores, key=class_scores.__getitem__)
    best_score = class_scores[best_class]

    # If best score is too low, call it unknown
    if best_score < 0.20:
        return "unknown", round(best_score, 3), class_scores

    return best_class, round(best_score, 3), class_scores


def _classify_from_filename(filename: str) -> tuple[DisasterType | None, float]:
    """Last-resort fallback: keyword scan on filename."""
    lower = os.path.basename(filename).lower()
    if any(w in lower for w in ["flood", "water", "inundation"]):
        return "flood", 0.72
    if any(w in lower for w in ["rain", "storm", "downpour", "drizzle"]):
        return "rain", 0.70
    if any(w in lower for w in ["fire", "blaze", "flame", "burn"]):
        return "fire", 0.70
    if any(w in lower for w in ["smoke", "haze", "smog"]):
        return "smoke", 0.68
    if any(w in lower for w in ["sunny", "clear", "selfie", "portrait"]):
        return "clear", 0.70
    return None, 0.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def verify_claim_image(file_path: str) -> tuple[bool, str, float]:
    """Backward-compatible API. Returns (accepted, message, confidence)."""
    result = verify_claim_image_detailed(file_path)
    return result.accepted, result.message, result.confidence


def verify_claim_image_detailed(file_path: str) -> ImageVerificationResult:
    """Full verification using CLIP. Falls back gracefully if model unavailable."""
    ext = os.path.splitext(file_path)[1].lower()

    # Video: cannot scan frames without ffmpeg, accept with note
    if ext == ".mp4":
        return ImageVerificationResult(
            accepted=True,
            disaster_type="unknown",
            confidence=0.65,
            message="Video proof accepted — frame content review recommended.",
            signals={"source": "video-no-scan"},
        )

    # Try CLIP first
    try:
        disaster_type, confidence, class_scores = _classify_with_clip(file_path)
        accepted = disaster_type in ACCEPTED_TYPES
        message = DISASTER_MESSAGES[disaster_type]
        return ImageVerificationResult(
            accepted=accepted,
            disaster_type=disaster_type,
            confidence=confidence,
            message=message,
            signals={
                "source": "clip-vit-base-patch32",
                "class_scores": class_scores,
            },
        )
    except Exception as clip_err:
        # CLIP unavailable — fall back to filename heuristic
        fn_type, fn_conf = _classify_from_filename(file_path)
        disaster_type = fn_type or "unknown"
        confidence = fn_conf if fn_conf > 0 else 0.50
        accepted = disaster_type in ACCEPTED_TYPES
        message = DISASTER_MESSAGES[disaster_type]
        return ImageVerificationResult(
            accepted=accepted,
            disaster_type=disaster_type,
            confidence=confidence,
            message=f"{message} (CLIP unavailable: {clip_err})",
            signals={"source": "filename-fallback"},
        )
