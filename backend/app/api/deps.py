from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.entities import User


def get_user_or_404(user_id: int, db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
