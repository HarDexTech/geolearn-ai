import os
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from groq import Groq
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user_id, get_tutor_user_id_with_rate_limit
from database import get_db
from models import ChatHistory, ChatSession, User

router = APIRouter(prefix="/api", tags=["tutor"])

SYSTEM_PROMPT = (
    "You are GeoLearn AI, an expert GIS tutor specializing in QGIS, ArcGIS, "
    "Remote Sensing, and Nigerian geospatial data. Give clear step-by-step answers."
)
UNAVAILABLE_MESSAGE = "All AI providers are currently unavailable. Please try again later."


class TutorRequest(BaseModel):
    question: str = Field(min_length=3, max_length=4000)
    email: str | None = None
    name: str | None = None
    session_id: int | None = None


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


class SessionCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=50)
    email: str | None = None
    name: str | None = None


class SessionCreateResponse(BaseModel):
    session_id: int
    title: str


class SessionItem(BaseModel):
    id: int
    title: str
    created_at: datetime


class SessionsResponse(BaseModel):
    sessions: list[SessionItem]


class SessionMessageItem(BaseModel):
    id: int
    question: str
    answer: str


class SessionMessagesResponse(BaseModel):
    messages: list[SessionMessageItem]


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


def _get_or_create_user(
    db: Session,
    clerk_user_id: str,
    email: str | None,
    name: str | None,
) -> User:
    user = db.query(User).filter(User.clerk_id == clerk_user_id).first()
    if user is None:
        user = User(clerk_id=clerk_user_id, email=email, name=name)
        db.add(user)
        db.flush()
        return user

    if email and not user.email:
        user.email = email
    if name and not user.name:
        user.name = name
    return user


@router.post("/sessions", response_model=SessionCreateResponse)
def create_session(
    payload: SessionCreateRequest,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> SessionCreateResponse:
    user = _get_or_create_user(db, current_user_id, payload.email, payload.name)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Session title cannot be empty.")

    session = ChatSession(user_id=user.id, title=title)
    db.add(session)
    db.commit()
    db.refresh(session)

    return SessionCreateResponse(session_id=session.id, title=session.title)


@router.get("/sessions", response_model=SessionsResponse)
def get_sessions(
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> SessionsResponse:
    sessions = (
        db.query(ChatSession)
        .join(User, User.id == ChatSession.user_id)
        .filter(User.clerk_id == current_user_id)
        .order_by(ChatSession.created_at.desc())
        .limit(30)
        .all()
    )

    return SessionsResponse(
        sessions=[
            SessionItem(id=session.id, title=session.title, created_at=session.created_at)
            for session in sessions
        ]
    )


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    session = (
        db.query(ChatSession)
        .join(User, User.id == ChatSession.user_id)
        .filter(ChatSession.id == session_id, User.clerk_id == current_user_id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    db.delete(session)
    db.commit()
    return {"deleted": True}


@router.get("/sessions/{session_id}/messages", response_model=SessionMessagesResponse)
def get_session_messages(
    session_id: int,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> SessionMessagesResponse:
    session = (
        db.query(ChatSession)
        .join(User, User.id == ChatSession.user_id)
        .filter(ChatSession.id == session_id, User.clerk_id == current_user_id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    messages = (
        db.query(ChatHistory)
        .filter(ChatHistory.session_id == session_id)
        .order_by(ChatHistory.created_at.asc())
        .all()
    )

    return SessionMessagesResponse(
        messages=[
            SessionMessageItem(id=message.id, question=message.question, answer=message.answer)
            for message in messages
        ]
    )


@router.get("/chats", response_model=ChatsResponse)
def get_chats(
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> ChatsResponse:
    chats = (
        db.query(ChatHistory)
        .join(User, User.id == ChatHistory.user_id)
        .filter(User.clerk_id == current_user_id)
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


@router.post(
    "/tutor",
    response_model=TutorResponse,
    responses={429: {"description": "Too many tutor requests"}},
)
def tutor(
    payload: TutorRequest,
    current_user_id: str = Depends(get_tutor_user_id_with_rate_limit),
    db: Session = Depends(get_db),
) -> TutorResponse:
    answer = generate_answer(payload.question)

    user = _get_or_create_user(db, current_user_id, payload.email, payload.name)

    session_id = payload.session_id
    if session_id is not None:
        session = (
            db.query(ChatSession)
            .filter(ChatSession.id == session_id, ChatSession.user_id == user.id)
            .first()
        )
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found for this user.")

    chat = ChatHistory(
        user_id=user.id,
        session_id=session_id,
        question=payload.question,
        answer=answer,
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)

    return TutorResponse(answer=chat.answer, chat_id=chat.id)
