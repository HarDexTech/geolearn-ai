import os

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from groq import Groq
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import ChatHistory, User

load_dotenv()

router = APIRouter(prefix="/api", tags=["tutor"])

SYSTEM_PROMPT = (
    "You are GeoLearn AI, an expert GIS tutor specializing in QGIS, ArcGIS, "
    "Remote Sensing, and Nigerian geospatial data. Give clear step-by-step answers."
)


class TutorRequest(BaseModel):
    question: str = Field(min_length=3, max_length=4000)
    user_id: str = Field(min_length=3, max_length=255)
    email: str | None = None
    name: str | None = None


class TutorResponse(BaseModel):
    answer: str
    chat_id: int


def generate_answer(question: str) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key == "your_groq_api_key_here":
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured.")

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": question},
            ],
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Groq request failed: {exc}") from exc

    content = response.choices[0].message.content if response.choices else None
    if not content:
        raise HTTPException(status_code=502, detail="Groq returned an empty response.")
    return content.strip()


@router.post("/tutor", response_model=TutorResponse)
def tutor(payload: TutorRequest, db: Session = Depends(get_db)) -> TutorResponse:
    answer = generate_answer(payload.question)

    user = db.query(User).filter(User.clerk_id == payload.user_id).first()
    if user is None:
        user = User(clerk_id=payload.user_id, email=payload.email, name=payload.name)
        db.add(user)
        db.flush()
    else:
        if payload.email and not user.email:
            user.email = payload.email
        if payload.name and not user.name:
            user.name = payload.name

    chat = ChatHistory(user_id=user.id, question=payload.question, answer=answer)
    db.add(chat)
    db.commit()
    db.refresh(chat)

    return TutorResponse(answer=chat.answer, chat_id=chat.id)
