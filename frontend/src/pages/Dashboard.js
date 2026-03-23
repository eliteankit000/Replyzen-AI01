import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsAPI, emailAPI, followupAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare, Mail, Send, TrendingUp, Clock, Zap,
  ArrowRight, Plus, RefreshCw, AlertCircle, CheckCircle2,
  Bot, EyeOff, Flame, Activity, BarChart3, User, Users,
} from "lucide-react";
import { toast } from "sonner";

/* ─────────────────────────────────────────────────────────────
   HELPERS — parse display name from RFC 5322 email header
   "John Doe <john@example.com>"  →  "John Doe"
   "<john@example.com>"           →  "john@example.com"
   "john@example.com"             →  "john@example.com"
   Handles multiple recipients:   "A, B" → "A, B"
───────────────────────────────────────────────────────────── */
function parseDisplayName(header) {
  if (!header) return "";
  const h = header.trim();
  if (h.includes("<")) {
    const name = h.slice(0, h.indexOf("<")).trim().replace(/^"|"$/g, "");
    if (name) return name;
    return h.slice(h.indexOf("<") + 1, h.indexOf(">")).trim();
  }
  return h;
}

/** For a comma-separated To header, return first name only */
function parseFirstRecipient(header) {
  if (!header) return "";
  const first = header.split(",")[0];
  return parseDisplayName(first);
}

