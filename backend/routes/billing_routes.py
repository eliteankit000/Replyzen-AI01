@router.get("/plan-limits")
async def get_plan_limits(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user["user_id"]

    # get user plan
    result = await db.execute(
        text("SELECT plan FROM users WHERE id = :uid"),
        {"uid": user_id}
    )
    row = result.fetchone()
    plan = str(row[0]) if row else "free"

    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])

    # count followups used this month
    usage_result = await db.execute(
        text("""
        SELECT COUNT(*)
        FROM email_threads
        WHERE user_id = :uid
        AND needs_followup = true
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        """),
        {"uid": user_id}
    )

    followups_used = usage_result.scalar() or 0

    return {
        "plan": plan,
        "followups_used": followups_used,
        **limits
    }
