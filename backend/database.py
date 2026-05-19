import os
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./climateshield.db"
)

# SQLite-specific connect args
is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    poolclass=NullPool if is_sqlite else None,
)

# Enable WAL mode for SQLite
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.close()


def _ensure_risk_columns(engine):
    """Add risk_level, composite_risk_score, wet_bulb_peak to weather_readings if missing.

    SQLAlchemy create_all() only creates new tables, not new columns on existing tables.
    This ALTER TABLE ensures the production DB gets the new columns without Alembic.
    Tests use in-memory DB with create_all(), so they always get new columns automatically.
    """
    with engine.connect() as conn:
        for col_name, col_type in [
            ("risk_level", "VARCHAR"),
            ("composite_risk_score", "FLOAT"),
            ("wet_bulb_peak", "FLOAT"),
        ]:
            try:
                conn.execute(text(
                    f"ALTER TABLE weather_readings ADD COLUMN {col_name} {col_type}"
                ))
                conn.commit()
            except OperationalError:
                pass  # Column already exists


# Ensure new columns exist on the live DB (create_all won't add columns to existing tables)
_ensure_risk_columns(engine)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
