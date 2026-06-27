from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user_id
from database import get_db
from models import Project, User, Workspace, WorkspaceLayer

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    workspace_id: int
    created_at: str


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]


class WorkspaceResponse(BaseModel):
    id: int
    project_id: int
    code: str | None
    map_state: dict | None
    layers: list[dict]
    updated_at: str


class WorkspaceUpdate(BaseModel):
    code: str | None = None
    map_state: dict | None = None


class LayerAdd(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    source: str
    source_id: str | None = None
    layer_type: str
    metadata: dict | None = None
    file_url: str | None = None
    style: dict | None = None


class LayerResponse(BaseModel):
    id: int
    name: str
    source: str
    layer_type: str
    visible: bool
    style: dict | None
    metadata: dict | None


def _get_or_create_user(db: Session, clerk_user_id: str) -> User:
    user = db.query(User).filter(User.clerk_id == clerk_user_id).first()
    if user is None:
        user = User(clerk_id=clerk_user_id)
        db.add(user)
        db.flush()
    return user


def _get_workspace_or_404(workspace_id: int, clerk_id: str, db: Session) -> Workspace:
    workspace = (
        db.query(Workspace)
        .join(Project, Project.id == Workspace.project_id)
        .join(User, User.id == Project.user_id)
        .filter(Workspace.id == workspace_id, User.clerk_id == clerk_id)
        .first()
    )
    if workspace is None:
        raise HTTPException(404, "Workspace not found")
    return workspace


def _serialize_workspace(workspace: Workspace) -> dict:
    return {
        "id": workspace.id,
        "project_id": workspace.project_id,
        "project_name": workspace.project.name,
        "code": workspace.code,
        "map_state": workspace.map_state,
        "updated_at": workspace.updated_at.isoformat(),
        "layers": [
            {
                "id": layer.id,
                "name": layer.name,
                "source": layer.source,
                "layer_type": layer.layer_type,
                "visible": layer.visible,
                "style": layer.style,
                "metadata": layer.metadata_,
            }
            for layer in workspace.layers
        ],
    }


@router.post("/projects", status_code=200)
def create_project(
    payload: ProjectCreate,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = _get_or_create_user(db, current_user_id)

    name = payload.name.strip()
    if not name:
        raise HTTPException(422, "Project name cannot be empty.")

    project = Project(user_id=user.id, name=name, description=payload.description)
    db.add(project)
    db.flush()

    workspace = Workspace(project_id=project.id, code="")
    db.add(workspace)
    db.commit()
    db.refresh(project)

    return {
        "id": project.id,
        "name": project.name,
        "workspace_id": project.workspace.id,
        "created_at": project.created_at.isoformat(),
    }


@router.get("/projects", response_model=ProjectListResponse)
def list_projects(
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.clerk_id == current_user_id).first()
    if user is None:
        return ProjectListResponse(projects=[])

    projects = (
        db.query(Project)
        .filter(Project.user_id == user.id)
        .order_by(Project.updated_at.desc())
        .limit(20)
        .all()
    )

    return ProjectListResponse(
        projects=[
            ProjectResponse(
                id=p.id,
                name=p.name,
                workspace_id=p.workspace.id if p.workspace else None,
                created_at=p.created_at.isoformat(),
            )
            for p in projects
        ]
    )


@router.get("/workspaces/{workspace_id}")
def get_workspace(
    workspace_id: int,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    workspace = _get_workspace_or_404(workspace_id, current_user_id, db)
    return _serialize_workspace(workspace)


@router.patch("/workspaces/{workspace_id}")
def update_workspace(
    workspace_id: int,
    payload: WorkspaceUpdate,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    workspace = _get_workspace_or_404(workspace_id, current_user_id, db)
    if payload.code is not None:
        workspace.code = payload.code
    if payload.map_state is not None:
        workspace.map_state = payload.map_state
    db.commit()
    db.refresh(workspace)
    return _serialize_workspace(workspace)


@router.post("/workspaces/{workspace_id}/layers")
def add_layer(
    workspace_id: int,
    payload: LayerAdd,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    workspace = _get_workspace_or_404(workspace_id, current_user_id, db)

    if payload.layer_type not in ("raster", "vector"):
        raise HTTPException(422, "layer_type must be 'raster' or 'vector'.")
    if payload.source not in ("planetary_computer", "grid3", "hdx", "upload"):
        raise HTTPException(422, "Invalid source.")

    layer = WorkspaceLayer(
        workspace_id=workspace.id,
        name=payload.name,
        source=payload.source,
        source_id=payload.source_id,
        layer_type=payload.layer_type,
        metadata_=payload.metadata,
        file_url=payload.file_url,
        style=payload.style,
    )
    db.add(layer)
    db.commit()
    db.refresh(layer)

    return {
        "id": layer.id,
        "name": layer.name,
        "source": layer.source,
        "layer_type": layer.layer_type,
        "visible": layer.visible,
    }


@router.delete("/workspaces/{workspace_id}/layers/{layer_id}")
def delete_layer(
    workspace_id: int,
    layer_id: int,
    current_user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    workspace = _get_workspace_or_404(workspace_id, current_user_id, db)
    layer = (
        db.query(WorkspaceLayer)
        .filter(WorkspaceLayer.id == layer_id, WorkspaceLayer.workspace_id == workspace.id)
        .first()
    )
    if layer is None:
        raise HTTPException(404, "Layer not found.")
    db.delete(layer)
    db.commit()
    return {"deleted": True}
