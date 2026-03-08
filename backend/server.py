
from fastapi import FastAPI
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

# ------------------------------------------------------------
# Load Environment Variables
# ------------------------------------------------------------

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ------------------------------------------------------------
# Logging Configuration
# ------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)

# ------------------------------------------------------------
# Validate Environment Variables
# ------------------------------------------------------------

from services.env_validator import validate_environment, get_config_status

env_valid, env_errors, env_warnings = validate_environment()

if not env_valid:
    logger.warning("Some required environment variables are missing")

# ------------------------------------------------------------
# Database
# ------------------------------------------------------------

from database import engine, AsyncSessionLocal

# ------------------------------------------------------------
# Background Task
# ------------------------------------------------------------

cron_task = None


# ------------------------------------------------------------
# Lifespan Events
# ------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):

    global cron_task

    logger.info("Replyzen AI API starting up...")

    # Show config status
    config_status = get_config_status()
    for group, status in config_status.items():
        if status["percentage"] < 100:
            logger.warning(
                f"Config group '{group}': "
                f"{status['configured']}/{status['total']} configured "
                f"({status['percentage']}%)"
            )

    # Initialize cron service
    from services.autosend_cron import set_database, run_cron_loop

    set_database(AsyncSessionLocal)

    cron_task = asyncio.create_task(
        run_cron_loop(interval_minutes=30)
    )

    logger.info("Auto-send cron job started")

    yield

    # Shutdown tasks
    logger.info("Replyzen AI API shutting down...")

    if cron_task:
        cron_task.cancel()
        try:
            await cron_task
        except asyncio.CancelledError:
            pass

    await engine.dispose()


# ------------------------------------------------------------
# FastAPI Application
# ------------------------------------------------------------

app = FastAPI(
    title="Replyzen AI API",
    version="1.0.0",
    lifespan=lifespan
)

# ------------------------------------------------------------
# CORS Configuration
# ------------------------------------------------------------

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,https://replyzen-ai01-production.up.railway.app"
)

origins = [origin.strip() for origin in cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info(f"CORS enabled for: {origins}")

# ------------------------------------------------------------
# Import Routers
# ------------------------------------------------------------

from routes.auth_routes import router as auth_router
from routes.email_routes import router as email_router
from routes.followup_routes import router as followup_router
from routes.billing_routes import router as billing_router
from routes.analytics_routes import router as analytics_router
from routes.settings_routes import router as settings_router

app.include_router(auth_router)
app.include_router(email_router)
app.include_router(followup_router)
app.include_router(billing_router)
app.include_router(analytics_router)
app.include_router(settings_router)

# ------------------------------------------------------------
# Health Endpoint
# ------------------------------------------------------------

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "replyzen-ai",
        "version": "1.0.0"
    }

# ------------------------------------------------------------
# Config Status Endpoint
# ------------------------------------------------------------

@app.get("/api/config-status")
async def config_status():
    return get_config_status()
