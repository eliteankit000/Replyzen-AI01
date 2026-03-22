import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsAPI } from "@/lib/api";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isAnalyticsAllowed } from "@/lib/plan-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart3, TrendingUp, Send, Zap, Users, Lock,
  ArrowUpRight, MessageCircle, Clock, Lightbulb,
  CheckCircle2, AlertCircle, Info, Target, Trophy,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ─────────────────────────────────────────────────────────────
// Insight Icon
// ─────────────────────────────────────────────────────────────
function InsightIcon({ type }) {
  if (type === "positive") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />;
  if (type === "action")   return <Zap          className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />;
  if (type === "tip")      return <Lightbulb    className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />;
  return                          <Info         className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />;
}

// ─────────────────────────────────────────────────────────────
// Metric Card
// ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, micro, icon: Icon, color, bg, loading, testId, index = 0 }) {
  return (
    <div
      data-testid={testId}
      className="rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          {loading
            ? <Skeleton className="h-8 w-20 mt-1" />
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

// ─────────────────────────────────────────────────────────────
// Follow-Up Score Card
// ─────────────────────────────────────────────────────────────
function ScoreCard({ score, loading }) {
  const getColor = (s) => {
    if (s >= 70) return "text-emerald-500";
    if (s >= 50) return "text-primary";
    if (s >= 30) return "text-amber-500";
    return "text-muted-foreground";
  };

  const getLabel = (s) => {
    if (s >= 70) return "Excellent";
    if (s >= 50) return "Good";
    if (s >= 30) return "Improving";
    return "Getting Started";
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-4 h-4 text-amber-500" />
        <h2 className="text-sm font-semibold">Follow-Up Score</h2>
      </div>
      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="text-center py-2">
          <p className={`text-5xl font-bold ${getColor(score?.score || 0)}`}>
            {score?.score ?? 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">out of 100</p>
          <Badge variant="secondary" className="mt-2 text-xs">
            {score?.label || getLabel(score?.score || 0)}
          </Badge>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            Based on reply rate, consistency & timing
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Insights Panel
// ─────────────────────────────────────────────────────────────
function InsightsPanel({ insights, loading }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="insights-card">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h2 className="text-sm font-semibold">Smart Insights</h2>
      </div>
      <div className="px-5 py-4 space-y-3">
        {loading ? (
          [1, 2, 3].map(i => <Skeleton key={i} className="h-4 w-full" />)
        ) : !insights || insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No data yet. Start sending follow-ups to see insights.
          </p>
        ) : (
          insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <InsightIcon type={ins.type} />
              <p className="text-sm text-foreground/80 leading-relaxed">{ins.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tone Performance Chart
// ─────────────────────────────────────────────────────────────
function TonePerformanceCard({ data, loading }) {
  const TONE_COLORS = {
    professional: "hsl(21, 90%, 48%)",
    friendly:     "hsl(160, 60%, 45%)",
    casual:       "hsl(220, 80%, 55%)",
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
        <Target className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Tone Performance</h2>
      </div>
      <div className="p-5">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2">
            <Target className="w-8 h-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground text-center">
              Send follow-ups to see which tone performs best.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map(item => (
              <div key={item.tone}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium capitalize">{item.tone}</span>
                  <span className="text-muted-foreground">{item.reply_rate}% reply rate</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.reply_rate}%`,
                      backgroundColor: TONE_COLORS[item.tone] || "hsl(21, 90%, 48%)",
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.replies_received} / {item.total_sent} replied
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Missed Opportunities Banner
// ─────────────────────────────────────────────────────────────
function MissedOpportunitiesBanner({ count, loading, onAction }) {
  if (loading || !count || count === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            {count} conversation{count !== 1 ? "s" : ""} need{count === 1 ? "s" : ""} a follow-up
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            These threads are going cold — don't miss the window.
          </p>
        </div>
      </div>
      <Button size="sm" onClick={onAction}
        className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
        View Now
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty Chart
// ─────────────────────────────────────────────────────────────
function EmptyChart() {
  return (
    <div className="h-64 flex flex-col items-center justify-center gap-2">
      <BarChart3 className="w-10 h-10 text-muted-foreground/20" />
      <p className="text-sm text-muted-foreground text-center max-w-xs">
        No data yet. Generate and send follow-ups to see trends.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Analytics Page
// ─────────────────────────────────────────────────────────────
export default function Analytics() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Existing state
  const [overview,     setOverview]     = useState(null);
  const [chartData,    setChartData]    = useState([]);
  const [topContacts,  setTopContacts]  = useState([]);
  const [period,       setPeriod]       = useState("30");
  const [loading,      setLoading]      = useState(true);

  // New state
  const [insights,         setInsights]         = useState(null);
  const [insightsLoading,  setInsightsLoading]  = useState(true);
  const [toneData,         setToneData]         = useState([]);
  const [toneLoading,      setToneLoading]      = useState(true);
  const [score,            setScore]            = useState(null);
  const [scoreLoading,     setScoreLoading]     = useState(true);
  const [missed,           setMissed]           = useState(0);

  const userPlan = user?.plan || "free";
  const allowed  = isAnalyticsAllowed(userPlan);

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const overviewRes = await analyticsAPI.getOverview();
      setOverview(overviewRes.data);

      if (allowed) {
        const [chartRes, contactsRes] = await Promise.all([
          analyticsAPI.getFollowupsOverTime(parseInt(period)),
          analyticsAPI.getTopContacts(),
        ]);
        setChartData(chartRes.data || []);
        setTopContacts(contactsRes.data || []);
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }

    // Load all new insight data in parallel — each fails gracefully
    setInsightsLoading(true);
    setToneLoading(true);
    setScoreLoading(true);

    const [insightsRes, toneRes, scoreRes] = await Promise.allSettled([
      api.get("/analytics/insights"),
      api.get("/analytics/tone-performance"),
      api.get("/analytics/score"),
    ]);

    if (insightsRes.status === "fulfilled") {
      setInsights(insightsRes.value.data);
      setMissed(insightsRes.value.data?.missed_opportunities || 0);
    }
    if (toneRes.status === "fulfilled")  setToneData(toneRes.value.data || []);
    if (scoreRes.status === "fulfilled") setScore(scoreRes.value.data);

    setInsightsLoading(false);
    setToneLoading(false);
    setScoreLoading(false);
  };

  const formatAvgTime = (hours) => {
    if (!hours || hours === 0) return "—";
    if (hours < 1)  return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  // ── Primary metric cards (new intelligence row) ──
  const insightCards = [
    {
      label: "🔥 Recovered",
      value: insightsLoading ? null : (insights?.recovered_conversations ?? "—"),
      micro: "Conversations recovered by follow-ups",
      icon:  MessageCircle,
      color: "text-emerald-600",
      bg:    "bg-emerald-50",
    },
    {
      label: "📈 Reply Rate",
      value: insightsLoading ? null : (insights ? `${insights.reply_rate}%` : "—"),
      micro: "Of follow-ups get a reply",
      icon:  TrendingUp,
      color: "text-primary",
      bg:    "bg-accent",
    },
    {
      label: "⏱ Avg Reply Time",
      value: insightsLoading ? null : formatAvgTime(insights?.avg_reply_time_hours),
      micro: "Average time to get a response",
      icon:  Clock,
      color: "text-blue-600",
      bg:    "bg-blue-50",
    },
    {
      label: "⚡ Ready to Send",
      value: insightsLoading ? null : (insights?.ready_to_send ?? overview?.followups_pending ?? "—"),
      micro: "Drafts waiting for your action",
      icon:  Zap,
      color: "text-amber-600",
      bg:    "bg-amber-50",
    },
  ];

  // ── Secondary stat cards (existing data) ──
  const statCards = [
    { label: "Follow-ups Sent",  value: overview?.followups_sent  || 0, icon: Send,     color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Threads Tracked",  value: overview?.total_threads   || 0, icon: BarChart3, color: "text-blue-600",   bg: "bg-blue-50"   },
  ];

  // ─────────────────────────────────────────────────────────
  // Free plan paywall (unchanged logic)
  // ─────────────────────────────────────────────────────────
  if (!allowed) {
    return (
      <div className="space-y-6" data-testid="analytics-page">
        <div>
          <h1 className="text-2xl font-bold" data-testid="analytics-heading">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your follow-up performance</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Follow-ups Sent",  value: overview?.followups_sent   || 0,    icon: Send,      color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Pending Drafts",   value: overview?.followups_pending || 0,    icon: Zap,       color: "text-amber-600",  bg: "bg-amber-50"  },
            { label: "Response Rate",    value: `${overview?.response_rate  || 0}%`, icon: TrendingUp, color: "text-primary",   bg: "bg-accent"    },
            { label: "Threads Tracked",  value: overview?.total_threads     || 0,    icon: BarChart3,  color: "text-blue-600",  bg: "bg-blue-50"   },
          ].map((s, i) => (
            <MetricCard key={s.label} index={i} label={s.label} value={s.value}
              micro="" icon={s.icon} color={s.color} bg={s.bg} loading={loading}
              testId={`analytics-stat-${i}`} />
          ))}
        </div>
        <div className="rounded-2xl border-2 border-dashed border-primary/25 bg-accent/20 py-14 px-6 text-center"
          data-testid="analytics-upgrade-prompt">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-base font-semibold mb-2">Unlock Follow-Up Intelligence</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Upgrade to Pro to see your follow-up score, tone performance, smart insights, and what's working.
          </p>
          <Button onClick={() => navigate("/billing")}
            className="bg-primary hover:bg-primary/90 text-white" data-testid="upgrade-analytics-btn">
            Upgrade to Pro <ArrowUpRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // Pro plan — full analytics view
  // ─────────────────────────────────────────────────────────
  const hasChartData = chartData.some(d => d.generated > 0 || d.sent > 0);

  return (
    <div className="space-y-6" data-testid="analytics-page">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="analytics-heading">
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your follow-up intelligence dashboard
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36 h-9" data-testid="period-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Missed Opportunities Banner */}
      <MissedOpportunitiesBanner
        count={missed}
        loading={insightsLoading}
        onAction={() => navigate("/followups")}
      />

      {/* Primary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {insightCards.map((s, i) => (
          <MetricCard key={s.label} index={i} label={s.label} value={s.value}
            micro={s.micro} icon={s.icon} color={s.color} bg={s.bg}
            loading={insightsLoading} testId={`analytics-insight-${i}`} />
        ))}
      </div>

      {/* Score + Insights Row */}
      <div className="grid lg:grid-cols-3 gap-5">
        <ScoreCard score={score} loading={scoreLoading} />
        <div className="lg:col-span-2">
          <InsightsPanel insights={insights?.insights || []} loading={insightsLoading} />
        </div>
      </div>

      {/* Chart + Tone Performance Row */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Follow-ups Over Time */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden"
          data-testid="followups-chart">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold">Follow-ups Over Time</h2>
            <Badge variant="secondary" className="text-xs font-normal">Last {period} days</Badge>
          </div>
          <div className="p-5">
            {loading ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : hasChartData ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(21, 90%, 48%)"  stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(21, 90%, 48%)"  stopOpacity={0}    />
                    </linearGradient>
                    <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(160, 60%, 45%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(160, 60%, 45%)" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 10%, 88%)" />
                  <XAxis dataKey="date"
                    tickFormatter={d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Area type="monotone" dataKey="generated" stroke="hsl(21, 90%, 48%)"
                    fill="url(#genGrad)" strokeWidth={2} name="Generated" />
                  <Area type="monotone" dataKey="sent" stroke="hsl(160, 60%, 45%)"
                    fill="url(#sentGrad)" strokeWidth={2} name="Sent" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>

        {/* Tone Performance */}
        <TonePerformanceCard data={toneData} loading={toneLoading} />
      </div>

      {/* Overview + Top Contacts Row */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Overview mini stats */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold text-muted-foreground">Overview</h2>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            {statCards.map((s) => (
              <div key={s.label} className="space-y-1">
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                {loading
                  ? <Skeleton className="h-6 w-12 mt-1" />
                  : <p className="text-2xl font-bold">{s.value}</p>}
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Top Contacts */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden"
          data-testid="top-contacts">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Top Contacts</h2>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : topContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Users className="w-8 h-8 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">No contacts yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {topContacts.map((c, i) => (
                  <div key={c.email}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                    data-testid={`contact-${i}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {(c.name || c.email || "?")[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name || c.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs font-medium">
                      {c.count} thread{c.count !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
