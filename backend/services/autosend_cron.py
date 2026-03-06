"""
Auto-Send Cron Job Service - Production Ready
Background worker that automatically sends approved follow-up emails.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid

logger = logging.getLogger(__name__)

# Will be set by the main server
db = None


def set_database(database):
    """Set the database reference for the cron service."""
    global db
    db = database


async def get_user_send_window(user_id: str) -> dict:
    """Get user's auto-send settings."""
    settings = await db.user_settings.find_one({"user_id": user_id}, {"_id": 0})
    if not settings:
        return {
            "enabled": False,
            "start": "09:00",
            "end": "18:00",
            "daily_limit": 20,
            "timezone": "UTC"
        }
    return {
        "enabled": settings.get("auto_send", False),
        "start": settings.get("send_window_start", "09:00"),
        "end": settings.get("send_window_end", "18:00"),
        "daily_limit": settings.get("daily_send_limit", 20),
        "timezone": settings.get("timezone", "UTC")
    }


def is_within_send_window(start_time: str, end_time: str) -> bool:
    """Check if current time is within the send window."""
    now = datetime.now(timezone.utc)
    current_time = now.strftime("%H:%M")
    
    # Simple string comparison works for HH:MM format
    if start_time <= end_time:
        return start_time <= current_time <= end_time
    else:
        # Handle overnight windows (e.g., 22:00 - 06:00)
        return current_time >= start_time or current_time <= end_time


async def get_daily_send_count(user_id: str) -> int:
    """Get number of auto-sent emails today for a user."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    count = await db.auto_send_logs.count_documents({
        "user_id": user_id,
        "sent_at": {"$gte": today_start.isoformat()},
        "status": "sent"
    })
    return count


async def log_auto_send(
    user_id: str,
    followup_id: str,
    status: str,
    error: Optional[str] = None
):
    """Log an auto-send attempt."""
    log_entry = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "followup_id": followup_id,
        "status": status,
        "error": error,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.auto_send_logs.insert_one(log_entry)


async def send_followup_email(followup: dict, account: dict) -> bool:
    """Send a follow-up email using Gmail API."""
    from services.gmail_service import send_email, get_message_details
    
    try:
        # Get the thread's last message for reply headers
        thread = await db.email_threads.find_one({"id": followup["thread_id"]}, {"_id": 0})
        if not thread:
            logger.error(f"Thread not found: {followup['thread_id']}")
            return False
        
        # Get recipient from thread
        participants = thread.get("participants", [])
        recipient = None
        for p in participants:
            if p != account.get("email"):
                recipient = p
                break
        
        if not recipient:
            logger.error(f"No recipient found for thread: {followup['thread_id']}")
            return False
        
        # Prepare email
        subject = thread.get("subject", "Follow-up")
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"
        
        # Send via Gmail API
        result = send_email(
            encrypted_tokens={
                "access_token_encrypted": account.get("access_token_encrypted", ""),
                "refresh_token_encrypted": account.get("refresh_token_encrypted", ""),
                "token_expiry": account.get("token_expiry", ""),
            },
            to=recipient,
            subject=subject,
            body=followup.get("draft", ""),
            thread_id=thread.get("gmail_thread_id"),
        )
        
        logger.info(f"Successfully sent follow-up {followup['id']} to {recipient}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send follow-up {followup['id']}: {e}")
        return False


async def process_auto_send_queue():
    """Process the auto-send queue - main cron job function."""
    logger.info("Starting auto-send cron job...")
    
    if db is None:
        logger.error("Database not initialized for auto-send cron")
        return {"processed": 0, "sent": 0, "errors": 0}
    
    processed = 0
    sent = 0
    errors = 0
    
    try:
        # Get all users with auto-send enabled
        users_with_autosend = await db.user_settings.find(
            {"auto_send": True},
            {"_id": 0}
        ).to_list(1000)
        
        for user_settings in users_with_autosend:
            user_id = user_settings.get("user_id")
            if not user_id:
                continue
            
            # Check send window
            send_window = await get_user_send_window(user_id)
            if not send_window["enabled"]:
                continue
            
            if not is_within_send_window(send_window["start"], send_window["end"]):
                logger.debug(f"User {user_id} outside send window")
                continue
            
            # Check daily limit
            daily_count = await get_daily_send_count(user_id)
            if daily_count >= send_window["daily_limit"]:
                logger.debug(f"User {user_id} reached daily limit ({daily_count}/{send_window['daily_limit']})")
                continue
            
            # Get user's email accounts
            accounts = await db.email_accounts.find(
                {"user_id": user_id, "status": "connected"},
                {"_id": 0}
            ).to_list(10)
            
            if not accounts:
                continue
            
            # Get pending follow-ups for this user
            remaining_limit = send_window["daily_limit"] - daily_count
            pending_followups = await db.followup_suggestions.find(
                {"user_id": user_id, "status": "pending"},
                {"_id": 0}
            ).limit(remaining_limit).to_list(remaining_limit)
            
            for followup in pending_followups:
                processed += 1
                
                # Find the account for this followup's thread
                thread = await db.email_threads.find_one(
                    {"id": followup.get("thread_id")},
                    {"_id": 0, "account_id": 1}
                )
                
                if not thread:
                    await log_auto_send(user_id, followup["id"], "error", "Thread not found")
                    errors += 1
                    continue
                
                account = next((a for a in accounts if a["id"] == thread.get("account_id")), None)
                if not account:
                    await log_auto_send(user_id, followup["id"], "error", "Account not found")
                    errors += 1
                    continue
                
                # Attempt to send
                success = await send_followup_email(followup, account)
                
                if success:
                    # Update followup status
                    await db.followup_suggestions.update_one(
                        {"id": followup["id"]},
                        {"$set": {
                            "status": "sent",
                            "sent_at": datetime.now(timezone.utc).isoformat(),
                            "auto_sent": True
                        }}
                    )
                    
                    # Update thread to mark as no longer silent
                    await db.email_threads.update_one(
                        {"id": followup["thread_id"]},
                        {"$set": {
                            "is_silent": False,
                            "last_sender": account.get("email"),
                            "last_message_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    
                    await log_auto_send(user_id, followup["id"], "sent")
                    sent += 1
                else:
                    await log_auto_send(user_id, followup["id"], "error", "Send failed")
                    errors += 1
                
                # Small delay between sends
                await asyncio.sleep(2)
    
    except Exception as e:
        logger.error(f"Auto-send cron job error: {e}")
    
    result = {"processed": processed, "sent": sent, "errors": errors}
    logger.info(f"Auto-send cron job completed: {result}")
    return result


async def run_cron_loop(interval_minutes: int = 30):
    """Run the auto-send cron job in a continuous loop."""
    logger.info(f"Starting auto-send cron loop (interval: {interval_minutes} minutes)")
    
    while True:
        try:
            await process_auto_send_queue()
        except Exception as e:
            logger.error(f"Cron loop error: {e}")
        
        # Wait for next interval
        await asyncio.sleep(interval_minutes * 60)
