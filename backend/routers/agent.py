import json
import re
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ai_client import GEO_AGENT_SYSTEM_PROMPT, chat_stream
from auth import get_agent_user_id_with_rate_limit
from database import SessionLocal, get_db
from models import Conversation, Execution, Project, User, Workspace
from sandbox import execute as sandbox_execute

router = APIRouter(prefix="/api/agent", tags=["agent"])


class AgentRequest(BaseModel):
    workspace_id: int
    message: str = Field(min_length=1, max_length=4000)
    auto_run: bool = True


def _build_workspace_context(workspace) -> str:
    if not workspace.layers:
        return "No datasets are currently loaded in the workspace."
    lines = ["Currently loaded datasets:"]
    for layer in workspace.layers:
        if not layer.visible:
            continue
        meta = layer.metadata_ or {}
        lines.append(
            f"- {layer.name} ({layer.layer_type}, source: {layer.source})"
            f" | bands: {meta.get('bands', 'unknown')}"
            f" | crs: {meta.get('crs', 'unknown')}"
        )
    return "\n".join(lines)


def _build_messages(workspace, history, new_message: str) -> list[dict[str, str]]:
    ctx = _build_workspace_context(workspace)
    system_content = (
        GEO_AGENT_SYSTEM_PROMPT
        + "\n\n"
        + ctx
        + "\n\nIf you write Python code, wrap it in a markdown code block starting with ```python so it can be extracted and executed."
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]
    for row in history[-20:]:
        messages.append({"role": row.role, "content": row.content})
    messages.append({"role": "user", "content": new_message})
    return messages


def _extract_code_block(text: str) -> str | None:
    m = re.search(r"```python\n(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return None


@router.post("/run", responses={429: {"description": "Too many agent requests"}})
async def run_agent(
    payload: AgentRequest,
    current_user_id: str = Depends(get_agent_user_id_with_rate_limit),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    user = db.query(User).filter(User.clerk_id == current_user_id).first()
    if user is None:
        raise HTTPException(404, "User not found")

    workspace = (
        db.query(Workspace)
        .join(Project, Project.id == Workspace.project_id)
        .filter(Workspace.id == payload.workspace_id, Project.user_id == user.id)
        .first()
    )
    if workspace is None:
        raise HTTPException(404, "Workspace not found")

    history = (
        db.query(Conversation)
        .filter(Conversation.workspace_id == workspace.id)
        .order_by(Conversation.created_at.asc())
        .limit(20)
        .all()
    )

    messages = _build_messages(workspace, history, payload.message)

    input_files = {}
    for layer in workspace.layers:
        if layer.file_url and layer.visible:
            var_name = layer.name.lower().replace(" ", "_").replace("-", "_")
            if var_name.isidentifier():
                input_files[var_name] = layer.file_url

    workspace_id = workspace.id
    user_id = user.id

    def _event(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    async def _stream() -> AsyncGenerator[str, None]:
        try:
            full_response = ""
            async for chunk in chat_stream(messages, task_type="agent"):
                full_response += chunk
                yield _event({"type": "chunk", "text": chunk})

            if not full_response.strip():
                yield _event({"type": "error", "message": "AI returned an empty response."})
                return

            final = full_response.strip()

            stream_db = SessionLocal()
            try:
                stream_db.add(Conversation(workspace_id=workspace_id, role="user", content=payload.message))
                stream_db.add(Conversation(workspace_id=workspace_id, role="assistant", content=final))
                stream_db.commit()
            except Exception:
                stream_db.rollback()
            finally:
                stream_db.close()

            if payload.auto_run:
                code = _extract_code_block(final)
                if code:
                    yield _event({"type": "running_code", "code": code})
                    result = sandbox_execute(code, input_files, timeout=30)
                    yield _event({
                        "type": "execution_result",
                        "stdout": result.stdout,
                        "stderr": result.stderr,
                        "exit_code": result.exit_code,
                        "duration_ms": result.duration_ms,
                        "output_files": result.output_files,
                    })

                    exec_db = SessionLocal()
                    try:
                        exec_db.add(Execution(
                            workspace_id=workspace_id,
                            code=code,
                            stdout=result.stdout,
                            stderr=result.stderr,
                            exit_code=result.exit_code,
                            duration_ms=result.duration_ms,
                        ))
                        exec_db.commit()
                    except Exception:
                        exec_db.rollback()
                    finally:
                        exec_db.close()

            yield _event({"type": "done"})
        except Exception as e:
            yield _event({"type": "error", "message": str(e)})

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
