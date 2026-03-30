import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { inboxAPI, emailAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Inbox,
  Mail,
  RefreshCw,
  Sparkles,
  Flame,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  DollarSign,
  Handshake,
  Loader2,
  ChevronRight,
  Eye,
  Target,
  Bell,
  ArrowRight,
  Zap,
  PenSquare,
} from "lucide-react";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   CATEGORY & PRIORITY CONFIGURATIONS
═══════════════════════════════════════════════════════════════ */

const PRIORITY_CONFIG = {
  HOT:  { label: "HOT",  color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200" },
  WARM: { label: "WARM", color: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200" },
  LOW:  { label: "LOW",  color: "text-gray-500",   bg: "bg-gray-50",   border: "border-gray-200" },
};

/* ═══════════════════════════════════════════════════════════════
   TODAY'S FOCUS SECTION
═══════════════════════════════════════════════════════════════ */

function TodaysFocus({ stats, loading }) {
  const items = [
    {
      count: stats?.opportunities || 0,
      label: "potential client conversations",
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      count: stats?.requiresAttention || 0,
      label: "emails require attention",
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      count: stats?.followupsNeeded || 0,
      label: "follow-ups pending",
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  if (loading) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="w-5 h-5 text-primary" />
          Today's Focus
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {items.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-3 p-4 rounded-lg ${item.bg} border border-transparent`}
            >
              <div className={`p-2 rounded-full bg-white ${item.color}`}>
                <item.icon className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ACTION QUEUE ITEM
═══════════════════════════════════════════════════════════════ */

function ActionQueueItem({ email, onClick }) {
  return (
    <div
      onClick={() => onClick(email)}
      className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/50 cursor-pointer transition-all group bg-background"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
          {email.subject || "(No subject)"}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {email.summary || email.snippet}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ACTION QUEUE SECTION
═══════════════════════════════════════════════════════════════ */

function ActionQueueSection({ title, icon: Icon, emails, color, bgColor, onItemClick, onViewAll }) {
  if (!emails || emails.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md ${bgColor}`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <span>{title}</span>
            <Badge variant="secondary" className="text-xs">
              {emails.length}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewAll}
            className="h-7 text-xs text-muted-foreground hover:text-primary"
          >
            View All
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {emails.slice(0, 3).map(email => (
          <ActionQueueItem
            key={email.id}
            email={email}
            onClick={onItemClick}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OPPORTUNITY SNAPSHOT
═══════════════════════════════════════════════════════════════ */

function OpportunitySnapshot({ stats, onViewInbox }) {
  const opportunities = [
    { label: "Potential Clients", count: stats?.clientOpportunities || 0, icon: Users, color: "text-blue-600" },
    { label: "Partnerships", count: stats?.partnershipOpportunities || 0, icon: Handshake, color: "text-purple-600" },
    { label: "Payment Related", count: stats?.paymentOpportunities || 0, icon: DollarSign, color: "text-green-600" },
  ];

  const total = opportunities.reduce((sum, o) => sum + o.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="p-1.5 rounded-md bg-emerald-50">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          Opportunity Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-3xl font-bold text-primary">{total}</p>
            <p className="text-xs text-muted-foreground">Total opportunities detected</p>
          </div>
          <Button onClick={onViewInbox} size="sm">
            <Eye className="w-4 h-4 mr-2" />
            View in Inbox
          </Button>
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          {opportunities.map((opp, idx) => (
            <div key={idx} className="text-center p-2 rounded-lg bg-muted/30">
              <opp.icon className={`w-4 h-4 mx-auto mb-1 ${opp.color}`} />
              <p className="text-lg font-semibold">{opp.count}</p>
              <p className="text-[10px] text-muted-foreground">{opp.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   QUICK ACTIONS
═══════════════════════════════════════════════════════════════ */

function QuickActions({ onSync, syncing, navigate }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={onSync}
          disabled={syncing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Emails"}
        </Button>
        
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => navigate("/inbox")}
        >
          <Inbox className="w-4 h-4 mr-2" />
          Open AI Inbox
        </Button>
        
        <Button
          className="w-full justify-start bg-primary hover:bg-primary/90"
          onClick={() => navigate("/compose")}
        >
          <PenSquare className="w-4 h-4 mr-2" />
          Compose Email
        </Button>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD (ACTION CENTER)
═══════════════════════════════════════════════════════════════ */

export default function ActionCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [messagesRes, statsRes] = await Promise.allSettled([
        inboxAPI.getMessages(100),
        inboxAPI.getStats(),
      ]);

      if (messagesRes.status === "fulfilled") {
        setEmails(messagesRes.value.data.data || []);
      }
      if (statsRes.status === "fulfilled") {
        setStats(statsRes.value.data.data);
      }
    } catch (err) {
      toast.error("Failed to load data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await emailAPI.syncEmails();
      const n = res?.data?.new_threads ?? 0;
      toast.success(n > 0 ? `${n} new emails synced!` : "Inbox up to date");
      loadData();
    } catch (err) {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  // Categorize emails for action queues
  const actionQueues = useMemo(() => {
    // Requires Attention: High urgency or Risk category
    const requiresAttention = emails.filter(e => 
      e.priority_label === "HOT" || 
      e.opportunity_type === "Risk" ||
      (e.urgency_score && e.urgency_score >= 8)
    );

    // Opportunities: Lead, Client, or Partnership
    const opportunities = emails.filter(e => 
      e.opportunity_type === "Client" || 
      e.opportunity_type === "Partnership" ||
      e.category === "Lead" ||
      e.category === "Client"
    );

    // Follow-ups Needed
    const followups = emails.filter(e => e.needs_followup);

    return { requiresAttention, opportunities, followups };
  }, [emails]);

  // Calculate stats for Today's Focus
  const focusStats = useMemo(() => ({
    opportunities: actionQueues.opportunities.length,
    requiresAttention: actionQueues.requiresAttention.length,
    followupsNeeded: actionQueues.followups.length,
    clientOpportunities: emails.filter(e => e.opportunity_type === "Client" || e.category === "Client").length,
    partnershipOpportunities: emails.filter(e => e.opportunity_type === "Partnership" || e.category === "Partnership").length,
    paymentOpportunities: emails.filter(e => e.category === "Payment").length,
  }), [emails, actionQueues]);

  const handleEmailClick = (email) => {
    navigate(`/inbox?selected=${email.id}`);
  };

  const firstName = user?.full_name?.split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Action Center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Welcome back, {firstName}. Here's what needs your attention.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="p-6">
        {/* Today's Focus */}
        <TodaysFocus stats={focusStats} loading={loading} />

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Action Queues */}
          <div className="lg:col-span-2 space-y-6">
            {/* Requires Attention */}
            <ActionQueueSection
              title="Requires Attention"
              icon={AlertTriangle}
              emails={actionQueues.requiresAttention}
              color="text-red-600"
              bgColor="bg-red-50"
              onItemClick={handleEmailClick}
              onViewAll={() => navigate("/inbox?filter=priority")}
            />

            {/* Opportunities */}
            <ActionQueueSection
              title="Opportunities"
              icon={TrendingUp}
              emails={actionQueues.opportunities}
              color="text-emerald-600"
              bgColor="bg-emerald-50"
              onItemClick={handleEmailClick}
              onViewAll={() => navigate("/inbox?filter=opportunities")}
            />

            {/* Follow-ups Needed */}
            <ActionQueueSection
              title="Follow-ups Needed"
              icon={Clock}
              emails={actionQueues.followups}
              color="text-amber-600"
              bgColor="bg-amber-50"
              onItemClick={handleEmailClick}
              onViewAll={() => navigate("/inbox?filter=followups")}
            />

            {/* Empty state */}
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map(i => <Skeleton key={i} className="h-40" />)}
              </div>
            ) : (
              actionQueues.requiresAttention.length === 0 &&
              actionQueues.opportunities.length === 0 &&
              actionQueues.followups.length === 0 && (
                <Card className="py-12">
                  <div className="text-center">
                    <Inbox className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">No action items right now</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Connect Gmail or sync to get started
                    </p>
                    <Button onClick={handleSync} className="mt-4" disabled={syncing}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                      Sync Emails
                    </Button>
                  </div>
                </Card>
              )
            )}
          </div>

          {/* Right column: Snapshot & Quick Actions */}
          <div className="space-y-6">
            <OpportunitySnapshot
              stats={focusStats}
              onViewInbox={() => navigate("/inbox?filter=opportunities")}
            />
            
            <QuickActions
              onSync={handleSync}
              syncing={syncing}
              navigate={navigate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