/* ─────────────────────────────────────────────────────────────
   BADGE COMPONENTS
───────────────────────────────────────────────────────────── */
function PriorityBadge({ level }) {
  const cfg = {
    high:   { label: "🔥 High",   cls: "bg-red-50 text-red-700 border-red-200" },
    medium: { label: "⚡ Medium", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    low:    { label: "💤 Low",    cls: "bg-gray-50 text-gray-500 border-gray-200" },
  };
  const c = cfg[level] || cfg.low;
  return <Badge variant="outline" className={`${c.cls} text-xs shrink-0`}>{c.label}</Badge>;
}

function TypeBadge({ type }) {
  const cfg = {
    client_proposal: { label: "Proposal",    cls: "bg-purple-50 text-purple-700 border-purple-200" },
    payment:         { label: "Payment",     cls: "bg-green-50 text-green-700 border-green-200"   },
    interview:       { label: "Interview",   cls: "bg-blue-50 text-blue-700 border-blue-200"      },
    lead:            { label: "Lead",        cls: "bg-orange-50 text-orange-700 border-orange-200"},
    partnership:     { label: "Partnership", cls: "bg-pink-50 text-pink-700 border-pink-200"      },
    other:           { label: "General",     cls: "bg-gray-50 text-gray-600 border-gray-200"      },
  };
  if (!type || type === "notification" || type === "newsletter") return null;
  const c = cfg[type] || cfg.other;
  return <Badge variant="outline" className={`${c.cls} text-xs shrink-0`}>{c.label}</Badge>;
}

function ThreadStatusBadge({ status }) {
  const cfg = {
    needs_reply:        { label: "Needs Reply", cls: "bg-amber-50 text-amber-700 border-amber-200",       Icon: AlertCircle  },
    replied:            { label: "Replied",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    awaiting_response:  { label: "Awaiting",   cls: "bg-blue-50 text-blue-700 border-blue-200",           Icon: Clock        },
    follow_up_scheduled:{ label: "Scheduled",  cls: "bg-purple-50 text-purple-700 border-purple-200",     Icon: Zap          },
    dismissed:          { label: "Dismissed",  cls: "bg-gray-50 text-gray-500 border-gray-200",           Icon: EyeOff       },
    automated:          { label: "Auto",       cls: "bg-gray-50 text-gray-400 border-gray-200",           Icon: Bot          },
    reply_pending:      { label: "Draft Ready",cls: "bg-orange-50 text-orange-700 border-orange-200",     Icon: Zap          },
  };
  const c = cfg[status] || cfg.needs_reply;
  const Icon = c.Icon;
  return (
    <Badge variant="outline" className={`${c.cls} text-xs`}>
      <Icon className="w-3 h-3 mr-1" />{c.label}
    </Badge>
  );
}

/* ─────────────────────────────────────────────────────────────
   STAT CARD
───────────────────────────────────────────────────────────── */
function StatCard({ label, value, icon: Icon, color, bg, micro, loading, testId, index }) {
  return (
    <div
      data-testid={testId}
      className="group rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md animate-fade-in"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          {loading
            ? <Skeleton className="h-8 w-16 mt-1" />
            : <p className="text-3xl font-bold tracking-tight mt-1">{value}</p>}
          <p className="text-xs text-muted-foreground leading-relaxed">{micro}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0 ml-3`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PRIORITY ACTION BAR
───────────────────────────────────────────────────────────── */
function ActionBar({ highPriority, total, loading, onNavigate }) {
  if (loading) return <Skeleton className="h-12 w-full rounded-xl" />;

  if (total === 0) {
    return (
      <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-emerald-50 border border-emerald-100">
        <span className="text-lg">🎉</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-emerald-800">You're all caught up</p>
          <p className="text-xs text-emerald-600 mt-0.5">No conversations need attention right now</p>
        </div>
      </div>
    );
  }

  if (highPriority > 0) {
    return (
      <div
        className="flex items-center gap-3 px-5 py-3 rounded-xl bg-red-50 border border-red-100 cursor-pointer hover:bg-red-100/70 transition-colors"
        onClick={onNavigate}
      >
        <span className="text-lg">🔥</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-800">
            {highPriority} high-priority conversation{highPriority !== 1 ? "s" : ""} need your attention
          </p>
          <p className="text-xs text-red-600 mt-0.5">Act now to keep momentum</p>
        </div>
        <ArrowRight className="w-4 h-4 text-red-500 shrink-0" />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-5 py-3 rounded-xl bg-amber-50 border border-amber-100 cursor-pointer hover:bg-amber-100/70 transition-colors"
      onClick={onNavigate}
    >
      <span className="text-lg">⏳</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800">
          {total} conversation{total !== 1 ? "s" : ""} waiting for follow-up
        </p>
        <p className="text-xs text-amber-600 mt-0.5">Review and take action</p>
      </div>
      <ArrowRight className="w-4 h-4 text-amber-500 shrink-0" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   OPPORTUNITY ROW
   ✅ FIXED:
     - Subject always shown prominently
     - Sender name parsed from "Name <email>" → shows "Name"
     - Recipient name parsed and shown (To: ...)
     - Falls back gracefully if fields are missing
───────────────────────────────────────────────────────────── */
function OpportunityRow({ thread, onClick }) {
  const context = thread.opportunity_context || "";

  // ── Resolve subject ──────────────────────────────────────────────────
  const subject = thread.subject?.trim() || "(No subject)";

  // ── Resolve sender display name ──────────────────────────────────────
  // last_message_from may be:
  //   A) Already a clean name if the new backend is deployed: "John Doe"
  //   B) An RFC 5322 header from old data:  "John Doe <john@example.com>"
  //   C) A bare email address:              "john@example.com"
  // parseDisplayName() handles all three cases.
  const senderRaw    = thread.last_message_from || "";
  const senderName   = parseDisplayName(senderRaw) || senderRaw || "Unknown sender";

  // ── Resolve recipient display name ───────────────────────────────────
  // to_email may come from new backend field, or participant_names array.
  const recipientRaw  = thread.to_email
    || (Array.isArray(thread.participant_names) && thread.participant_names.length > 1
        ? thread.participant_names[1]
        : null)
    || "";
  const recipientName = parseFirstRecipient(recipientRaw);

  // ── Days label ───────────────────────────────────────────────────────
  const daysLabel = thread.days_silent >= 7
    ? `${thread.days_silent}d silent`
    : thread.days_silent >= 3
    ? `${thread.days_silent}d waiting`
    : `${thread.days_silent}d`;

  const daysCls = thread.days_silent >= 7
    ? "bg-red-50 text-red-600 border-red-100"
    : thread.days_silent >= 3
    ? "bg-amber-50 text-amber-600 border-amber-100"
    : "bg-muted text-muted-foreground border-border";

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer group"
      onClick={onClick}
      data-testid={`thread-${thread.id}`}
    >
      {/* Priority icon */}
      <div className="mt-0.5 shrink-0 text-sm">
        {thread.priority_level === "high"   ? "🔥"
         : thread.priority_level === "medium" ? "⚡"
         : "💤"}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">

        {/* ── Subject ── */}
        <p className="text-sm font-semibold truncate leading-snug" title={subject}>
          {subject}
        </p>

        {/* ── Sender → Recipient row ── */}
        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground truncate">
          <User className="w-3 h-3 shrink-0 text-muted-foreground/60" />
          <span className="font-medium text-foreground/80 truncate">{senderName}</span>
          {recipientName && (
            <>
              <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground/40" />
              <span className="truncate">{recipientName}</span>
            </>
          )}
        </div>

        {/* ── Context / snippet row ── */}
        {context ? (
          <p className="text-xs text-primary/70 font-medium mt-1 truncate">💡 {context}</p>
        ) : thread.snippet ? (
          <p className="text-xs text-muted-foreground mt-1 truncate italic">
            {thread.snippet}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            {thread.days_silent > 0
              ? `No reply for ${thread.days_silent} day${thread.days_silent !== 1 ? "s" : ""}`
              : "Waiting for response"}
          </p>
        )}

        {/* ── Badges ── */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <TypeBadge type={thread.type} />
          {thread.thread_status && <ThreadStatusBadge status={thread.thread_status} />}
        </div>
      </div>

      {/* Time badge */}
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${daysCls}`}>
        {daysLabel}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PENDING FOLLOWUP ROW
───────────────────────────────────────────────────────────── */
function FollowupRow({ followup, onClick }) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer border-b border-border/50 last:border-0"
      onClick={onClick}
      data-testid={`followup-${followup.id}`}
    >
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Zap className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{followup.original_subject || "(No subject)"}</p>
          <Badge variant="outline" className="text-xs shrink-0 capitalize">{followup.tone}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{followup.ai_draft}</p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SECTION SKELETON
───────────────────────────────────────────────────────────── */
function SectionSkeleton() {
  return (
    <div className="space-y-2 px-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="w-5 h-5 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN DASHBOARD
───────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate();
  const { user }  = useAuth();

  const [stats, setStats]                     = useState(null);
  const [opportunities, setOpportunities]     = useState([]);
  const [recentFollowups, setRecentFollowups] = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [syncing, setSyncing]                 = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, threadsRes, followupsRes] = await Promise.allSettled([
        analyticsAPI.getOverview(),
        emailAPI.getSilentThreads({ limit: 5 }),
        followupAPI.list({ limit: 5, status: "pending" }),
      ]);

      if (statsRes.status === "fulfilled")     setStats(statsRes.value.data);
      if (threadsRes.status === "fulfilled")   setOpportunities(threadsRes.value.data.threads || []);
      if (followupsRes.status === "fulfilled") setRecentFollowups(followupsRes.value.data.followups || []);

      const allFailed = [statsRes, threadsRes, followupsRes].every(r => r.status === "rejected");
      if (allFailed) toast.error("Failed to load dashboard data");
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await emailAPI.syncEmails();
      const n   = res?.data?.new_threads ?? 0;
      toast.success(n > 0 ? `Sync complete! ${n} new thread${n === 1 ? "" : "s"} synced 📬` : "Inbox synced ✅");
      if (res?.data?.warnings?.length > 0) toast.warning(res.data.warnings.join(", "));
      loadData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const highPriority = opportunities.filter(t => t.priority_level === "high").length;
  const actionable   = opportunities.filter(t => t.show_reply).length;

  const statCards = [
    {
      label: "🔥 Needs Attention",
      value: loading ? null : highPriority,
      icon:  Flame,
      color: "text-red-600",
      bg:    "bg-red-50",
      micro: "Conversations you should act on",
    },
    {
      label: "⏳ Waiting for Reply",
      value: loading ? null : stats?.silent_threads || 0,
      icon:  Clock,
      color: "text-amber-600",
      bg:    "bg-amber-50",
      micro: "People who haven't replied yet",
    },
    {
      label: "✉️ Follow-Ups Sent",
      value: loading ? null : stats?.followups_sent || 0,
      icon:  Send,
      color: "text-emerald-600",
      bg:    "bg-emerald-50",
      micro: "Follow-ups sent this month",
    },
    {
      label: "📈 Reply Rate",
      value: loading ? null : `${stats?.response_rate || 0}%`,
      icon:  TrendingUp,
      color: "text-primary",
      bg:    "bg-accent",
      micro: "Replies after follow-ups",
    },
  ];

  const firstName = user?.full_name?.split(" ")[0] || null;

  return (
    <div className="space-y-6" data-testid="dashboard-page">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="dashboard-heading">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here's what needs your attention today
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline" size="sm"
            onClick={handleSync} disabled={syncing}
            data-testid="sync-btn"
            className="h-9"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Emails"}
          </Button>
          <Button
            size="sm"
            onClick={() => navigate("/followups")}
            data-testid="view-queue-btn"
            className="bg-primary hover:bg-primary/90 text-white h-9 font-semibold"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            View Opportunities
          </Button>
        </div>
      </div>

      {/* ── Priority Action Bar ── */}
      <ActionBar
        highPriority={highPriority}
        total={opportunities.length}
        loading={loading}
        onNavigate={() => navigate("/followups")}
      />

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((s, i) => (
          <StatCard
            key={s.label}
            index={i}
            label={s.label}
            value={s.value}
            icon={s.icon}
            color={s.color}
            bg={s.bg}
            micro={s.micro}
            loading={loading}
            testId={`stat-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          />
        ))}
      </div>

      {/* ── Main content ── */}
      <div className="grid lg:grid-cols-5 gap-5">

        {/* LEFT: Opportunities */}
        <div className="lg:col-span-3" data-testid="opportunities-card">
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold">Opportunities</h2>
                {!loading && actionable > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {actionable} ready for follow-up
                  </p>
                )}
              </div>
              <Button
                variant="ghost" size="sm"
                onClick={() => navigate("/followups")}
                className="text-primary text-xs h-7 px-2 font-medium"
              >
                View all <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>

            {loading ? (
              <SectionSkeleton />
            ) : opportunities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                  <Activity className="w-6 h-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No opportunities detected</p>
                <p className="text-xs text-muted-foreground mt-1">Sync your Gmail to start tracking</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {opportunities.map(t => (
                  <OpportunityRow
                    key={t.id}
                    thread={t}
                    onClick={() => navigate("/followups")}
                  />
                ))}
              </div>
            )}

            {!loading && opportunities.length > 0 && (
              <div className="px-4 py-3 border-t border-border bg-muted/20">
                <button
                  onClick={() => navigate("/followups")}
                  className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                >
                  View all {opportunities.length} opportunities
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Pending Follow-ups */}
        <div className="lg:col-span-2" data-testid="pending-followups-card">
          <div className="rounded-2xl border border-border bg-card overflow-hidden h-full">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
              <h2 className="text-sm font-semibold">Pending Follow-Ups</h2>
              <span className="text-xs font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                {recentFollowups.length} draft{recentFollowups.length !== 1 ? "s" : ""}
              </span>
            </div>

            {loading ? (
              <SectionSkeleton />
            ) : recentFollowups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/8 flex items-center justify-center mb-3">
                  <Zap className="w-6 h-6 text-primary/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No pending follow-ups</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[160px]">
                  Generate AI drafts from your opportunities
                </p>
                <Button
                  size="sm" variant="outline"
                  onClick={() => navigate("/followups")}
                  className="mt-4 h-7 text-xs"
                >
                  Go to Opportunities
                </Button>
              </div>
            ) : (
              <div className="p-2">
                {recentFollowups.map(f => (
                  <FollowupRow
                    key={f.id}
                    followup={f}
                    onClick={() => navigate("/followups")}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Connect Gmail prompt ── */}
      {stats && stats.accounts_connected === 0 && (
        <div
          className="rounded-2xl border-2 border-dashed border-primary/25 bg-accent/20 py-10 px-6 text-center"
          data-testid="connect-gmail-prompt"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-base font-semibold mb-1">Connect your Gmail to get started</h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
            Link your email to start detecting opportunities and silent conversations
          </p>
          <Button
            onClick={() => navigate("/settings")}
            data-testid="connect-gmail-btn"
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="w-4 h-4 mr-2" /> Connect Gmail
          </Button>
        </div>
      )}
    </div>
  );
}
