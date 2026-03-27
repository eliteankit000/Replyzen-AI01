import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail, ArrowRight, ChevronRight, Search, BookOpen,
  Zap, Settings, BarChart3, AlertCircle, Instagram,
  CheckCircle, Clock, Shield, ChevronDown, Menu, X
} from "lucide-react";

/* ─────────────────────────────────────────────
   DOCS CONTENT DATA
───────────────────────────────────────────── */
const SIDEBAR_SECTIONS = [
  {
    title: "Getting Started",
    icon: BookOpen,
    items: [
      { id: "intro",          label: "What is Replyzen?" },
      { id: "quick-start",    label: "Quick Start Guide"  },
      { id: "requirements",   label: "Requirements"        },
    ],
  },
  {
    title: "Platform Integration",
    icon: Instagram,
    items: [
      { id: "connect-instagram", label: "Connect Instagram"   },
      { id: "permissions",       label: "Required Permissions" },
      { id: "disconnect",        label: "Disconnect Account"   },
    ],
  },
  {
    title: "Auto Reply",
    icon: Zap,
    items: [
      { id: "enable-auto-reply",  label: "Enable Auto Reply"   },
      { id: "reply-triggers",     label: "Reply Triggers"       },
      { id: "ai-tone",            label: "Customize AI Tone"    },
      { id: "reply-limits",       label: "Rate Limits"          },
    ],
  },
  {
    title: "Dashboard",
    icon: BarChart3,
    items: [
      { id: "dashboard-overview", label: "Dashboard Overview" },
      { id: "analytics",          label: "Analytics & Stats"   },
      { id: "reply-queue",        label: "Reply Queue"          },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    items: [
      { id: "account-settings",   label: "Account Settings"    },
      { id: "notifications",      label: "Notifications"        },
      { id: "billing",            label: "Billing & Plans"      },
    ],
  },
  {
    title: "Troubleshooting",
    icon: AlertCircle,
    items: [
      { id: "common-issues",      label: "Common Issues"       },
      { id: "reconnect",          label: "Reconnect Account"   },
      { id: "contact-support",    label: "Contact Support"     },
    ],
  },
];

const DOCS_CONTENT = {
  intro: {
    title: "What is Replyzen AI?",
    badge: "Getting Started",
    content: [
      {
        type: "intro",
        text: "Replyzen AI is an intelligent automation platform that detects silent email and social media threads and generates context-aware follow-up responses — so you never miss an opportunity.",
      },
      {
        type: "heading", text: "How it works",
      },
      {
        type: "para",
        text: "Replyzen connects to your email and social accounts via OAuth. It monitors your conversations in real time, detects when a thread has gone quiet, and uses GPT-4o to generate a follow-up draft that sounds exactly like you.",
      },
      {
        type: "steps",
        items: [
          { num: "1", title: "Connect your account",  desc: "Link Gmail or Instagram securely via OAuth." },
          { num: "2", title: "Replyzen monitors",     desc: "The engine scans for unanswered threads." },
          { num: "3", title: "AI drafts a reply",     desc: "GPT-4o generates a context-aware response." },
          { num: "4", title: "You approve & send",    desc: "Review, edit, and send in one click." },
        ],
      },
      {
        type: "heading", text: "Key capabilities",
      },
      {
        type: "bullets",
        items: [
          "Silence detection with configurable delay thresholds (1–10 days)",
          "AI-generated follow-up drafts matching your tone",
          "One-click approve and send via Gmail / Instagram DM",
          "Analytics dashboard tracking response rates",
          "Multi-account support (up to 10 on Business plan)",
        ],
      },
      {
        type: "callout",
        variant: "info",
        text: "🔒 Your email and message content is never stored on our servers. All AI processing happens in-memory and is discarded after the draft is generated.",
      },
    ],
  },
  "quick-start": {
    title: "Quick Start Guide",
    badge: "Getting Started",
    content: [
      { type: "intro", text: "Get Replyzen up and running in under 5 minutes with this step-by-step guide." },
      { type: "heading", text: "Step 1 — Create your account" },
      { type: "para", text: "Go to replyzen.ai and click Get Started Free. Sign in with Google or create an account with your email. No credit card required for the Free plan." },
      { type: "heading", text: "Step 2 — Connect your Gmail" },
      { type: "para", text: "From your dashboard, click Connect Gmail. You'll be redirected to Google's OAuth screen. Grant the requested permissions — Replyzen only requests read and send scopes, never your password." },
      { type: "callout", variant: "warning", text: "⚠️ Make sure to grant all requested permissions. Partial permissions will prevent silence detection from working correctly." },
      { type: "heading", text: "Step 3 — Configure your thresholds" },
      { type: "para", text: "Go to Settings → Auto Reply and set your silence threshold. This is how many days a thread must be quiet before Replyzen flags it. The default is 3 days." },
      { type: "heading", text: "Step 4 — Review your first draft" },
      { type: "para", text: "Once Replyzen detects a silent thread, it will appear in your Reply Queue with an AI-generated draft. Click the draft to review, edit the tone or content, then hit Send." },
      { type: "callout", variant: "success", text: "✅ That's it! You're now fully set up. Replyzen will continue monitoring your inbox and generating drafts automatically." },
    ],
  },
  requirements: {
    title: "Requirements",
    badge: "Getting Started",
    content: [
      { type: "intro", text: "Before using Replyzen, make sure your setup meets the following requirements." },
      { type: "heading", text: "Supported browsers" },
      { type: "bullets", items: ["Google Chrome 90+", "Mozilla Firefox 88+", "Safari 14+", "Microsoft Edge 90+"] },
      { type: "heading", text: "Supported email providers" },
      { type: "bullets", items: ["Gmail (Google Workspace and personal accounts)", "Outlook — coming soon", "IMAP accounts — on roadmap"] },
      { type: "heading", text: "Supported social platforms" },
      { type: "bullets", items: ["Instagram Business accounts", "Instagram Creator accounts", "Personal Instagram accounts — limited support"] },
      { type: "callout", variant: "info", text: "ℹ️ Instagram integration requires a Business or Creator account linked to a Facebook Page. Personal accounts have restricted API access." },
    ],
  },
  "connect-instagram": {
    title: "Connect Instagram",
    badge: "Platform Integration",
    content: [
      { type: "intro", text: "Connect your Instagram Business or Creator account to enable AI-powered comment and DM automation." },
      { type: "heading", text: "Prerequisites" },
      { type: "bullets", items: ["An Instagram Business or Creator account", "A Facebook Page linked to your Instagram account", "Admin access to the Facebook Page"] },
      { type: "heading", text: "Step-by-step connection" },
      { type: "steps", items: [
        { num: "1", title: "Go to Integrations",     desc: "Open Settings → Integrations from your dashboard." },
        { num: "2", title: "Click Connect Instagram", desc: "Click the Instagram tile and then Connect Account." },
        { num: "3", title: "Authorize via Facebook",  desc: "You'll be redirected to Facebook. Log in and grant permissions." },
        { num: "4", title: "Select your page",        desc: "Choose the Facebook Page linked to your Instagram account." },
        { num: "5", title: "Confirm connection",      desc: "Return to Replyzen — your account will show as Connected." },
      ]},
      { type: "callout", variant: "warning", text: "⚠️ If you manage multiple Instagram accounts, repeat this process for each account. Each connection counts as one account slot in your plan." },
    ],
  },
  permissions: {
    title: "Required Permissions",
    badge: "Platform Integration",
    content: [
      { type: "intro", text: "Replyzen requests only the minimum permissions needed to function. Here's exactly what we access and why." },
      { type: "heading", text: "Gmail permissions" },
      { type: "bullets", items: [
        "gmail.readonly — scan threads for silence detection",
        "gmail.send — send follow-up emails on your behalf",
        "gmail.labels — categorise monitored threads",
      ]},
      { type: "heading", text: "Instagram permissions" },
      { type: "bullets", items: [
        "instagram_basic — read your profile and media",
        "instagram_manage_comments — read and reply to comments",
        "instagram_manage_messages — read and send DMs",
        "pages_messaging — required for Facebook-linked DMs",
      ]},
      { type: "callout", variant: "info", text: "🔒 We never request permissions to post content, manage your account settings, or access your friends/followers list." },
    ],
  },
  disconnect: {
    title: "Disconnect Account",
    badge: "Platform Integration",
    content: [
      { type: "intro", text: "You can disconnect any connected account at any time. All associated data is deleted immediately." },
      { type: "heading", text: "How to disconnect" },
      { type: "steps", items: [
        { num: "1", title: "Go to Settings → Integrations", desc: "Find the account you want to disconnect." },
        { num: "2", title: "Click Disconnect",              desc: "Click the three-dot menu next to the account and select Disconnect." },
        { num: "3", title: "Confirm deletion",              desc: "A confirmation dialog will appear. Click Confirm Disconnect." },
      ]},
      { type: "heading", text: "What gets deleted" },
      { type: "bullets", items: [
        "OAuth access token — deleted immediately",
        "Thread metadata — purged within 24 hours",
        "Pending reply drafts — deleted immediately",
        "Historical analytics for this account — retained for 30 days then purged",
      ]},
      { type: "callout", variant: "success", text: "✅ Disconnecting does not cancel your subscription. Your plan remains active for other connected accounts." },
    ],
  },
  "enable-auto-reply": {
    title: "Enable Auto Reply",
    badge: "Auto Reply",
    content: [
      { type: "intro", text: "Auto Reply automatically sends AI-generated responses without requiring your manual approval. Available on Pro and Business plans." },
      { type: "heading", text: "Enable Auto Reply" },
      { type: "steps", items: [
        { num: "1", title: "Go to Settings → Auto Reply", desc: "Toggle Auto Reply to On." },
        { num: "2", title: "Set your threshold",          desc: "Choose how many days of silence before an auto-reply is sent." },
        { num: "3", title: "Choose your tone",            desc: "Select Professional, Friendly, or Casual." },
        { num: "4", title: "Save and activate",           desc: "Click Save. Auto Reply is now live." },
      ]},
      { type: "callout", variant: "warning", text: "⚠️ Auto Reply sends without your review. We recommend running in Draft Mode for the first week to verify AI quality before enabling full automation." },
    ],
  },
  "reply-triggers": {
    title: "Reply Triggers",
    badge: "Auto Reply",
    content: [
      { type: "intro", text: "Reply Triggers define when Replyzen generates a follow-up. You can customise triggers per account or set global defaults." },
      { type: "heading", text: "Available triggers" },
      { type: "bullets", items: [
        "Silence threshold — no reply after N days (default: 3 days)",
        "Keyword detection — thread contains specific words (e.g. 'interested', 'demo')",
        "Sender type — trigger only for new contacts or existing contacts",
        "Thread stage — first follow-up, second follow-up, or final follow-up",
      ]},
      { type: "heading", text: "Combining triggers" },
      { type: "para", text: "You can combine triggers with AND / OR logic. For example: trigger when silence > 2 days AND sender is a new contact. This prevents over-following-up with existing warm relationships." },
    ],
  },
  "ai-tone": {
    title: "Customize AI Tone",
    badge: "Auto Reply",
    content: [
      { type: "intro", text: "Replyzen's AI adapts to your communication style. Choose from preset tones or define a custom tone using a sample of your own writing." },
      { type: "heading", text: "Preset tones" },
      { type: "bullets", items: [
        "Professional — formal, clear, concise. Best for B2B outreach.",
        "Friendly — warm, approachable, conversational. Best for SMB sales.",
        "Casual — relaxed, direct, informal. Best for startup founders.",
        "Persuasive — outcome-focused, benefit-driven. Best for closing deals.",
      ]},
      { type: "heading", text: "Custom tone (Pro & Business)" },
      { type: "para", text: "Paste 3–5 examples of your own emails in Settings → AI Tone → Custom. The AI will learn your phrasing patterns, sentence length preferences, and signature style." },
    ],
  },
  "reply-limits": {
    title: "Rate Limits",
    badge: "Auto Reply",
    content: [
      { type: "intro", text: "Replyzen enforces sending limits to protect your email reputation and comply with Gmail and Instagram API policies." },
      { type: "heading", text: "Per-account daily limits" },
      { type: "bullets", items: [
        "Free — 10 follow-ups/day, 30/month",
        "Pro — 100 follow-ups/day, 5,000/month",
        "Business — 500 follow-ups/day, unlimited/month",
      ]},
      { type: "callout", variant: "warning", text: "⚠️ Sending too many follow-ups too quickly can trigger spam filters. Replyzen automatically spaces sends using a randomised delay of 3–8 minutes between messages." },
    ],
  },
  "dashboard-overview": {
    title: "Dashboard Overview",
    badge: "Dashboard",
    content: [
      { type: "intro", text: "The Replyzen dashboard gives you a bird's-eye view of all your monitored threads, pending drafts, and follow-up performance." },
      { type: "heading", text: "Dashboard sections" },
      { type: "bullets", items: [
        "Reply Queue — threads waiting for a follow-up, sorted by urgency",
        "Draft Ready — AI drafts ready for your review and approval",
        "Sent — successfully sent follow-ups and their response status",
        "Analytics — reply rates, open rates, and thread outcomes",
        "Accounts — all connected Gmail and Instagram accounts",
      ]},
      { type: "heading", text: "Status indicators" },
      { type: "bullets", items: [
        "🟡 Waiting — thread detected, threshold not yet reached",
        "🔴 Urgent — silence threshold exceeded, draft ready",
        "🟢 Replied — contact has responded after follow-up",
        "⚪ Closed — thread manually marked as resolved",
      ]},
    ],
  },
  analytics: {
    title: "Analytics & Stats",
    badge: "Dashboard",
    content: [
      { type: "intro", text: "Track the performance of your follow-up campaigns with detailed analytics built into your dashboard." },
      { type: "heading", text: "Available metrics" },
      { type: "bullets", items: [
        "Reply Rate — percentage of follow-ups that received a response",
        "Average Response Time — how quickly contacts reply after your follow-up",
        "Follow-up Volume — total follow-ups sent per day/week/month",
        "Thread Outcomes — deals closed, meetings booked, no response",
        "Top Performing Tone — which AI tone gets the most replies",
      ]},
      { type: "callout", variant: "info", text: "📊 Analytics data is retained for 90 days on Free, 1 year on Pro, and indefinitely on Business." },
    ],
  },
  "reply-queue": {
    title: "Reply Queue",
    badge: "Dashboard",
    content: [
      { type: "intro", text: "The Reply Queue is the heart of Replyzen — it shows every thread that needs attention, ranked by urgency." },
      { type: "heading", text: "Queue columns" },
      { type: "bullets", items: [
        "Contact — name and email/handle of the person you're following up with",
        "Subject / Thread — the topic of the conversation",
        "Silent for — how many days since their last message",
        "Draft — AI-generated reply preview",
        "Action — Approve & Send, Edit, or Dismiss",
      ]},
      { type: "heading", text: "Bulk actions" },
      { type: "para", text: "Select multiple threads and use the Bulk Approve button to send all approved drafts at once. Replyzen will automatically space the sends to avoid spam triggers." },
    ],
  },
  "account-settings": {
    title: "Account Settings",
    badge: "Settings",
    content: [
      { type: "intro", text: "Manage your Replyzen profile, notification preferences, and connected accounts from the Settings panel." },
      { type: "heading", text: "Profile settings" },
      { type: "bullets", items: [
        "Display name — shown in your dashboard and reports",
        "Email address — used for account notifications and billing",
        "Password — change your login password",
        "Two-factor authentication — adds an extra layer of account security",
      ]},
      { type: "heading", text: "Delete account" },
      { type: "para", text: "To permanently delete your account, go to Settings → Account → Delete Account. All your data, connected accounts, and billing history will be permanently erased within 30 days." },
      { type: "callout", variant: "warning", text: "⚠️ Account deletion is irreversible. Export your analytics data before proceeding." },
    ],
  },
  notifications: {
    title: "Notifications",
    badge: "Settings",
    content: [
      { type: "intro", text: "Control when and how Replyzen notifies you about new drafts, sent replies, and account activity." },
      { type: "heading", text: "Notification types" },
      { type: "bullets", items: [
        "New draft ready — when AI generates a reply waiting for your approval",
        "Auto-reply sent — when Auto Reply sends a message on your behalf",
        "Contact replied — when a follow-up receives a response",
        "Weekly digest — summary of your follow-up performance",
        "Security alerts — login from new device, password changes",
      ]},
      { type: "heading", text: "Notification channels" },
      { type: "bullets", items: ["Email notifications", "In-app notifications (dashboard bell icon)", "Browser push notifications (optional)"] },
    ],
  },
  billing: {
    title: "Billing & Plans",
    badge: "Settings",
    content: [
      { type: "intro", text: "Manage your subscription, upgrade your plan, and view your billing history from the Billing section." },
      { type: "heading", text: "Upgrade your plan" },
      { type: "para", text: "Go to Settings → Billing → Upgrade. Select your new plan and billing cycle (monthly or yearly — save 17% yearly). Payment is processed securely via Razorpay." },
      { type: "heading", text: "Cancel subscription" },
      { type: "para", text: "You can cancel at any time. Go to Settings → Billing → Cancel Subscription. You'll retain access until the end of your current billing period." },
      { type: "callout", variant: "info", text: "💳 We accept all major credit/debit cards and UPI (India). All transactions are SSL encrypted." },
    ],
  },
  "common-issues": {
    title: "Common Issues",
    badge: "Troubleshooting",
    content: [
      { type: "intro", text: "Here are the most common issues users encounter and how to resolve them." },
      { type: "heading", text: "Gmail not connecting" },
      { type: "bullets", items: [
        "Ensure you grant all permissions on the Google OAuth screen",
        "Try signing out of Google and reconnecting",
        "Check that your Google account does not have advanced security restrictions (e.g. Google Workspace admin restrictions)",
      ]},
      { type: "heading", text: "No threads appearing in queue" },
      { type: "bullets", items: [
        "Check that your silence threshold is set correctly (default: 3 days)",
        "Ensure the connected Gmail account is the one with active threads",
        "Wait up to 30 minutes for the first scan to complete after connection",
      ]},
      { type: "heading", text: "AI tone doesn't sound like me" },
      { type: "bullets", items: [
        "Try switching to a different preset tone",
        "Use the Custom Tone feature (Pro/Business) with your own writing samples",
        "Edit individual drafts — the AI learns from your edits over time",
      ]},
    ],
  },
  reconnect: {
    title: "Reconnect Account",
    badge: "Troubleshooting",
    content: [
      { type: "intro", text: "If your connected account shows a disconnected or expired status, follow these steps to reconnect." },
      { type: "heading", text: "Why accounts disconnect" },
      { type: "bullets", items: [
        "OAuth token expired (Gmail tokens expire after 60 days of inactivity)",
        "You changed your Google or Instagram password",
        "You revoked Replyzen's access from Google Account Settings",
        "Instagram refresh token expired",
      ]},
      { type: "heading", text: "How to reconnect" },
      { type: "steps", items: [
        { num: "1", title: "Go to Settings → Integrations",   desc: "Find the disconnected account (shown with a red indicator)." },
        { num: "2", title: "Click Reconnect",                  desc: "Click the Reconnect button next to the account." },
        { num: "3", title: "Re-authorize",                     desc: "Complete the OAuth flow again. Your settings and history are preserved." },
      ]},
    ],
  },
  "contact-support": {
    title: "Contact Support",
    badge: "Troubleshooting",
    content: [
      { type: "intro", text: "Can't find what you're looking for? Our support team is here to help." },
      { type: "heading", text: "Support channels" },
      { type: "bullets", items: [
        "Email — hello@replyzenai.com (response within 24h)",
        "Live chat — available in-dashboard for Pro & Business users",
        "Help center — this documentation site",
      ]},
      { type: "heading", text: "What to include in your support request" },
      { type: "bullets", items: [
        "Your account email address",
        "A description of the issue",
        "Steps you've already tried",
        "Screenshot or screen recording (if applicable)",
      ]},
      { type: "callout", variant: "info", text: "📬 Business plan users receive priority support with a guaranteed 4-hour response time during business hours." },
    ],
  },
};

/* ─────────────────────────────────────────────
   CONTENT RENDERER
───────────────────────────────────────────── */
function DocContent({ contentKey }) {
  const page = DOCS_CONTENT[contentKey] || DOCS_CONTENT["intro"];
  return (
    <div className="space-y-6">
      <div>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary">{page.badge}</span>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold">{page.title}</h1>
      </div>
      <div className="h-px bg-border" />
      {page.content.map((block, i) => {
        if (block.type === "intro")   return <p key={i} className="text-base text-muted-foreground leading-relaxed">{block.text}</p>;
        if (block.type === "para")    return <p key={i} className="text-sm text-muted-foreground leading-relaxed">{block.text}</p>;
        if (block.type === "heading") return <h2 key={i} className="text-lg font-bold mt-2">{block.text}</h2>;
        if (block.type === "bullets") return (
          <ul key={i} className="space-y-2">
            {block.items.map((item, j) => (
              <li key={j} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        );
        if (block.type === "steps") return (
          <div key={i} className="space-y-4">
            {block.items.map((s, j) => (
              <div key={j} className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{s.num}</div>
                <div className="pt-1">
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        );
        if (block.type === "callout") {
          const styles = {
            info:    "border-primary/30 bg-primary/5 text-primary/80",
            warning: "border-yellow-500/30 bg-yellow-500/5 text-yellow-500/90",
            success: "border-green-500/30 bg-green-500/5 text-green-600",
          };
          return (
            <div key={i} className={`rounded-xl border px-5 py-4 text-sm font-medium leading-relaxed ${styles[block.variant]}`}>
              {block.text}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────── */
export default function DocsPage() {
  const navigate = useNavigate();
  const [activeId, setActiveId]       = useState("intro");
  const [openSections, setOpenSections] = useState(() => SIDEBAR_SECTIONS.map((_, i) => i));
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [scrolled, setScrolled]       = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const toggleSection = (i) =>
    setOpenSections(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);

  const filteredSections = SIDEBAR_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(s => s.items.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        body{font-family:'Instrument Sans',system-ui,sans-serif}
        .rz-nav-blur{backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);background:rgba(var(--background-rgb,0,0,0),.82);border-bottom:1px solid transparent;transition:border-color .3s,box-shadow .3s}
        .rz-nav-blur.scrolled{border-color:var(--border);box-shadow:0 2px 20px rgba(0,0,0,.12)}
        .doc-sidebar-item{transition:all .15s ease}
        .doc-sidebar-item:hover{color:var(--foreground)}
        .doc-sidebar-item.active{color:var(--primary);background:color-mix(in srgb,var(--primary) 8%,transparent);font-weight:600}
      `}</style>

      {/* ── NAVBAR ── */}
      <nav className={`rz-nav-blur fixed top-0 left-0 right-0 z-50 ${scrolled ? "scrolled" : ""}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
                <Mail className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">Replyzen AI</span>
            </div>
            <div className="hidden md:flex items-center gap-1">
              <Badge variant="secondary" className="text-xs font-semibold">Docs</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="font-medium hidden md:flex">Log in</Button>
            <Button size="sm" onClick={() => navigate("/login")} className="bg-primary hover:bg-primary/90 text-white font-semibold hidden md:flex">
              Get Started <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
            <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* ── MAIN LAYOUT ── */}
      <div className="pt-16 max-w-7xl mx-auto flex">

        {/* ── SIDEBAR ── */}
        <aside className={`
          fixed md:sticky top-16 left-0 z-40 h-[calc(100vh-4rem)] w-72 shrink-0
          bg-background md:bg-transparent border-r border-border overflow-y-auto
          transition-transform duration-300 md:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}>
          <div className="p-5 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search docs…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
              />
            </div>

            {/* Nav sections */}
            {filteredSections.map((section, si) => (
              <div key={section.title}>
                <button
                  onClick={() => toggleSection(si)}
                  className="w-full flex items-center justify-between py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <section.icon className="w-3.5 h-3.5" />
                    {section.title}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openSections.includes(si) ? "rotate-180" : ""}`} />
                </button>
                {openSections.includes(si) && (
                  <ul className="mt-1 space-y-0.5 pl-5 border-l border-border ml-1.5">
                    {section.items.map(item => (
                      <li key={item.id}>
                        <button
                          onClick={() => { setActiveId(item.id); setMobileOpen(false); window.scrollTo({ top: 0 }); }}
                          className={`doc-sidebar-item w-full text-left px-3 py-2 rounded-lg text-sm text-muted-foreground ${activeId === item.id ? "active" : ""}`}
                        >
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* ── CONTENT ── */}
        <main className="flex-1 min-w-0 px-6 md:px-12 py-10 max-w-3xl">
          <DocContent contentKey={activeId} />

          {/* Prev / Next nav */}
          <div className="mt-14 pt-8 border-t border-border flex items-center justify-between gap-4 flex-wrap">
            <a href="/guides" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group">
              <ChevronRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
              Guides
            </a>
            <div className="text-xs text-muted-foreground">Was this page helpful?
              <button className="ml-2 text-primary hover:underline">Yes</button>
              <span className="mx-1 text-border">·</span>
              <button className="text-primary hover:underline">No</button>
            </div>
          </div>
        </main>
      </div>

      {/* ── FOOTER ── */}
      <footer className="py-10 px-6 border-t border-border bg-card mt-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold">Replyzen AI</span>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Replyzen AI. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <a href="/privacy-policy"   className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
            <a href="/terms-of-service" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
            <a href="/support"          className="text-xs text-muted-foreground hover:text-foreground transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
