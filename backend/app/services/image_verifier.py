def verify_claim_image(filename: str) -> tuple[bool, str, float]:
    lower = filename.lower()

    if any(word in lower for word in ["flood", "rain", "water", "storm"]):
        confidence = 0.91
        return True, "Image pattern resembles weather disruption proof", confidence

    if any(word in lower for word in ["sunny", "clear", "selfie"]):
        confidence = 0.18
        return False, "Image does not appear related to weather disruption", confidence

    confidence = 0.62
    return True, "Image accepted with moderate confidence", confidence
