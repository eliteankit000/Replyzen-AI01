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
  Bot, EyeOff, Flame, Activity, BarChart3
} from "lucide-react";
import { toast } from "sonner";

// ── Priority Badge ──────────────────────────────────────────
function PriorityBadge({ level }) {
  const cfg = {
    high:   { label: "🔥 High",   cls: "bg-red-50 text-red-700 border-red-200" },
    medium: { label: "⚡ Medium", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    low:    { label: "💤 Low",    cls: "bg-gray-50 text-gray-500 border-gray-200" },
  };
  const c = cfg[level] || cfg.low;
  return (
    <Badge variant="outline" className={`${c.cls} text-xs shrink-0`}>
      {c.label}
    </Badge>
  );
}

// ── Type Badge ──────────────────────────────────────────────
function TypeBadge({ type }) {
  const cfg = {
    client_proposal: { label: "Client Proposal", cls: "bg-purple-50 text-purple-700 border-purple-200" },
    payment:         { label: "Payment",          cls: "bg-green-50 text-green-700 border-green-200" },
    interview:       { label: "Interview",        cls: "bg-blue-50 text-blue-700 border-blue-200" },
    lead:            { label: "Lead",             cls: "bg-orange-50 text-orange-700 border-orange-200" },
    partnership:     { label: "Partnership",      cls: "bg-pink-50 text-pink-700 border-pink-200" },
    other:           { label: "General",          cls: "bg-gray-50 text-gray-600 border-gray-200" },
  };
  if (!type || type === "notification" || type === "newsletter") return null;
  const c = cfg[type] || cfg.other;
  return (
    <Badge variant="outline" className={`${c.cls} text-xs shrink-0`}>
      {c.label}
    </Badge>
  );
}

// ── Status Badge ────────────────────────────────────────────
function ThreadStatusBadge({ status }) {
  const cfg = {
    needs_reply:       { label: "Needs Reply",   cls: "bg-amber-50 text-amber-700 border-amber-200",    Icon: AlertCircle },
    replied:           { label: "Replied",        cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    awaiting_response: { label: "Awaiting",       cls: "bg-blue-50 text-blue-700 border-blue-200",      Icon: Clock },
    follow_up_scheduled:{ label: "Scheduled",    cls: "bg-purple-50 text-purple-700 border-purple-200", Icon: Zap },
    dismissed:         { label: "Dismissed",      cls: "bg-gray-50 text-gray-500 border-gray-200",      Icon: EyeOff },
    automated:         { label: "Auto",           cls: "bg-gray-50 text-gray-400 border-gray-200",      Icon: Bot },
    reply_pending:     { label: "Draft Ready",    cls: "bg-orange-50 text-orange-700 border-orange-200", Icon: Zap },
  };
  const c = cfg[status] || cfg.needs_reply;
  const Icon = c.Icon;
  return (
    <Badge variant="outline" className={`${c.cls} text-xs`}>
      <Icon className="w-3 h-3 mr-1" />{c.label}
    </Badge>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user }  = useAuth();

  const [stats, setStats]                 = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [recentFollowups, setRecentFollowups] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [syncing, setSyncing]             = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, threadsRes, followupsRes] = await Promise.allSettled([
        analyticsAPI.getOverview(),
        emailAPI.getSilentThreads({ limit: 5 }),
        followupAPI.list({ limit: 5, status: "pending" }),
      ]);

      if (statsRes.status === "fulfilled")    setStats(statsRes.value.data);
      if (threadsRes.status === "fulfilled")  setOpportunities(threadsRes.value.data.threads || []);
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

  // Derived opportunity counts
  const highPriority  = opportunities.filter(t => t.priority_level === "high").length;
  const actionable    = opportunities.filter(t => t.show_reply).length;

  const statCards = [
    {
      label: "Needs Action Today",
      value: loading ? null : highPriority,
      icon:  Flame,
      color: "text-red-600",
      bg:    "bg-red-50",
      tip:   "High priority threads",
    },
    {
      label: "Silent Threads",
      value: loading ? null : stats?.silent_threads || 0,
      icon:  Clock,
      color: "text-amber-600",
      bg:    "bg-amber-50",
      tip:   "Awaiting your response",
    },
    {
      label: "Follow-ups Sent",
      value: loading ? null : stats?.followups_sent || 0,
      icon:  Send,
      color: "text-emerald-600",
      bg:    "bg-emerald-50",
      tip:   "Total sent this month",
    },
    {
      label: "Response Rate",
      value: loading ? null : `${stats?.response_rate || 0}%`,
      icon:  TrendingUp,
      color: "text-primary",
      bg:    "bg-accent",
      tip:   "Reply success rate",
    },
  ];

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
    if (d === 0) return "Today";
    if (d === 1) return "Yesterday";
    return `${d}d ago`;
  };

  return (
    <div className="space-y-6" data-testid="dashboard-page">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="dashboard-heading">
            Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {highPriority > 0
              ? `🔥 ${highPriority} high-priority opportunit${highPriority === 1 ? "y" : "ies"} need your attention`
              : "Your opportunity overview"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} data-testid="sync-btn">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Emails"}
          </Button>
          <Button size="sm" onClick={() => navigate("/followups")} data-testid="view-queue-btn"
            className="bg-primary hover:bg-primary/90 text-white">
            <MessageSquare className="w-4 h-4 mr-2" /> View Opportunities
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <Card key={s.label} className="hover-lift animate-fade-in"
            style={{ animationDelay: `${i * 0.1}s` }}
            data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                  {loading
                    ? <Skeleton className="h-8 w-16 mt-1" />
                    : <p className="text-2xl font-bold mt-1">{s.value}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">{s.tip}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* Opportunities (was Silent Threads) */}
        <Card data-testid="opportunities-card">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Opportunities</CardTitle>
              {actionable > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {actionable} thread{actionable !== 1 ? "s" : ""} ready for follow-up
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/followups")} className="text-primary">
              View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : opportunities.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No opportunities detected</p>
                <p className="text-xs text-muted-foreground mt-1">Sync your Gmail to start tracking</p>
              </div>
            ) : (
              <div className="space-y-2">
                {opportunities.map(t => (
                  <div key={t.id}
                    className="flex items-start justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate("/followups")}
                    data-testid={`thread-${t.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate mb-1">{t.subject}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {t.type && <TypeBadge type={t.type} />}
                        {t.thread_status && <ThreadStatusBadge status={t.thread_status} />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t.last_message_from || "Unknown"} · {t.days_silent}d silent
                      </p>
                    </div>
                    <div className="ml-3 shrink-0">
                      {t.priority_level
                        ? <PriorityBadge level={t.priority_level} />
                        : t.show_reply
                          ? <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">
                              <Clock className="w-3 h-3 mr-1" /> {t.days_silent}d
                            </Badge>
                          : <Badge variant="outline" className="text-muted-foreground border-muted text-xs">
                              No action
                            </Badge>
                      }
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Follow-ups */}
        <Card data-testid="pending-followups-card">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Pending Follow-ups</CardTitle>
            <Badge variant="secondary" className="font-normal">{recentFollowups.length} drafts</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : recentFollowups.length === 0 ? (
              <div className="text-center py-8">
                <Zap className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No pending follow-ups</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Generate AI drafts from the Opportunities queue
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentFollowups.map(f => (
                  <div key={f.id}
                    className="p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => navigate("/followups")}
                    data-testid={`followup-${f.id}`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate">{f.original_subject}</p>
                      <Badge variant="outline" className="text-xs shrink-0 ml-2">{f.tone}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{f.ai_draft}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Connect Gmail prompt */}
      {stats && stats.accounts_connected === 0 && (
        <Card className="border-dashed border-2 border-primary/30 bg-accent/30" data-testid="connect-gmail-prompt">
          <CardContent className="py-8 text-center">
            <Mail className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Connect your Gmail to get started</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Link your email to start detecting opportunities and silent conversations
            </p>
            <Button onClick={() => navigate("/settings")} data-testid="connect-gmail-btn"
              className="bg-primary hover:bg-primary/90 text-white">
              <Plus className="w-4 h-4 mr-2" /> Connect Gmail
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
