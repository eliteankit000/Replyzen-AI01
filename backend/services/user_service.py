from sqlalchemy import text


async def ensure_user_exists(db, user_id: str, email: str = None):
    """
    Ensure the user exists in the users table before any FK-dependent inserts.
    - Uses ON CONFLICT DO NOTHING to safely handle existing users.
    - Falls back to a placeholder email if none is provided.
    - Calls db.flush() so the row is visible within the current transaction.
    """
    fallback_email = email or f"{user_id}@unknown.com"  # ✅ FIX: never insert NULL email

    query = text("""
        INSERT INTO users (id, email)
        VALUES (:id, :email)
        ON CONFLICT (id) DO NOTHING
    """)

    await db.execute(query, {
        "id": user_id,
        "email": fallback_email,
    })

    await db.flush()  # ✅ FIX: makes the user row visible within the same transaction
