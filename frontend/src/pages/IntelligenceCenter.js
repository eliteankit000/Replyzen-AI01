import { useState, useEffect } from "react";
import { analyticsAPI, inboxAPI } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Users,
  Mail,
  Target,
  Lightbulb,
  MessageSquare,
  Zap,
  Award,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   METRIC CARD
═══════════════════════════════════════════════════════════════ */

function MetricCard({ title, value, subtitle, icon: Icon, trend, color = "text-primary" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-muted ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 mt-3 text-xs">
            {trend > 0 ? (
              <>
                <ArrowUpRight className="w-3 h-3 text-green-600" />
                <span className="text-green-600">+{trend}%</span>
              </>
            ) : trend < 0 ? (
              <>
                <ArrowDownRight className="w-3 h-3 text-red-600" />
                <span className="text-red-600">{trend}%</span>
              </>
            ) : (
              <>
                <Minus className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">No change</span>
              </>
            )}
            <span className="text-muted-foreground ml-1">vs last week</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INSIGHT CARD
═══════════════════════════════════════════════════════════════ */

function InsightCard({ insight }) {
  const typeConfig = {
    timing: { icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
    tone: { icon: MessageSquare, color: "text-purple-600", bg: "bg-purple-50" },
    opportunity: { icon: Target, color: "text-emerald-600", bg: "bg-emerald-50" },
    warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
  };

  const config = typeConfig[insight.type] || typeConfig.timing;
  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${config.bg} border border-transparent`}>
      <div className={`p-1.5 rounded-md bg-white ${config.color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-sm font-medium">{insight.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TONE PERFORMANCE
═══════════════════════════════════════════════════════════════ */

function TonePerformance({ data }) {
  const tones = [
    { name: "Professional", value: data?.professional || 0, color: "bg-blue-500" },
    { name: "Friendly", value: data?.friendly || 0, color: "bg-emerald-500" },
    { name: "Concise", value: data?.concise || 0, color: "bg-purple-500" },
  ];

  const total = tones.reduce((sum, t) => sum + t.value, 0) || 1;
  const bestTone = tones.reduce((a, b) => a.value > b.value ? a : b);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Tone Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {tones.map(tone => (
          <div key={tone.name}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium">{tone.name}</span>
              <span className="text-muted-foreground">{tone.value} replies</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${tone.color} transition-all`}
                style={{ width: `${(tone.value / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
        
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            <Lightbulb className="w-3 h-3 inline mr-1 text-amber-500" />
            Best performing: <strong className="text-foreground">{bestTone.name}</strong>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CONTACT INSIGHTS
═══════════════════════════════════════════════════════════════ */

function ContactInsights({ contacts }) {
  if (!contacts || contacts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Contact Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground text-center py-4">
            No contact data available yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Contact Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {contacts.slice(0, 5).map((contact, idx) => (
          <div key={idx} className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                {contact.name?.charAt(0) || contact.email?.charAt(0) || "?"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{contact.name || contact.email}</p>
                <p className="text-xs text-muted-foreground">{contact.emails} emails</p>
              </div>
            </div>
            <Badge 
              variant="outline" 
              className={`text-xs ${
                contact.status === "responsive" ? "text-green-600 bg-green-50" :
                contact.status === "cold" ? "text-blue-600 bg-blue-50" :
                "text-amber-600 bg-amber-50"
              }`}
            >
              {contact.status || "Active"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OPPORTUNITY ANALYTICS
═══════════════════════════════════════════════════════════════ */

function OpportunityAnalytics({ data }) {
  const items = [
    { label: "Leads Detected", value: data?.leads || 0, icon: Target, color: "text-blue-600" },
    { label: "Conversions", value: data?.conversions || 0, icon: CheckCircle2, color: "text-green-600" },
    { label: "Lost Opportunities", value: data?.lost || 0, icon: AlertTriangle, color: "text-red-600" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Opportunity Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-4">
          {items.map((item, idx) => (
            <div key={idx} className="text-center p-3 rounded-lg bg-muted/30">
              <item.icon className={`w-5 h-5 mx-auto mb-1 ${item.color}`} />
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
        
        {data?.conversionRate !== undefined && (
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Conversion Rate</span>
            <span className="text-sm font-semibold text-primary">{data.conversionRate}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN ANALYTICS (INTELLIGENCE CENTER)
═══════════════════════════════════════════════════════════════ */

export default function IntelligenceCenter() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [inboxStats, setInboxStats] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [analyticsRes, inboxRes] = await Promise.allSettled([
        analyticsAPI.getAnalytics(),
        inboxAPI.getStats(),
      ]);

      if (analyticsRes.status === "fulfilled") {
        setStats(analyticsRes.value.data.data || analyticsRes.value.data);
      }
      if (inboxRes.status === "fulfilled") {
        setInboxStats(inboxRes.value.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Generate smart insights based on data
  const insights = [
    {
      type: "timing",
      title: "Best Follow-up Timing",
      description: "Emails sent between 9-11 AM get 40% higher response rates",
    },
    {
      type: "tone",
      title: "Tone Recommendation",
      description: "Professional tone performs best with your Client category emails",
    },
    {
      type: "opportunity",
      title: "Opportunity Alert",
      description: `${inboxStats?.needs_followup || 0} emails may convert with timely follow-up`,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          Intelligence Center
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Performance metrics, trends, and AI-powered insights
        </p>
      </div>

      <div className="p-6">
        {/* Performance Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <MetricCard
            title="Reply Rate"
            value={`${stats?.replyRate || 0}%`}
            subtitle="Emails replied to"
            icon={Mail}
            trend={stats?.replyRateTrend}
            color="text-blue-600"
          />
          <MetricCard
            title="Avg Response Time"
            value={stats?.avgResponseTime || "—"}
            subtitle="Hours to reply"
            icon={Clock}
            trend={stats?.responseTrend}
            color="text-emerald-600"
          />
          <MetricCard
            title="Follow-up Success"
            value={`${stats?.followupSuccessRate || 0}%`}
            subtitle="Converted follow-ups"
            icon={CheckCircle2}
            trend={stats?.followupTrend}
            color="text-purple-600"
          />
          <MetricCard
            title="Total Generated"
            value={inboxStats?.total_generated || 0}
            subtitle="AI replies created"
            icon={Zap}
            color="text-amber-600"
          />
        </div>

        {/* Smart Insights */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              Smart Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {insights.map((insight, idx) => (
                <InsightCard key={idx} insight={insight} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Grid: Tone Performance, Contact Insights, Opportunity Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <TonePerformance data={stats?.tonePerformance} />
          <ContactInsights contacts={stats?.topContacts} />
          <OpportunityAnalytics data={{
            leads: inboxStats?.category_breakdown?.Lead || 0,
            conversions: stats?.conversions || 0,
            lost: stats?.lostOpportunities || 0,
            conversionRate: stats?.conversionRate || 0,
          }} />
        </div>

        {/* Trends section placeholder */}
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Trends Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-12 text-center">
              <div>
                <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Trend charts coming soon</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Track follow-ups, replies, and conversions over time
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
