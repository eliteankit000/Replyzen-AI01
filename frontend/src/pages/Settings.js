import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { settingsAPI, emailAPI, billingAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isAutoSendAllowed } from "@/lib/plan-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  User, Mail, Bell, Clock, Shield, Trash2, Plus, Save,
  Loader2, CheckCircle2, Lock, ArrowUpRight
} from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();

  /* ── Data state ── */
  const [settings, setSettings]       = useState(null);
  const [accounts, setAccounts]       = useState([]);
  const [planLimits, setPlanLimits]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [connectDialog, setConnectDialog] = useState(false);
  const [connectEmail, setConnectEmail]   = useState("");
  const [connecting, setConnecting]       = useState(false);
  const [fullName, setFullName]           = useState("");

  const userPlan       = user?.plan || "free";
  const autoSendAllowed = isAutoSendAllowed(userPlan);

  useEffect(() => { 
    loadData(); 
    
    // Check for Gmail callback success
    if (searchParams.get("gmail") === "connected") {
      toast.success("Gmail account connected successfully! 🎉");
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // FIX (ERROR 1 & 4): Use Promise.allSettled instead of Promise.all.
      // settingsAPI.get() triggers the backend query that hits the missing
      // ignore_newsletters / ignore_notifications columns, causing a 500.
      // With Promise.all, that single failure crashes the entire settings page
      // ("Failed to load data"). allSettled lets accounts and planLimits still
      // load while settings degrades gracefully until the DB migration is applied.
      const [settingsRes, accountsRes, limitsRes] = await Promise.allSettled([
        settingsAPI.get(),
        emailAPI.getAccounts(),
        billingAPI.getPlanLimits(),
      ]);

      if (settingsRes.status === "fulfilled") {
        setSettings(settingsRes.value.data);
      } else {
        console.error("Failed to load user settings:", settingsRes.reason);
        toast.error("Some settings could not be loaded");
      }

      if (accountsRes.status === "fulfilled") {
        setAccounts(accountsRes.value.data || []);
      } else {
        console.error("Failed to load email accounts:", accountsRes.reason);
      }

      if (limitsRes.status === "fulfilled") {
        setPlanLimits(limitsRes.value.data);
      } else {
        console.error("Failed to load plan limits:", limitsRes.reason);
      }

      setFullName(user?.full_name || "");
    } catch (err) {
      console.error("Failed to load settings:", err);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await settingsAPI.updateProfile({ full_name: fullName });
      await refreshUser();
      toast.success("Profile updated successfully ✅");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (field, value) => {
    try {
      await settingsAPI.update({ [field]: value });
      setSettings((prev) => ({ ...prev, [field]: value }));
      toast.success("Settings saved ✅");
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(
        (err.response?.status === 403 && detail) ? detail : "Failed to save settings"
      );
    }
  };

  const handleSaveSilenceRules = async (field, value) => {
    try {
      await settingsAPI.updateSilenceRules({ [field]: value });
      setSettings((prev) => ({ ...prev, [field]: value }));
      toast.success("Silence rules updated ✅");
    } catch {
      toast.error("Failed to save silence rules");
    }
  };

  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      const response = await emailAPI.getGmailAuthUrl();
      if (response.data?.auth_url) {
        toast.info("Redirecting to Google for authentication...");
        window.location.href = response.data.auth_url;
        return;
      }
      // Fallback to demo mode
      if (connectEmail) {
        await emailAPI.connectGmail(connectEmail);
        setConnecting(false);
        toast.success("Gmail account connected successfully! 🎉");
        setConnectDialog(false);
        setConnectEmail("");
        loadData();
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 500 && connectEmail) {
        // Try demo mode fallback
        try {
          await emailAPI.connectGmail(connectEmail);
          setConnecting(false);
          toast.success("Gmail account connected (demo mode) ✅");
          setConnectDialog(false);
          setConnectEmail("");
          loadData();
          return;
        } catch (demoErr) {
          toast.error(demoErr.response?.data?.detail || "Failed to connect Gmail");
        }
      } else if (err.response?.status === 403 && detail) {
        toast.error(detail);
      } else {
        toast.error(detail || "Failed to connect Gmail");
      }
      setConnecting(false);
    }
  };

  const handleDisconnect = async (accountId) => {
    try {
      await settingsAPI.disconnectEmail(accountId);
      toast.success("Account disconnected ✅");
      loadData();
    } catch {
      toast.error("Failed to disconnect account");
    }
  };

  const accountLimitReached = planLimits && accounts.length >= planLimits.max_email_accounts;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl" data-testid="settings-page">

      <div>
        <h1 className="text-2xl font-bold" data-testid="settings-heading">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <Card data-testid="profile-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1.5 max-w-sm" data-testid="profile-name-input" />
          </div>
          <div>
            <Label className="text-sm">Email</Label>
            <Input value={user?.email || ""} disabled className="mt-1.5 max-w-sm bg-muted" />
          </div>
          <div>
            <Label className="text-sm">Plan</Label>
            <div className="mt-1.5">
              <Badge className="capitalize bg-primary/10 text-primary border-primary/20">{userPlan}</Badge>
            </div>
          </div>
          <Button size="sm" onClick={handleSaveProfile} disabled={saving} data-testid="save-profile-btn" className="bg-primary hover:bg-primary/90 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Email Accounts */}
      <Card data-testid="email-accounts-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4" /> Connected Email Accounts
            </CardTitle>
            {planLimits && (
              <p className="text-xs text-muted-foreground mt-1">
                {accounts.length} / {planLimits.max_email_accounts} accounts used
              </p>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setConnectDialog(true)} disabled={accountLimitReached} data-testid="connect-gmail-settings-btn">
            {accountLimitReached
              ? <><Lock className="w-4 h-4 mr-1.5" /> Limit Reached</>
              : <><Plus className="w-4 h-4 mr-1.5" /> Connect Gmail</>
            }
          </Button>
        </CardHeader>
        <CardContent>
          {accountLimitReached && (
            <div className="mb-4 p-3 rounded-lg bg-accent/50 border border-primary/20 flex items-center justify-between" data-testid="account-limit-msg">
              <p className="text-xs text-muted-foreground">
                You've reached your email account limit ({planLimits?.max_email_accounts}). Upgrade to connect more.
              </p>
              <Button size="sm" variant="link" className="text-primary h-auto p-0 shrink-0 ml-3" onClick={() => navigate("/billing")}>
                Upgrade <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
          {accounts.length === 0 ? (
            <div className="text-center py-6">
              <Mail className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No email accounts connected</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-border" data-testid={`account-${a.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{a.email_address}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.is_active
                          ? <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Connected</span>
                          : "Inactive"}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDisconnect(a.id)} className="text-destructive" data-testid={`disconnect-${a.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Silence Detection Rules */}
      <Card data-testid="silence-rules-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> Silence Detection Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Silence Threshold</Label>
              <span className="text-sm font-medium text-primary">{settings?.silence_delay_days || 3} days</span>
            </div>
            <Slider
              value={[settings?.silence_delay_days || 3]}
              onValueChange={([val]) => handleSaveSilenceRules("silence_delay_days", val)}
              min={1} max={10} step={1} className="max-w-sm"
              data-testid="silence-threshold-slider"
            />
            <p className="text-xs text-muted-foreground mt-1">Threads with no reply after this many days are flagged as silent</p>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ignore Newsletters</p>
              <p className="text-xs text-muted-foreground">Skip automated newsletter emails</p>
            </div>
            <Switch checked={settings?.ignore_newsletters ?? true} onCheckedChange={(v) => handleSaveSilenceRules("ignore_newsletters", v)} data-testid="ignore-newsletters-switch" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ignore Notifications</p>
              <p className="text-xs text-muted-foreground">Skip automated system notifications</p>
            </div>
            <Switch checked={settings?.ignore_notifications ?? true} onCheckedChange={(v) => handleSaveSilenceRules("ignore_notifications", v)} data-testid="ignore-notifications-switch" />
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card data-testid="notifications-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" /> Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Daily Digest</p>
              <p className="text-xs text-muted-foreground">Receive a daily summary of silent threads</p>
            </div>
            <Switch checked={settings?.daily_digest ?? true} onCheckedChange={(v) => handleSaveSettings("daily_digest", v)} data-testid="daily-digest-switch" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Weekly Report</p>
              <p className="text-xs text-muted-foreground">Get a weekly follow-up performance report</p>
            </div>
            <Switch checked={settings?.weekly_report ?? true} onCheckedChange={(v) => handleSaveSettings("weekly_report", v)} data-testid="weekly-report-switch" />
          </div>
        </CardContent>
      </Card>

      {/* Auto-Send Settings */}
      <Card data-testid="autosend-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> Auto-Send
            {!autoSendAllowed && <Badge variant="outline" className="text-xs text-muted-foreground"><Lock className="w-3 h-3 mr-1" /> Pro+</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!autoSendAllowed ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">Auto-send is available on Pro and Business plans.</p>
              <Button size="sm" onClick={() => navigate("/billing")} className="bg-primary hover:bg-primary/90 text-white" data-testid="upgrade-autosend-btn">
                Upgrade Plan <ArrowUpRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enable Auto-Send</p>
                  <p className="text-xs text-muted-foreground">Automatically send approved follow-ups within your send window</p>
                </div>
                <Switch checked={settings?.auto_send ?? false} onCheckedChange={(v) => handleSaveSettings("auto_send", v)} data-testid="auto-send-switch" />
              </div>
              {settings?.auto_send && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Send Window Start</Label>
                      <Input type="time" value={settings?.send_window_start || "09:00"} onChange={(e) => handleSaveSettings("send_window_start", e.target.value)} className="mt-1.5" data-testid="send-start-input" />
                    </div>
                    <div>
                      <Label className="text-sm">Send Window End</Label>
                      <Input type="time" value={settings?.send_window_end || "18:00"} onChange={(e) => handleSaveSettings("send_window_end", e.target.value)} className="mt-1.5" data-testid="send-end-input" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">Daily Send Limit</Label>
                    <Input type="number" min={1} max={100} value={settings?.daily_send_limit || 20} onChange={(e) => handleSaveSettings("daily_send_limit", parseInt(e.target.value) || 20)} className="mt-1.5 max-w-[120px]" data-testid="daily-limit-input" />
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Connect Gmail Dialog */}
      <Dialog open={connectDialog} onOpenChange={setConnectDialog}>
        <DialogContent data-testid="connect-gmail-dialog">
          <DialogHeader>
            <DialogTitle>Connect Gmail Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Gmail account to sync emails and detect silent conversations.
            </p>
            <Button onClick={handleConnectGmail} disabled={connecting} className="w-full bg-primary hover:bg-primary/90 text-white" data-testid="google-oauth-btn">
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Sign in with Google
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">or use demo mode</span>
              </div>
            </div>
            <div>
              <Label className="text-sm">Email for Demo</Label>
              <Input type="email" placeholder="you@gmail.com" value={connectEmail} onChange={(e) => setConnectEmail(e.target.value)} className="mt-1.5" data-testid="connect-email-input" />
              <p className="text-xs text-muted-foreground mt-1">Demo mode creates sample email data</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialog(false)}>Cancel</Button>
            <Button onClick={handleConnectGmail} disabled={connecting || !connectEmail} variant="outline" data-testid="confirm-connect-btn">
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Connect Demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
