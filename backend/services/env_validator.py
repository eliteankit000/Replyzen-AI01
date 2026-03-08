"""
Environment Validation - Production Ready
Validates all critical environment variables at startup.
"""
import os
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)


def validate_environment() -> Tuple[bool, List[str], List[str]]:
    """
    Validate all critical environment variables.
    Returns: (is_valid, errors, warnings)
    """
    errors = []
    warnings = []
    
    # Critical variables - app won't work without these
    critical_vars = {
    "SUPABASE_DB_URL": "Supabase PostgreSQL connection string",
    "SUPABASE_URL": "Supabase project URL",
    "SUPABASE_SERVICE_ROLE_KEY": "Supabase service role key",
    "JWT_SECRET": "JWT signing secret",
}
    
    # Important variables - features may not work
    important_vars = {
        "OPENAI_API_KEY": "OpenAI API key for AI features",
        "RAZORPAY_KEY_ID": "Razorpay key ID for payments",
        "RAZORPAY_KEY_SECRET": "Razorpay key secret for payments",
        "RAZORPAY_PLAN_PRO_MONTHLY": "Razorpay Pro monthly plan ID",
        "RAZORPAY_PLAN_PRO_YEARLY": "Razorpay Pro yearly plan ID",
        "RAZORPAY_PLAN_BUSINESS_MONTHLY": "Razorpay Business monthly plan ID",
        "RAZORPAY_PLAN_BUSINESS_YEARLY": "Razorpay Business yearly plan ID",
        "PADDLE_API_KEY": "Paddle API key for international payments",
        "PADDLE_PRICE_PRO_MONTHLY": "Paddle Pro monthly price ID",
        "PADDLE_PRICE_PRO_YEARLY": "Paddle Pro yearly price ID",
        "PADDLE_PRICE_BUSINESS_MONTHLY": "Paddle Business monthly price ID",
        "PADDLE_PRICE_BUSINESS_YEARLY": "Paddle Business yearly price ID",
        "GMAIL_CLIENT_ID": "Google OAuth client ID",
        "GMAIL_CLIENT_SECRET": "Google OAuth client secret",
        "ENCRYPTION_KEY": "Token encryption key",
    }
    
    # Optional variables - nice to have
    optional_vars = {
        "RAZORPAY_WEBHOOK_SECRET": "Razorpay webhook signature verification",
        "PADDLE_WEBHOOK_SECRET": "Paddle webhook signature verification",
        "BREVO_API_KEY": "Brevo API key for email notifications",
        "GMAIL_REDIRECT_URI": "Gmail OAuth redirect URI",
    }
    
    # Check critical variables
    for var, desc in critical_vars.items():
        value = os.environ.get(var, "")
        if not value:
            errors.append(f"CRITICAL: Missing {var} - {desc}")
        elif value.startswith('"') or value.endswith('"'):
            warnings.append(f"{var} contains quotes - remove them from .env")
    
    # Check important variables
    for var, desc in important_vars.items():
        value = os.environ.get(var, "")
        if not value:
            warnings.append(f"Missing {var} - {desc}")
        elif "placeholder" in value.lower() or "xxx" in value.lower():
            warnings.append(f"{var} appears to be a placeholder value")
    
    # Log results
    if errors:
        for err in errors:
            logger.error(err)
    
    if warnings:
        for warn in warnings:
            logger.warning(warn)
    
    is_valid = len(errors) == 0
    
    if is_valid:
        logger.info("Environment validation passed")
    else:
        logger.error("Environment validation failed - app may not function correctly")
    
    return is_valid, errors, warnings


def get_config_status() -> Dict:
    """Get status of all configuration variables."""
    config_groups = {
        "database": {
    "SUPABASE_DB_URL": bool(os.environ.get("SUPABASE_DB_URL")),
    "SUPABASE_URL": bool(os.environ.get("SUPABASE_URL")),
    "SUPABASE_SERVICE_ROLE_KEY": bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY")),
        },
        
        "auth": {
            "JWT_SECRET": bool(os.environ.get("JWT_SECRET")),
        },
        "ai": {
            "OPENAI_API_KEY": bool(os.environ.get("OPENAI_API_KEY")),
        },
        "razorpay": {
            "RAZORPAY_KEY_ID": bool(os.environ.get("RAZORPAY_KEY_ID")),
            "RAZORPAY_KEY_SECRET": bool(os.environ.get("RAZORPAY_KEY_SECRET")),
            "RAZORPAY_PLAN_PRO_MONTHLY": bool(os.environ.get("RAZORPAY_PLAN_PRO_MONTHLY")),
            "RAZORPAY_PLAN_PRO_YEARLY": bool(os.environ.get("RAZORPAY_PLAN_PRO_YEARLY")),
            "RAZORPAY_PLAN_BUSINESS_MONTHLY": bool(os.environ.get("RAZORPAY_PLAN_BUSINESS_MONTHLY")),
            "RAZORPAY_PLAN_BUSINESS_YEARLY": bool(os.environ.get("RAZORPAY_PLAN_BUSINESS_YEARLY")),
            "RAZORPAY_WEBHOOK_SECRET": bool(os.environ.get("RAZORPAY_WEBHOOK_SECRET")),
        },
        "paddle": {
            "PADDLE_API_KEY": bool(os.environ.get("PADDLE_API_KEY")),
            "PADDLE_VENDOR_ID": bool(os.environ.get("PADDLE_VENDOR_ID")),
            "PADDLE_PRICE_PRO_MONTHLY": bool(os.environ.get("PADDLE_PRICE_PRO_MONTHLY")),
            "PADDLE_PRICE_PRO_YEARLY": bool(os.environ.get("PADDLE_PRICE_PRO_YEARLY")),
            "PADDLE_PRICE_BUSINESS_MONTHLY": bool(os.environ.get("PADDLE_PRICE_BUSINESS_MONTHLY")),
            "PADDLE_PRICE_BUSINESS_YEARLY": bool(os.environ.get("PADDLE_PRICE_BUSINESS_YEARLY")),
            "PADDLE_WEBHOOK_SECRET": bool(os.environ.get("PADDLE_WEBHOOK_SECRET")),
        },
        "google": {
            "GMAIL_CLIENT_ID": bool(os.environ.get("GMAIL_CLIENT_ID")),
            "GMAIL_CLIENT_SECRET": bool(os.environ.get("GMAIL_CLIENT_SECRET")),
            "GMAIL_REDIRECT_URI": bool(os.environ.get("GMAIL_REDIRECT_URI")),
        },
        "security": {
            "ENCRYPTION_KEY": bool(os.environ.get("ENCRYPTION_KEY")),
        },
        "email": {
            "BREVO_API_KEY": bool(os.environ.get("BREVO_API_KEY")),
        },
    }
    
    # Calculate completion percentage for each group
    result = {}
    for group, vars_dict in config_groups.items():
        configured = sum(1 for v in vars_dict.values() if v)
        total = len(vars_dict)
        result[group] = {
            "configured": configured,
            "total": total,
            "percentage": round((configured / total) * 100) if total > 0 else 0,
            "variables": vars_dict
        }
    
    return result
