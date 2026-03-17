from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv
import logging
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

from services.env_validator import validate_environment, get_config_status

env_valid, env_errors, env_warnings = validate_environment()
if not env_valid:
    logger.warning("Some required environment variables are missing")

from database import engine, AsyncSessionLocal

cron_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global cron_task
    logger.info("Replyzen AI API starting up...")

    config_status = get_config_status()
    for group, status in config_status.items():
        if status["percentage"] < 100:
            logger.warning(
                f"Config group '{group}': "
                f"{status['configured']}/{status['total']} configured "
                f"({status['percentage']}%)"
            )

    from services.autosend_cron import set_database, run_cron_loop
    set_database(AsyncSessionLocal)
    cron_task = asyncio.create_task(run_cron_loop(interval_minutes=30))
    logger.info("Auto-send cron job started")

    yield

    logger.info("Replyzen AI API shutting down...")
    if cron_task:
        cron_task.cancel()
        try:
            await cron_task
        except asyncio.CancelledError:
            pass
    await engine.dispose()


app = FastAPI(
    title="Replyzen AI API",
    version="1.0.0",
    lifespan=lifespan
)

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://replyzenai.com",
    "https://www.replyzenai.com",
    "https://replyzen-ai-01-wjzx.vercel.app",
    "https://replyzen-ai-01-3boy.vercel.app",
]

class CORSErrorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin", "")
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.error(f"Unhandled exception: {exc}", exc_info=True)
            response = JSONResponse(
                status_code=500,
                content={"detail": str(exc)}
            )
        if origin and (origin in ALLOWED_ORIGINS or ".vercel.app" in origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

app.add_middleware(CORSErrorMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "User-Agent",
        "X-Requested-With",
    ],
    expose_headers=["Content-Length", "Content-Range"],
    max_age=86400,
)

logger.info("CORS middleware enabled (production mode)")

from routes.auth_routes import router as auth_router
from routes.email_routes import router as email_router
from routes.followup_routes import router as followup_router
from routes.billing_routes import router as billing_router
from routes.analytics_routes import router as analytics_router
from routes.settings_routes import router as settings_router
from routes.admin_routes import router as admin_router        # ← ADDED

app.include_router(auth_router)
app.include_router(email_router)
app.include_router(followup_router)
app.include_router(billing_router)
app.include_router(analytics_router)
app.include_router(settings_router)
app.include_router(admin_router)                              # ← ADDED

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "replyzen-ai", "version": "1.0.0"}

@app.get("/api/config-status")
async def config_status():
    return get_config_status()
