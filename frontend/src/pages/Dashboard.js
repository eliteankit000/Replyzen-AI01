import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsAPI, emailAPI, followupAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle, XCircle, X,
  MessageSquare, Mail, Send, TrendingUp, Clock, Zap,
  ArrowRight, Plus, RefreshCw
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   SyncBanner — rendered INSIDE the page JSX using its own isolated state.
   loadData() only touches: loading, stats, silentThreads, recentFollowups.
   It NEVER touches syncBanner, so the banner survives every re-render.
───────────────────────────────────────────────────────────────────────────── */
function SyncBanner({ banner, onClose }) {
  if (!banner) return null;
  const isError = banner.variant === "error";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px", borderRadius: 10, marginBottom: 4,
      background: isError ? "#fef2f2" : "#f0fdf4",
      border: `1.5px solid ${isError ? "#f87171" : "#4ade80"}`,
      color: isError ? "#7f1d1d" : "#14532d",
      fontSize: 14, fontWeight: 500,
      boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    }}>
      {isError
        ? <XCircle style={{ width: 18, height: 18, color: "#dc2626", flexShrink: 0 }} />
        : <CheckCircle style={{ width: 18, height: 18, color: "#16a34a", flexShrink: 0 }} />
      }
      <span style={{ flex: 1 }}>{banner.message}</span>
      <button
        onClick={onClose}
        style={{ all: "unset", cursor: "pointer", opacity: 0.5, display: "flex" }}
      >
        <X style={{ width: 15, height: 15 }} />
      </button>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Isolated banner state — loadData() never touches this ──
  const [syncBanner, setSyncBanner] = useState(null);
  const bannerTimerRef = useRef(null);

  const showBanner = (message, variant = "success") => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setSyncBanner({ message, variant });
    bannerTimerRef.current = setTimeout(() => setSyncBanner(null), 6000);
  };

  // ── Data state — touched only by loadData() ──
  const [stats, setStats]                     = useState(null);
  const [silentThreads, setSilentThreads]     = useState([]);
  const [recentFollowups, setRecentFollowups] = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [syncing, setSyncing]                 = useState(false);

  useEffect(() => {
    loadData();
    return () => { if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current); };
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
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await emailAPI.syncEmails();
      const newThreads = res?.data?.new_threads ?? 0;

      // ✅ Set banner BEFORE loadData — they use separate state, won't interfere
      showBanner(
        newThreads > 0
          ? `Sync complete ✅ — ${newThreads} new thread${newThreads === 1 ? "" : "s"} synced from Gmail.`
          : "Sync complete ✅ — Your inbox is already up to date."
      );

      await loadData();
    } catch (err) {
      console.error("Sync failed:", err);
      showBanner(
        err?.response?.data?.message || err?.message || "Sync failed. Please try again.",
        "error"
      );
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
    <div className="space-y-8" data-testid="dashboard-page">

      {/* ── Sync banner — always visible when set, lives at top of page ── */}
      <SyncBanner banner={syncBanner} onClose={() => setSyncBanner(null)} />

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
                      <p className="text-sm font-medium truncate">{t.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.participant_names?.[0] || "Unknown"} &middot; {t.days_silent}d silent
                      </p>
                    </div>
                    <Badge variant="outline" className="ml-3 shrink-0 text-amber-600 border-amber-200 bg-amber-50">
                      <Clock className="w-3 h-3 mr-1" /> {t.days_silent}d
                    </Badge>
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
