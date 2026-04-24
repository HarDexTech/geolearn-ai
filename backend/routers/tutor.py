import os
import re
import json
from datetime import datetime
from typing import Generator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from groq import Groq
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import (
    get_current_user_id,
    get_sessions_user_id_with_rate_limit,
    get_tutor_user_id_with_rate_limit,
)
from database import SessionLocal, get_db
from models import ChatHistory, ChatSession, User

router = APIRouter(prefix="/api", tags=["tutor"])

SYSTEM_PROMPT = (
    "You are GeoLearn AI, an expert GIS tutor specializing in QGIS, ArcGIS, "
    "Remote Sensing, and Nigerian geospatial data. Give clear step-by-step answers."
)
UNAVAILABLE_MESSAGE = "All AI providers are currently unavailable. Please try again later."


class TutorRequest(BaseModel):
    question: str = Field(min_length=3, max_length=4000)
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


def _provider_keys() -> list[tuple[str, str]]:
    providers: list[tuple[str, str]] = [("groq", key) for key in _scan_provider_keys("GROQ_API_KEY")]
    providers.extend(("gemini", key) for key in _scan_provider_keys("GEMINI_API_KEY"))
    return providers


def _build_messages(question: str, history: list[tuple[str, str]]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for prev_question, prev_answer in history:
        messages.append({"role": "user", "content": prev_question})
        messages.append({"role": "assistant", "content": prev_answer})

    messages.append({"role": "user", "content": question})
    return messages


def _build_gemini_contents(question: str, history: list[tuple[str, str]]) -> list[dict[str, object]]:
    contents: list[dict[str, object]] = []
    for prev_question, prev_answer in history:
        contents.append({"role": "user", "parts": [{"text": prev_question}]})
        contents.append({"role": "model", "parts": [{"text": prev_answer}]})

    contents.append({"role": "user", "parts": [{"text": question}]})
    return contents


def _normalize_question(raw_question: str) -> str:
    sanitized = raw_question.replace("\x00", "").strip()
    if len(sanitized) < 3:
        raise HTTPException(status_code=422, detail="Question must contain at least 3 characters.")
    return sanitized


def _load_session_context(
    db: Session,
    user_id: int,
    session_id: int | None,
    max_turns: int = 6,
) -> list[tuple[str, str]]:
    if session_id is None:
        return []

    rows = (
        db.query(ChatHistory.question, ChatHistory.answer)
        .filter(ChatHistory.user_id == user_id, ChatHistory.session_id == session_id)
        .order_by(ChatHistory.created_at.desc())
        .limit(max_turns)
        .all()
    )

    return list(reversed([(row.question, row.answer) for row in rows]))


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


def _call_groq(question: str, api_key: str, history: list[tuple[str, str]]) -> str:
    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=_build_messages(question, history),
        temperature=0.2,
    )

    content = response.choices[0].message.content if response.choices else None
    if not content or not content.strip():
        raise RuntimeError("Groq returned an empty response.")
    return content.strip()


def _call_gemini(question: str, api_key: str, history: list[tuple[str, str]]) -> str:
    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise RuntimeError("google-generativeai is not installed.") from exc

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    response = model.generate_content(_build_gemini_contents(question, history))
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


def _stream_groq(
    question: str,
    api_key: str,
    history: list[tuple[str, str]],
) -> Generator[str, None, None]:
    client = Groq(api_key=api_key)
    stream = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=_build_messages(question, history),
        temperature=0.2,
        stream=True,
    )

    for chunk in stream:
        piece = chunk.choices[0].delta.content if chunk.choices else None
        if piece:
            yield piece


def _stream_gemini(
    question: str,
    api_key: str,
    history: list[tuple[str, str]],
) -> Generator[str, None, None]:
    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise RuntimeError("google-generativeai is not installed.") from exc

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    stream = model.generate_content(_build_gemini_contents(question, history), stream=True)
    for chunk in stream:
        text = getattr(chunk, "text", None)
        if text:
            yield text


