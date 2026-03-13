from sqlalchemy import text

async def ensure_user_exists(db, user_id, email=None):
    query = text("""
        INSERT INTO users (id, email)
        VALUES (:id, :email)
        ON CONFLICT (id) DO NOTHING
    """)

    await db.execute(query, {
        "id": user_id,
        "email": email
    })
