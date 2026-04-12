from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from database import Base, engine
from routers import datasets, tutor, youtube

app = FastAPI(title="GeoLearn AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_session_schema()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(tutor.router)
app.include_router(datasets.router)
app.include_router(youtube.router)
