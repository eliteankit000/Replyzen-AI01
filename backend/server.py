from fastapi import FastAPI
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from database import client

app = FastAPI(title="Replyzen AI API", version="1.0.0")

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

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "replyzen-ai", "version": "1.0.0"}


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
