import uuid
from datetime import datetime, timezone, timedelta
import random

MOCK_CONTACTS = [
    {"name": "Sarah Chen", "email": "sarah.chen@acme.co"},
    {"name": "James Wilson", "email": "james.w@techstart.io"},
    {"name": "Emily Rodriguez", "email": "emily.r@designhub.com"},
    {"name": "Michael Park", "email": "m.park@cloudnine.dev"},
    {"name": "Lisa Thompson", "email": "lisa.t@marketwise.co"},
    {"name": "David Kumar", "email": "david.k@finova.in"},
    {"name": "Rachel Green", "email": "rachel@brightpath.com"},
    {"name": "Tom Bradley", "email": "tom.b@nextstep.io"},
    {"name": "Priya Sharma", "email": "priya.s@growthlab.co"},
    {"name": "Alex Morgan", "email": "alex.m@buildright.dev"},
    {"name": "Nina Patel", "email": "nina@venturehub.com"},
    {"name": "Chris Taylor", "email": "chris.t@salesforce.com"},
]

MOCK_SUBJECTS = [
    "Partnership opportunity discussion",
    "Q1 Budget proposal review",
    "Follow up: Product demo feedback",
    "Re: Contract renewal terms",
    "Meeting notes from Tuesday",
    "Proposal for new integration",
    "Re: Pricing discussion",
    "Content collaboration idea",
    "Re: Client onboarding timeline",
    "Strategy deck for Q2",
    "Re: Feature request from team",
    "Invoice #4521 - Payment pending",
    "Re: Hiring pipeline update",
    "Website redesign proposal",
    "Re: Marketing campaign results",
]

MOCK_SNIPPETS = [
    "Thanks for sharing the proposal. I'll review it with the team and get back to you by end of week.",
    "The demo looked great! Let me discuss internally and circle back on next steps.",
    "I've attached the updated pricing sheet. Let me know your thoughts when you get a chance.",
    "Great meeting today. I'll send over the action items and timeline shortly.",
    "Sounds good! I'll check with our legal team and confirm the terms.",
    "Really appreciate the detailed breakdown. Need a few days to run the numbers.",
    "Love the direction. Let me loop in our design team for their input.",
    "Thanks for the update. I'll review the candidates and share feedback soon.",
    "The timeline works for us. Just need to confirm budget allocation first.",
    "Interesting approach! Let me think about this and we can reconnect next week.",
]


def generate_mock_threads(user_id: str, account_id: str, user_email: str) -> list:
    threads = []
    now = datetime.now(timezone.utc)
    used_contacts = random.sample(MOCK_CONTACTS, min(len(MOCK_CONTACTS), 12))
    used_subjects = random.sample(MOCK_SUBJECTS, min(len(MOCK_SUBJECTS), 12))

    for i in range(min(12, len(used_contacts))):
        contact = used_contacts[i]
        subject = used_subjects[i] if i < len(used_subjects) else f"Thread #{i+1}"
        days_ago = random.randint(1, 14)
        is_silent = i < 8  # First 8 are silent
        snippet = random.choice(MOCK_SNIPPETS)

        thread = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "account_id": account_id,
            "subject": subject,
            "participants": [user_email, contact["email"]],
            "participant_names": [contact["name"]],
            "last_message_at": (now - timedelta(days=days_ago)).isoformat(),
            "last_sender": user_email if is_silent else contact["email"],
            "is_silent": is_silent,
            "days_silent": days_ago if is_silent else 0,
            "snippet": snippet,
            "category": "primary",
            "message_count": random.randint(2, 8),
            "created_at": (now - timedelta(days=days_ago + random.randint(5, 30))).isoformat(),
            "updated_at": (now - timedelta(days=days_ago)).isoformat(),
        }
        threads.append(thread)

    return threads