def generate_answer(question: str, history: list[tuple[str, str]]) -> str:
    providers = _provider_keys()

    for provider, key in providers:
        try:
            if provider == "groq":
                return _call_groq(question, key, history)
            return _call_gemini(question, key, history)
        except Exception:
            continue

    raise HTTPException(status_code=502, detail=UNAVAILABLE_MESSAGE)


def _stream_answer(question: str, history: list[tuple[str, str]]) -> Generator[str, None, str]:
    providers = _provider_keys()
    answer_parts: list[str] = []

    for provider, key in providers:
        try:
            generator = (
                _stream_groq(question, key, history)
                if provider == "groq"
                else _stream_gemini(question, key, history)
            )
            for piece in generator:
                answer_parts.append(piece)
                yield piece

            full_answer = "".join(answer_parts).strip()
            if full_answer:
                return full_answer
            answer_parts.clear()
        except Exception:
            answer_parts.clear()
            continue

    raise HTTPException(status_code=502, detail=UNAVAILABLE_MESSAGE)


def _get_or_create_user(
    db: Session,
    clerk_user_id: str,
) -> User:
    user = db.query(User).filter(User.clerk_id == clerk_user_id).first()
    if user is None:
        user = User(clerk_id=clerk_user_id)
        db.add(user)
        db.flush()
        return user
    return user


@router.post("/sessions", response_model=SessionCreateResponse)
def create_session(
    payload: SessionCreateRequest,
    current_user_id: str = Depends(get_sessions_user_id_with_rate_limit),
    db: Session = Depends(get_db),
) -> SessionCreateResponse:
    user = _get_or_create_user(db, current_user_id)
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
    current_user_id: str = Depends(get_sessions_user_id_with_rate_limit),
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
    current_user_id: str = Depends(get_sessions_user_id_with_rate_limit),
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
    current_user_id: str = Depends(get_sessions_user_id_with_rate_limit),
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
    user = _get_or_create_user(db, current_user_id)
    question = _normalize_question(payload.question)

    session_id = payload.session_id
    if session_id is not None:
        session = (
            db.query(ChatSession)
            .filter(ChatSession.id == session_id, ChatSession.user_id == user.id)
            .first()
        )
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found for this user.")

    context_history = _load_session_context(db, user.id, session_id)
    answer = generate_answer(question, context_history)

    chat = ChatHistory(
        user_id=user.id,
        session_id=session_id,
        question=question,
        answer=answer,
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)

    return TutorResponse(answer=chat.answer, chat_id=chat.id)


@router.post(
    "/tutor/stream",
    responses={429: {"description": "Too many tutor requests"}},
)
def tutor_stream(
    payload: TutorRequest,
    current_user_id: str = Depends(get_tutor_user_id_with_rate_limit),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    user = _get_or_create_user(db, current_user_id)
    question = _normalize_question(payload.question)
    db.commit()
    db.refresh(user)

    session_id = payload.session_id
    if session_id is not None:
        session = (
            db.query(ChatSession)
            .filter(ChatSession.id == session_id, ChatSession.user_id == user.id)
            .first()
        )
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found for this user.")

    context_history = _load_session_context(db, user.id, session_id)

    def _event(data: dict[str, object]) -> str:
        return f"data: {json.dumps(data)}\n\n"

    def _event_stream() -> Generator[str, None, None]:
        try:
            answer = ""
            for piece in _stream_answer(question, context_history):
                answer += piece
                yield _event({"type": "chunk", "text": piece})

            final_answer = answer.strip()
            if not final_answer:
                yield _event({"type": "error", "message": UNAVAILABLE_MESSAGE})
                return

            with SessionLocal() as stream_db:
                chat = ChatHistory(
                    user_id=user.id,
                    session_id=session_id,
                    question=question,
                    answer=final_answer,
                )
                stream_db.add(chat)
                stream_db.commit()
                stream_db.refresh(chat)
                chat_id = chat.id

            yield _event({"type": "done", "chat_id": chat_id})
        except HTTPException as exc:
            yield _event({"type": "error", "message": str(exc.detail)})
        except Exception:
            yield _event({"type": "error", "message": UNAVAILABLE_MESSAGE})

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
