from sqlalchemy import text


async def ensure_user_exists(db, user_id: str, email: str = None):
    """
    Ensure the user exists in public.profiles before any FK-dependent inserts.
    - profiles.user_id is the auth.users reference column (NOT profiles.id)
    - Uses ON CONFLICT (user_id) DO NOTHING to safely handle existing users.
    - Falls back to a placeholder email if none is provided.
    - Calls db.flush() so the row is visible within the current transaction.
    """
    fallback_email = email or f"{user_id}@unknown.com"

    query = text("""
        INSERT INTO public.profiles (user_id, email)
        VALUES (:user_id, :email)
        ON CONFLICT (user_id) DO NOTHING
    """)

    await db.execute(query, {
        "user_id": user_id,
        "email": fallback_email,
    })

    await db.flush()  # Makes the row visible within the same transaction
