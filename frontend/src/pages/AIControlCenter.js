import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { inboxAPI, settingsAPI, emailAPI, billingAPI, aiSettingsAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Cpu,
  Mail,
  Eye,
  Bell,
  Clock,
  Target,
  Users,
  DollarSign,
  Headphones,
  Handshake,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Activity,
  Loader2,
  User,
  Save,
  ArrowUpRight,
  CreditCard,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */

/**
 * Extracts a human-readable error message from both axios errors
 * and plain fetch-based errors — same pattern used in Settings.js.
 */
function extractErrorDetail(err, fallback = "Something went wrong") {
  return (
    err?.response?.data?.detail ||
    err?.response?.data?.message ||
    err?.detail ||
    err?.message ||
    (typeof err === "string" ? err : null) ||
    fallback
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE & PLAN CARD
═══════════════════════════════════════════════════════════════ */

function ProfilePlanCard({ user, planLimits, accounts, loading, onNavigate }) {
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [saving, setSaving] = useState(false);
  const { refreshUser } = useAuth();

  // Keep fullName in sync if user object arrives after mount
  useEffect(() => {
    setFullName(user?.full_name || "");
  }, [user?.full_name]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await settingsAPI.updateProfile({ full_name: fullName });
      await refreshUser();
      toast.success("Profile updated ✅");
    } catch (err) {
      toast.error(extractErrorDetail(err, "Failed to update profile"));
    } finally {
      setSaving(false);
    }
  };

  const userPlan = user?.plan || "free";

  const planColors = {
    free:       "bg-muted text-muted-foreground border-muted-foreground/30",
    pro:        "bg-blue-50 text-blue-700 border-blue-200",
    business:   "bg-purple-50 text-purple-700 border-purple-200",
    enterprise: "bg-amber-50 text-amber-700 border-amber-200",
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          Profile & Plan
        </CardTitle>
        <CardDescription className="text-xs">
          Your account details and subscription information
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        {/* ── Profile fields ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Full Name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-8 text-sm"
              placeholder="Your full name"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Email Address</Label>
            <Input
              value={user?.email || ""}
              disabled
              className="h-8 text-sm bg-muted"
            />
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleSaveProfile}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-white"
        >
          {saving
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Save className="w-4 h-4 mr-2" />}
          Save Profile
        </Button>

        <Separator />

        {/* ── Plan & Credits ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Current Plan */}
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5" />
              Current Plan
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`capitalize text-xs font-semibold ${planColors[userPlan] || planColors.free}`}
              >
                {userPlan}
              </Badge>
            </div>
          </div>

          {/* Email Accounts used */}
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="w-3.5 h-3.5" />
              Email Accounts
            </div>
            <p className="text-sm font-semibold">
              {accounts.length}
              {planLimits ? (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  / {planLimits.max_email_accounts}
                </span>
              ) : null}
            </p>
          </div>

          {/* Daily send limit / credits */}
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CreditCard className="w-3.5 h-3.5" />
              Daily Send Limit
            </div>
            <p className="text-sm font-semibold">
              {planLimits?.max_daily_sends ?? "—"}
              <span className="text-xs font-normal text-muted-foreground ml-1">emails/day</span>
            </p>
          </div>
        </div>

        {/* Upgrade CTA for free users */}
        {userPlan === "free" && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground">
              Upgrade to unlock Smart Reply, higher limits &amp; more.
            </p>
            <Button
              size="sm"
              variant="link"
              className="text-primary h-auto p-0 shrink-0 ml-3"
              onClick={() => onNavigate("/billing")}
            >
              Upgrade <ArrowUpRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   INBOX INTELLIGENCE STATS
═══════════════════════════════════════════════════════════════ */

function InboxIntelligenceStats({ stats, loading }) {
  const items = [
    { label: "Emails Scanned",        value: stats?.total_messages || 0,                                                                               icon: Mail,          color: "text-blue-600" },
    { label: "Opportunities Detected", value: (stats?.category_breakdown?.Lead || 0) + (stats?.category_breakdown?.Client || 0), icon: Target,        color: "text-emerald-600" },
    { label: "Follow-ups Detected",   value: stats?.needs_followup || 0,                                                                               icon: Clock,         color: "text-amber-600" },
    { label: "High Priority",         value: stats?.hot_priority || 0,                                                                                 icon: AlertTriangle, color: "text-red-600" },
  ];

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Inbox Intelligence
        </CardTitle>
        <CardDescription className="text-xs">
          AI analysis summary of your connected inbox
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((item, idx) => (
            <div key={idx} className="text-center p-4 rounded-lg bg-muted/30">
              <item.icon className={`w-5 h-5 mx-auto mb-2 ${item.color}`} />
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DETECTION SETTINGS
═══════════════════════════════════════════════════════════════ */

function DetectionSettings({ settings, onUpdate }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Detection Settings
        </CardTitle>
        <CardDescription className="text-xs">
          Configure how AI detects opportunities and follow-ups
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-6">
        {/* Sensitivity */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Detection Sensitivity</Label>
          <Select
            value={settings?.sensitivity || "medium"}
            onValueChange={(value) => onUpdate({ sensitivity: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low - Only high-confidence detections</SelectItem>
              <SelectItem value="medium">Medium - Balanced detection</SelectItem>
              <SelectItem value="high">High - Catch more potential opportunities</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Higher sensitivity may result in more false positives
          </p>
        </div>

        {/* Follow-up Timing */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Follow-up Detection Timing</Label>
          <Select
            value={settings?.followupTiming || "48h"}
            onValueChange={(value) => onUpdate({ followupTiming: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24 hours - Flag quickly</SelectItem>
              <SelectItem value="48h">48 hours - Standard timing</SelectItem>
              <SelectItem value="72h">72 hours - Allow more time</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Time without response before suggesting follow-up
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CATEGORY TRACKING
═══════════════════════════════════════════════════════════════ */

function CategoryTracking({ settings, onUpdate }) {
  const categories = [
    { key: "client",      label: "Client",      icon: Users,     description: "Existing customer communications" },
    { key: "lead",        label: "Lead",        icon: TrendingUp, description: "Potential new business" },
    { key: "payment",     label: "Payment",     icon: DollarSign, description: "Invoices and billing" },
    { key: "support",     label: "Support",     icon: Headphones, description: "Help requests" },
    { key: "partnership", label: "Partnership", icon: Handshake,  description: "Collaboration proposals" },
  ];

  const toggleCategory = (key) => {
    const current = settings?.trackedCategories || categories.map(c => c.key);
    const updated = current.includes(key)
      ? current.filter(c => c !== key)
      : [...current, key];
    onUpdate({ trackedCategories: updated });
  };

  const tracked = settings?.trackedCategories || categories.map(c => c.key);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Category Tracking
        </CardTitle>
        <CardDescription className="text-xs">
          Choose which email categories to analyze and track
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {categories.map(cat => (
          <div
            key={cat.key}
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-muted">
                <cat.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{cat.label}</p>
                <p className="text-xs text-muted-foreground">{cat.description}</p>
              </div>
            </div>
            <Switch
              checked={tracked.includes(cat.key)}
              onCheckedChange={() => toggleCategory(cat.key)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION SETTINGS
═══════════════════════════════════════════════════════════════ */

function NotificationSettings({ settings, onUpdate }) {
  const notifications = [
    { key: "potentialClient", label: "Potential Client Alerts",  description: "When a new lead or client email is detected" },
    { key: "followupAlert",   label: "Follow-up Alerts",         description: "When an email needs follow-up" },
    { key: "urgentEmail",     label: "Urgent Email Alerts",      description: "When a high-priority email arrives" },
  ];

  const toggleNotification = (key) => {
    const current = settings?.notifications || {};
    onUpdate({
      notifications: {
        ...current,
        [key]: !current[key],
      },
    });
  };

  const notifSettings = settings?.notifications || {};

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Notifications
        </CardTitle>
        <CardDescription className="text-xs">
          Configure when you want to be alerted
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {notifications.map(notif => (
          <div
            key={notif.key}
            className="flex items-center justify-between p-3 rounded-lg border border-border"
          >
            <div>
              <p className="text-sm font-medium">{notif.label}</p>
              <p className="text-xs text-muted-foreground">{notif.description}</p>
            </div>
            <Switch
              checked={notifSettings[notif.key] ?? true}
              onCheckedChange={() => toggleNotification(notif.key)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AI ACTIVITY LOG
═══════════════════════════════════════════════════════════════ */

function AIActivityLog({ activities, loading }) {
  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const defaultActivities = [
    { action: "Emails analyzed",        count: 0, icon: Eye,     time: "Today" },
    { action: "Opportunities detected", count: 0, icon: Target,  time: "Today" },
    { action: "Follow-ups triggered",   count: 0, icon: Clock,   time: "Today" },
    { action: "Replies generated",      count: 0, icon: Sparkles, time: "Today" },
  ];

  const displayActivities = activities?.length > 0 ? activities : defaultActivities;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          AI Activity Log
        </CardTitle>
        <CardDescription className="text-xs">
          Recent AI processing activity
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {displayActivities.map((activity, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
          >
            <div className="flex items-center gap-2">
              {activity.icon && <activity.icon className="w-4 h-4 text-muted-foreground" />}
              <span className="text-sm">{activity.action}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {activity.count}
              </Badge>
              <span className="text-xs text-muted-foreground">{activity.time}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GMAIL CONNECTION STATUS
   Uses the same emailAPI.getGmailAuthUrl() pattern as Settings.js
═══════════════════════════════════════════════════════════════ */

function GmailConnectionStatus({ accounts, onConnect, connecting, loading }) {
  // Derive connected state from the accounts list (same source of truth as Settings.js)
  const connected = accounts.some(a => a.is_active);
  const connectedAccount = accounts.find(a => a.is_active);

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          Gmail Connection
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${connected ? "bg-green-50" : "bg-amber-50"}`}>
              {connected
                ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                : <AlertTriangle className="w-5 h-5 text-amber-600" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                {connected ? "Gmail Connected" : "Gmail Not Connected"}
              </p>
              <p className="text-xs text-muted-foreground">
                {connected
                  ? connectedAccount?.email_address || "AI inbox analysis is active"
                  : "Connect to enable AI features"}
              </p>
            </div>
          </div>
          {!connected && (
            <Button onClick={onConnect} disabled={connecting} size="sm">
              {connecting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : "Connect Gmail"}
            </Button>
          )}
        </div>

        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-xs text-blue-700">
            <strong>Privacy:</strong> We only read your emails — never send or modify.
            All sending is done through Gmail's compose interface.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN AI CONTROL CENTER
═══════════════════════════════════════════════════════════════ */

export default function AIControlCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading]       = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Gmail accounts (same source as Settings.js — drives connected status)
  const [accounts, setAccounts]     = useState([]);
  const [planLimits, setPlanLimits] = useState(null);

  const [stats, setStats]             = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [settings, setSettings]       = useState({
    sensitivity:         "medium",
    followup_timing:     "48h",
    tracked_categories:  ["client", "lead", "payment", "support", "partnership"],
    notify_potential_client: true,
    notify_followup:     true,
    notify_urgent:       true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, accountsRes, limitsRes, settingsRes, activityRes] =
        await Promise.allSettled([
          inboxAPI.getStats(),
          emailAPI.getAccounts(),        // ← same as Settings.js
          billingAPI.getPlanLimits(),    // ← same as Settings.js
          aiSettingsAPI.get(),
          aiSettingsAPI.getActivity(20),
        ]);

      if (statsRes.status === "fulfilled")
        setStats(statsRes.value.data.data);

      if (accountsRes.status === "fulfilled")
        setAccounts(accountsRes.value.data || []);

      if (limitsRes.status === "fulfilled")
        setPlanLimits(limitsRes.value.data);

      if (settingsRes.status === "fulfilled" && settingsRes.value.data.data)
        setSettings(settingsRes.value.data.data);

      if (activityRes.status === "fulfilled" && activityRes.value.data.data)
        setActivityLog(activityRes.value.data.data.activities || []);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async (updates) => {
    // Map frontend keys → backend keys
    const backendUpdates = {};
    if (updates.sensitivity)       backendUpdates.sensitivity       = updates.sensitivity;
    if (updates.followupTiming)    backendUpdates.followup_timing   = updates.followupTiming;
    if (updates.trackedCategories) backendUpdates.tracked_categories = updates.trackedCategories;
    if (updates.notifications) {
      if (updates.notifications.potentialClient !== undefined)
        backendUpdates.notify_potential_client = updates.notifications.potentialClient;
      if (updates.notifications.followupAlert !== undefined)
        backendUpdates.notify_followup = updates.notifications.followupAlert;
      if (updates.notifications.urgentEmail !== undefined)
        backendUpdates.notify_urgent = updates.notifications.urgentEmail;
    }

    // Optimistic local update
    setSettings(prev => ({ ...prev, ...updates }));

    try {
      await aiSettingsAPI.update(backendUpdates);
      toast.success("Settings updated");
    } catch (err) {
      toast.error(extractErrorDetail(err, "Failed to save settings"));
    }
  };

  /**
   * Gmail connect — mirrors Settings.js handleConnectGmail exactly:
   *   1. Call emailAPI.getGmailAuthUrl()
   *   2. Redirect to response.data.auth_url
   */
  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      const response = await emailAPI.getGmailAuthUrl();
      if (response.data?.auth_url) {
        toast.info("Redirecting to Google…");
        window.location.href = response.data.auth_url;
        return; // page will reload after OAuth callback
      }
      // Fallback if the URL key differs
      const fallbackUrl = response.data?.url || response.data?.redirect_url;
      if (fallbackUrl) {
        window.location.href = fallbackUrl;
      } else {
        toast.error("Could not get Gmail authorisation URL");
      }
    } catch (err) {
      toast.error(extractErrorDetail(err, "Failed to start Gmail connection"));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Cpu className="w-6 h-6 text-primary" />
          AI Control Center
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure AI intelligence and system settings
        </p>
      </div>

      <div className="p-6 space-y-6">

        {/* ── Profile, Plan & Credits ── */}
        <ProfilePlanCard
          user={user}
          planLimits={planLimits}
          accounts={accounts}
          loading={loading}
          onNavigate={navigate}
        />

        {/* ── Gmail Connection ── */}
        <GmailConnectionStatus
          accounts={accounts}
          onConnect={handleConnectGmail}
          connecting={connecting}
          loading={loading}
        />

        {/* ── Inbox Intelligence Stats ── */}
        <InboxIntelligenceStats stats={stats} loading={loading} />

        {/* ── Settings Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DetectionSettings
            settings={settings}
            onUpdate={handleUpdateSettings}
          />
          <NotificationSettings
            settings={settings}
            onUpdate={handleUpdateSettings}
          />
        </div>

        {/* ── Category Tracking ── */}
        <CategoryTracking
          settings={settings}
          onUpdate={handleUpdateSettings}
        />

        {/* ── AI Activity Log ── */}
        <AIActivityLog
          activities={stats?.recentActivities}
          loading={loading}
        />
      </div>
    </div>
  );
}
