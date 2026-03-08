from fastapi import FastAPI
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Validate environment on startup
from services.env_validator import validate_environment, get_config_status
env_valid, env_errors, env_warnings = validate_environment()

from database import engine, AsyncSessionLocal

# Background task reference
cron_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown."""
    global cron_task
    
    # Startup
    logger.info("Replyzen AI API starting up...")
    
    # Log config status
    config_status = get_config_status()
    for group, status in config_status.items():
        if status["percentage"] < 100:
            logger.warning(f"Config group '{group}': {status['configured']}/{status['total']} configured ({status['percentage']}%)")
    
    # Initialize auto-send cron service
    from services.autosend_cron import set_database, run_cron_loop
    set_database(AsyncSessionLocal)
    
    # Start cron job in background (every 30 minutes)
    cron_task = asyncio.create_task(run_cron_loop(interval_minutes=30))
    logger.info("Auto-send cron job started")
    
    yield
    
    # Shutdown
    logger.info("Replyzen AI API shutting down...")
    
    # Cancel cron task
    if cron_task:
        cron_task.cancel()
        try:
            await cron_task
        except asyncio.CancelledError:
            pass
    
    # Close database engine
    await engine.dispose()


app = FastAPI(
    title="Replyzen AI API",
    version="1.0.0",
    lifespan=lifespan
)

# Import routers
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "replyzen-ai", "version": "1.0.0"}


@app.get("/api/config-status")
async def config_status():
    """Get configuration status (admin endpoint)."""
    return get_config_status()
