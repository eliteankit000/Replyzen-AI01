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
  ArrowRight, Plus, RefreshCw
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   Pure-DOM toast — no React state, no portals, no re-render interference.
   Calling showToast() writes directly to document.body and is 100% immune
   to React batching, StrictMode double-invokes, and layout CSS constraints.
───────────────────────────────────────────────────────────────────────────── */
function showToast({ title, description, variant = "success" }) {
  const isError = variant === "destructive";

  // Ensure container exists
  let container = document.getElementById("__app_toast_container__");
  if (!container) {
    container = document.createElement("div");
    container.id = "__app_toast_container__";
    Object.assign(container.style, {
      position:      "fixed",
      bottom:        "24px",
      right:         "24px",
      zIndex:        "2147483647",
      display:       "flex",
      flexDirection: "column",
      gap:           "10px",
      alignItems:    "flex-end",
      pointerEvents: "none",
    });
    document.body.appendChild(container);
  }

  // Build toast element
  const toast = document.createElement("div");
  Object.assign(toast.style, {
    display:         "flex",
    alignItems:      "flex-start",
    gap:             "12px",
    padding:         "14px 16px",
    borderRadius:    "10px",
    boxShadow:       "0 8px 32px rgba(0,0,0,0.22)",
    border:          `1.5px solid ${isError ? "#f87171" : "#4ade80"}`,
    background:      isError ? "#fef2f2" : "#f0fdf4",
    color:           isError ? "#7f1d1d" : "#14532d",
    fontSize:        "14px",
    minWidth:        "300px",
    maxWidth:        "380px",
    pointerEvents:   "all",
    transition:      "opacity 0.3s ease",
    opacity:         "1",
  });

  const icon = document.createElement("span");
  icon.innerHTML = isError
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  const body = document.createElement("div");
  body.style.flex = "1";

  const titleEl = document.createElement("div");
  titleEl.style.cssText = "font-weight:700;line-height:1.3;";
  titleEl.textContent = title;
  body.appendChild(titleEl);

  if (description) {
    const desc = document.createElement("div");
    desc.style.cssText = "margin-top:3px;font-size:12px;opacity:0.8;";
    desc.textContent = description;
    body.appendChild(desc);
  }

  const closeBtn = document.createElement("button");
  closeBtn.style.cssText = "all:unset;cursor:pointer;opacity:0.5;flex-shrink:0;margin-top:1px;";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  const dismiss = () => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  };
  closeBtn.addEventListener("click", dismiss);

  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  // Auto-dismiss after 5s
  setTimeout(dismiss, 5000);
}

/* ─── Dashboard ──────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats]                     = useState(null);
  const [silentThreads, setSilentThreads]     = useState([]);
  const [recentFollowups, setRecentFollowups] = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [syncing, setSyncing]                 = useState(false);

  useEffect(() => { loadData(); }, []);

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

      // Show toast immediately — pure DOM, React can't touch it
      const newThreads = res?.data?.new_threads ?? 0;
      showToast({
        title: "Sync complete ✅",
        description: newThreads > 0
          ? `${newThreads} new thread${newThreads === 1 ? "" : "s"} synced from Gmail.`
          : "Your inbox is already up to date.",
      });

      await loadData();
    } catch (err) {
      console.error("Sync failed:", err);
      showToast({
        variant: "destructive",
        title: "Sync failed",
        description:
          err?.response?.data?.message ||
          err?.message ||
          "Something went wrong while syncing. Please try again.",
      });
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
