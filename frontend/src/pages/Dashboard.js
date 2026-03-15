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
  ArrowRight, Plus, RefreshCw, AlertCircle, CheckCircle2, Bot, EyeOff
} from "lucide-react";
import { toast } from "sonner";

// Status badge component (same as FollowupQueue)
function ThreadStatusBadge({ status, className = "" }) {
  const statusConfig = {
    needs_reply: { label: "Needs Reply", color: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertCircle },
    replied: { label: "Replied", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    awaiting_response: { label: "Awaiting", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock },
    follow_up_scheduled: { label: "Scheduled", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Zap },
    dismissed: { label: "Dismissed", color: "bg-gray-50 text-gray-500 border-gray-200", icon: EyeOff },
    automated: { label: "Auto", color: "bg-gray-50 text-gray-400 border-gray-200", icon: Bot },
    reply_pending: { label: "Draft Ready", color: "bg-orange-50 text-orange-700 border-orange-200", icon: Zap },
  };

  const config = statusConfig[status] || statusConfig.needs_reply;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.color} ${className} text-xs`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Data state ──
  const [stats, setStats]                     = useState(null);
  const [silentThreads, setSilentThreads]     = useState([]);
  const [recentFollowups, setRecentFollowups] = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [syncing, setSyncing]                 = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, threadsRes, followupsRes] = await Promise.all([
        analyticsAPI.getOverview(),
        emailAPI.getSilentThreads({ limit: 5 }),
        followupAPI.list({ limit: 5, status: "pending" }),
      ]);
      setStats(statsRes.data);
      setSilentThreads(threadsRes.data.threads || []);
      setRecentFollowups(followupsRes.data.followups || []);
    } catch (err) {
      console.error("loadData failed:", err);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await emailAPI.syncEmails();
      const n = res?.data?.new_threads ?? 0;
      
      if (n > 0) {
        toast.success(`Sync complete! ${n} new thread${n === 1 ? "" : "s"} synced from Gmail 📬`);
      } else {
        toast.success("Inbox synced - already up to date ✅");
      }
      
      // Show warnings if any
      if (res?.data?.warnings?.length > 0) {
        toast.warning(res.data.warnings.join(", "));
      }
      
      // Reload data
      loadData();
    } catch (err) {
      console.error("[Sync] error:", err);
      const errorMsg = err?.response?.data?.detail || err?.message || "Sync failed. Please try again.";
      toast.error(errorMsg);
    } finally {
      setSyncing(false);
    }
  };

  const statCards = [
    { label: "Total Threads",   value: stats?.total_threads  || 0,      icon: Mail,       color: "text-blue-600",    bg: "bg-blue-50"    },
    { label: "Silent Threads",  value: stats?.silent_threads || 0,      icon: Clock,      color: "text-amber-600",   bg: "bg-amber-50"   },
    { label: "Follow-ups Sent", value: stats?.followups_sent || 0,      icon: Send,       color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Response Rate",   value: `${stats?.response_rate || 0}%`, icon: TrendingUp, color: "text-primary",     bg: "bg-accent"     },
  ];

  const formatDate = (iso) => {
    if (!iso) return "";
    const diffDays = Math.floor((Date.now() - new Date(iso)) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
  };

  return (
    <div className="space-y-6" data-testid="dashboard-page">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="dashboard-heading">
            Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Here's your follow-up overview</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} data-testid="sync-btn">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Emails"}
          </Button>
          <Button size="sm" onClick={() => navigate("/followups")} data-testid="view-queue-btn" className="bg-primary hover:bg-primary/90 text-white">
            <MessageSquare className="w-4 h-4 mr-2" /> View Queue
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <Card key={s.label} className="hover-lift animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }} data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                  {loading
                    ? <Skeleton className="h-8 w-16 mt-1" />
                    : <p className="text-2xl font-bold mt-1">{s.value}</p>
                  }
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
        {/* Silent Threads */}
        <Card data-testid="silent-threads-card">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Silent Threads</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/followups")} className="text-primary">
              View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : silentThreads.length === 0 ? (
              <div className="text-center py-8">
                <Mail className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No silent threads detected</p>
                <p className="text-xs text-muted-foreground mt-1">Connect your Gmail to start tracking</p>
              </div>
            ) : (
              <div className="space-y-2">
                {silentThreads.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`thread-${t.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium truncate">{t.subject}</p>
                        {t.thread_status && (
                          <ThreadStatusBadge status={t.thread_status} />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t.participant_names?.[0] || t.last_message_from || "Unknown"} · {t.days_silent}d silent
                      </p>
                    </div>
                    {t.show_reply ? (
                      <Badge variant="outline" className="ml-3 shrink-0 text-amber-600 border-amber-200 bg-amber-50">
                        <Clock className="w-3 h-3 mr-1" /> {t.days_silent}d
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="ml-3 shrink-0 text-muted-foreground border-muted">
                        No action
                      </Badge>
                    )}
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
              <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : recentFollowups.length === 0 ? (
              <div className="text-center py-8">
                <Zap className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No pending follow-ups</p>
                <p className="text-xs text-muted-foreground mt-1">Generate AI drafts from the Follow-up Queue</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentFollowups.map((f) => (
                  <div key={f.id} className="p-3 rounded-lg border border-border hover:border-primary/30 transition-colors" data-testid={`followup-${f.id}`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate">{f.original_subject}</p>
                      <Badge variant="outline" className="text-xs">{f.tone}</Badge>
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
            <p className="text-sm text-muted-foreground mb-4">Link your email account to start detecting silent conversations</p>
            <Button onClick={() => navigate("/settings")} data-testid="connect-gmail-btn" className="bg-primary hover:bg-primary/90 text-white">
              <Plus className="w-4 h-4 mr-2" /> Connect Gmail
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
