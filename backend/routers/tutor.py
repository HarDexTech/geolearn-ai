import os
import re
from datetime import datetime

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from groq import Groq
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import ChatHistory, User

router = APIRouter(prefix="/api", tags=["tutor"])

SYSTEM_PROMPT = (
    "You are GeoLearn AI, an expert GIS tutor specializing in QGIS, ArcGIS, "
    "Remote Sensing, and Nigerian geospatial data. Give clear step-by-step answers."
)
UNAVAILABLE_MESSAGE = "All AI providers are currently unavailable. Please try again later."


class TutorRequest(BaseModel):
    question: str = Field(min_length=3, max_length=4000)
    user_id: str = Field(min_length=3, max_length=255)
    email: str | None = None
    name: str | None = None


class TutorResponse(BaseModel):
    answer: str
    chat_id: int


class ChatItem(BaseModel):
    id: int
    question: str
    answer: str
    created_at: datetime


class ChatsResponse(BaseModel):
    chats: list[ChatItem]


def _is_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    if not normalized:
        return True
    if normalized.startswith("your_"):
        return True
    if "placeholder" in normalized:
        return True
    return normalized in {
        "changeme",
        "replace_me",
        "your_api_key_here",
        "your_groq_api_key_here",
        "your_second_groq_key_here",
        "your_gemini_api_key_here",
        "your_second_gemini_api_key_here",
    }


def _scan_provider_keys(prefix: str) -> list[str]:
    pattern = re.compile(rf"^{re.escape(prefix)}(?:_(\d+))?$")
    indexed: list[tuple[int, str]] = []

    for env_name, raw_value in os.environ.items():
        match = pattern.match(env_name)
        if not match or raw_value is None:
            continue

        suffix = match.group(1)
        index = 1 if suffix is None else int(suffix)
        if suffix is not None and index < 2:
            continue

        value = raw_value.strip()
        if not value or _is_placeholder(value):
            continue

        indexed.append((index, value))

    indexed.sort(key=lambda item: item[0])
    return [value for _, value in indexed]


def _call_groq(question: str, api_key: str) -> str:
    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ],
        temperature=0.2,
    )

    content = response.choices[0].message.content if response.choices else None
    if not content or not content.strip():
        raise RuntimeError("Groq returned an empty response.")
    return content.strip()


def _call_gemini(question: str, api_key: str) -> str:
    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise RuntimeError("google-generativeai is not installed.") from exc

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    response = model.generate_content(question)
    text = getattr(response, "text", None)
    if text and text.strip():
        return text.strip()

    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        joined = "".join(getattr(part, "text", "") for part in parts).strip()
        if joined:
            return joined

    raise RuntimeError("Gemini returned an empty response.")


def generate_answer(question: str) -> str:
    # Load latest env values at request time so newly added keys are picked up automatically.
    load_dotenv(override=True)

    providers: list[tuple[str, str]] = [("groq", key) for key in _scan_provider_keys("GROQ_API_KEY")]
    providers.extend(("gemini", key) for key in _scan_provider_keys("GEMINI_API_KEY"))

    for provider, key in providers:
        try:
            if provider == "groq":
                return _call_groq(question, key)
            return _call_gemini(question, key)
        except Exception:
            continue

    raise HTTPException(status_code=502, detail=UNAVAILABLE_MESSAGE)


@router.get("/chats/{user_id}", response_model=ChatsResponse)
def get_chats(user_id: str, db: Session = Depends(get_db)) -> ChatsResponse:
    chats = (
        db.query(ChatHistory)
        .join(User, User.id == ChatHistory.user_id)
        .filter(User.clerk_id == user_id)
        .order_by(ChatHistory.created_at.desc())
        .limit(20)
        .all()
    )

    return ChatsResponse(
        chats=[
            ChatItem(
                id=chat.id,
                question=chat.question,
                answer=chat.answer,
                created_at=chat.created_at,
            )
            for chat in chats
        ]
    )


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
