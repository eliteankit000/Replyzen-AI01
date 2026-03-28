import os
import re
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

DATABASE_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise Exception("No database URL set. Please set SUPABASE_DB_URL or DATABASE_URL.")

is_sqlite = "sqlite" in DATABASE_URL
is_supabase = "supabase" in DATABASE_URL or "pgbouncer" in DATABASE_URL

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("sqlite://"):
    DATABASE_URL = DATABASE_URL.replace("sqlite://", "sqlite+aiosqlite://", 1)

# asyncpg doesn't support sslmode query param — strip it
DATABASE_URL = re.sub(r'[?&]sslmode=[^&]*', '', DATABASE_URL)
DATABASE_URL = re.sub(r'[?&]ssl=[^&]*', '', DATABASE_URL)

engine_kwargs = {
    "pool_pre_ping": True,
}

if not is_sqlite:
    engine_kwargs.update({
        "pool_size": 5,
        "max_overflow": 10,
    })

if is_supabase:
    engine_kwargs["connect_args"] = {
        "statement_cache_size": 0,
        "ssl": "require",
    }

engine = create_async_engine(
    DATABASE_URL,
    **engine_kwargs
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
