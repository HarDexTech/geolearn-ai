from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user_id
from database import get_db
from models import Execution, Project, User, Workspace
from sandbox import execute as sandbox_execute

router = APIRouter(prefix="/api/code", tags=["code"])


class RunRequest(BaseModel):
    workspace_id: int
    code: str = Field(max_length=50_000)
    timeout: int = Field(default=30, le=60)


@router.post("/run")
async def run_code(
    payload: RunRequest,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    workspace = (
        db.query(Workspace)
        .join(Project, Project.id == Workspace.project_id)
        .join(User, User.id == Project.user_id)
        .filter(Workspace.id == payload.workspace_id, User.clerk_id == current_user_id)
        .first()
    )
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    input_files = {}
    for layer in workspace.layers:
        if layer.file_url and layer.visible:
            var_name = layer.name.lower().replace(" ", "_").replace("-", "_")
            input_files[var_name] = layer.file_url

    result = sandbox_execute(payload.code, input_files, payload.timeout)

    execution = Execution(
        workspace_id=payload.workspace_id,
        code=payload.code,
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        duration_ms=result.duration_ms,
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)

    return {
        "execution_id": execution.id,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
        "output_files": result.output_files,
    }
