"""
models.py — SQLAlchemy ORM model for the users table.

📁 Place this file at: backend/models.py   ← RIGHT NEXT TO auth.py and database.py
"""

from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, SmallInteger, String, Text, ARRAY
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    # ── Primary key ─────────────────────────────────────────────────
    id                          = Column(UUID(as_uuid=True), primary_key=True, nullable=False)

    # ── Supabase / auth fields ───────────────────────────────────────
    instance_id                 = Column(UUID(as_uuid=True),     nullable=True)
    aud                         = Column(String,                  nullable=True)
    role                        = Column(String,                  nullable=True)
    is_super_admin              = Column(Boolean,                 nullable=True)
    is_sso_user                 = Column(Boolean,                 nullable=False, default=False)
    is_anonymous                = Column(Boolean,                 nullable=False, default=False)

    # ── Identity ─────────────────────────────────────────────────────
    email                       = Column(Text,                    nullable=True)
    username                    = Column(Text,                    nullable=True)
    full_name                   = Column(Text,                    nullable=True)
    avatar_url                  = Column(Text,                    nullable=True)
    phone                       = Column(Text,                    nullable=True)
    google_id                   = Column(String,                  nullable=True)
    auth_provider               = Column(Text,                    nullable=True)

    # ── Credentials ──────────────────────────────────────────────────
    password_hash               = Column(Text,                    nullable=True)
    encrypted_password          = Column(String,                  nullable=True)

    # ── Plan ─────────────────────────────────────────────────────────
    plan                        = Column(Text,                    nullable=True, default="free")

    # ── Email confirmation ───────────────────────────────────────────
    email_confirmed_at          = Column(DateTime(timezone=True), nullable=True)
    confirmation_token          = Column(String,                  nullable=True)
    confirmation_sent_at        = Column(DateTime(timezone=True), nullable=True)
    email_change                = Column(String,                  nullable=True)
    email_change_token_new      = Column(String,                  nullable=True)
    email_change_token_current  = Column(String,                  nullable=True)
    email_change_sent_at        = Column(DateTime(timezone=True), nullable=True)
    email_change_confirm_status = Column(SmallInteger,            nullable=True)
    confirmed_at                = Column(DateTime(timezone=True), nullable=True)

    # ── Recovery ─────────────────────────────────────────────────────
    recovery_token              = Column(String,                  nullable=True)
    recovery_sent_at            = Column(DateTime(timezone=True), nullable=True)
    reauthentication_token      = Column(String,                  nullable=True)
    reauthentication_sent_at    = Column(DateTime(timezone=True), nullable=True)

    # ── Phone ────────────────────────────────────────────────────────
    phone_confirmed_at          = Column(DateTime(timezone=True), nullable=True)
    phone_change                = Column(Text,                    nullable=True)
    phone_change_token          = Column(String,                  nullable=True)
    phone_change_sent_at        = Column(DateTime(timezone=True), nullable=True)

    # ── Metadata ─────────────────────────────────────────────────────
    raw_app_meta_data           = Column(JSONB,                   nullable=True)
    raw_user_meta_data          = Column(JSONB,                   nullable=True)

    # ── App-specific settings ────────────────────────────────────────
    follow_up_scope             = Column(Text,                    nullable=True, default="sent_only")
    allowed_contacts            = Column(ARRAY(Text),             nullable=True, default=list)
    allowed_domains             = Column(ARRAY(Text),             nullable=True, default=list)
    blocked_senders             = Column(ARRAY(Text),             nullable=True, default=list)

    # ── Timestamps ───────────────────────────────────────────────────
    invited_at                  = Column(DateTime(timezone=True), nullable=True)
    last_sign_in_at             = Column(DateTime(timezone=True), nullable=True)
    banned_until                = Column(DateTime(timezone=True), nullable=True)
    deleted_at                  = Column(DateTime(timezone=True), nullable=True)
    created_at                  = Column(DateTime(timezone=True), nullable=False)
    updated_at                  = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} plan={self.plan}>"
