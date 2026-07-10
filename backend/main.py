import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text

from database import Base, engine
from routers import agent, code_runner, data_connector, datasets, tutor, workspace


def _init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_session_schema()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _init_db),
            timeout=10.0,
        )
    except asyncio.TimeoutError:
        if db_startup_strict:
            raise RuntimeError("Database initialization timed out")
        logging.warning(
            "DB init timed out; continuing because DB_STARTUP_STRICT is disabled."
        )
    except Exception as exc:
        if db_startup_strict:
            logging.exception("Startup DB init failed; refusing to start.")
            raise RuntimeError("Database initialization failed") from exc
        logging.exception(
            "Startup DB init failed; continuing because DB_STARTUP_STRICT is disabled."
        )
    yield


app = FastAPI(title="GeoLearn AI API", lifespan=lifespan)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logging.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )

frontend_origin = os.getenv("NEXT_PUBLIC_FRONTEND_URL", "http://localhost:3000")
environment = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


# Fail fast in production by default; allow local dev override via env.
db_startup_strict = _is_truthy(
    os.getenv("DB_STARTUP_STRICT", "true" if environment == "production" else "false")
)

allow_origins = [frontend_origin]
if environment != "production":
    allow_origins.append("http://127.0.0.1:3000")
    allow_origins.append("http://localhost:3000")

allow_origins = list(dict.fromkeys(allow_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def _ensure_session_schema() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    # create_all creates new tables but does not alter existing ones.
    if "chat_history" not in table_names:
        return

    chat_history_columns = {column["name"] for column in inspector.get_columns("chat_history")}

    with engine.begin() as conn:
        if "session_id" not in chat_history_columns:
            conn.execute(text("ALTER TABLE chat_history ADD COLUMN session_id INTEGER"))

        if engine.dialect.name == "postgresql":
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'fk_chat_history_session_id'
                        ) THEN
                            ALTER TABLE chat_history
                            ADD CONSTRAINT fk_chat_history_session_id
                            FOREIGN KEY (session_id)
                            REFERENCES chat_sessions (id)
                            ON DELETE CASCADE;
                        END IF;
                    END;
                    $$;
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_chat_history_session_id ON chat_history (session_id)"
                )
            )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(tutor.router)
app.include_router(datasets.router)
app.include_router(code_runner.router)
app.include_router(data_connector.router)
app.include_router(agent.router)
app.include_router(workspace.router)
