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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  User, Mail, Bell, Clock, Shield, Trash2, Plus, Save,
  Loader2, CheckCircle2, Lock, ArrowUpRight, Filter, X, Target,
} from "lucide-react";
import { toast } from "sonner";

// ── Chip / Tag component for contact & domain lists ──────────
function TagInput({ tags, onAdd, onRemove, placeholder }) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      const val = input.trim().replace(/^,/, "");
      if (val && !tags.includes(val)) onAdd(val);
      setInput("");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 border border-border rounded-lg bg-background">
        {tags.map(tag => (
          <span key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
            {tag}
            <button onClick={() => onRemove(tag)} className="hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : "Add more…"}
          className="flex-1 min-w-[120px] text-xs bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>
      <p className="text-xs text-muted-foreground">Press Enter or comma to add</p>
    </div>
  );
}

export default function Settings() {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const { user, refreshUser } = useAuth();

  const [settings, setSettings]     = useState(null);
  const [accounts, setAccounts]     = useState([]);
  const [planLimits, setPlanLimits] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [connectDialog, setConnectDialog] = useState(false);
  const [connectEmail, setConnectEmail]   = useState("");
  const [connecting, setConnecting]       = useState(false);
  const [fullName, setFullName]           = useState("");

  // Follow-up scope state
  const [scope, setScope]                   = useState("sent_only");
  const [allowedContacts, setAllowedContacts] = useState([]);
  const [allowedDomains, setAllowedDomains]   = useState([]);
  const [blockedSenders, setBlockedSenders]   = useState([]);
  const [savingScope, setSavingScope]         = useState(false);

  const userPlan        = user?.plan || "free";
  const autoSendAllowed = isAutoSendAllowed(userPlan);

  useEffect(() => {
    loadData();
    if (searchParams.get("gmail") === "connected") {
      toast.success("Gmail account connected successfully! 🎉");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, accountsRes, limitsRes] = await Promise.allSettled([
        settingsAPI.get(),
        emailAPI.getAccounts(),
        billingAPI.getPlanLimits(),
      ]);

      if (settingsRes.status === "fulfilled") {
        const s = settingsRes.value.data;
        setSettings(s);
        // Populate scope state from settings response
        setScope(s.follow_up_scope || "sent_only");
        setAllowedContacts(s.allowed_contacts || []);
        setAllowedDomains(s.allowed_domains || []);
        setBlockedSenders(s.blocked_senders || []);
      } else {
        toast.error("Some settings could not be loaded");
      }

      if (accountsRes.status === "fulfilled")
        setAccounts(accountsRes.value.data || []);

      if (limitsRes.status === "fulfilled")
        setPlanLimits(limitsRes.value.data);

      setFullName(user?.full_name || "");
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  // ── Profile ──────────────────────────────────────────────
  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await settingsAPI.updateProfile({ full_name: fullName });
      await refreshUser();
      toast.success("Profile updated ✅");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  // ── General settings ─────────────────────────────────────
  const handleSaveSettings = async (field, value) => {
    try {
      await settingsAPI.update({ [field]: value });
      setSettings(prev => ({ ...prev, [field]: value }));
      toast.success("Settings saved ✅");
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error((err.response?.status === 403 && detail) ? detail : "Failed to save settings");
    }
  };

  const handleSaveSilenceRules = async (field, value) => {
    try {
      await settingsAPI.updateSilenceRules({ [field]: value });
      setSettings(prev => ({ ...prev, [field]: value }));
      toast.success("Silence rules updated ✅");
    } catch {
      toast.error("Failed to save silence rules");
    }
  };

  // ── Follow-up scope ──────────────────────────────────────
  const handleSaveScope = async () => {
    setSavingScope(true);
    try {
      await settingsAPI.updateFollowUpScope({
        follow_up_scope:  scope,
        allowed_contacts: allowedContacts,
        allowed_domains:  allowedDomains,
      });
      toast.success("Follow-up scope saved ✅");
    } catch {
      toast.error("Failed to save follow-up scope");
    } finally {
      setSavingScope(false);
    }
  };

  // ── Block / Unblock sender ───────────────────────────────
  const handleUnblockSender = async (email) => {
    try {
      await settingsAPI.unblockSender(email);
      setBlockedSenders(prev => prev.filter(s => s !== email));
      toast.success(`${email} unblocked`);
    } catch {
      toast.error("Failed to unblock sender");
    }
  };

  // ── Gmail connect ────────────────────────────────────────
  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      const response = await emailAPI.getGmailAuthUrl();
      if (response.data?.auth_url) {
        toast.info("Redirecting to Google…");
        window.location.href = response.data.auth_url;
        return;
      }
      if (connectEmail) {
        await emailAPI.connectGmail(connectEmail);
        setConnecting(false);
        toast.success("Gmail connected 🎉");
        setConnectDialog(false);
        setConnectEmail("");
        loadData();
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 403 && detail) toast.error(detail);
      else toast.error(detail || "Failed to connect Gmail");
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
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="settings-heading">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      {/* ── Profile ── */}
      <Card data-testid="profile-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">Full Name</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)}
              className="mt-1.5 max-w-sm" data-testid="profile-name-input" />
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
          <Button size="sm" onClick={handleSaveProfile} disabled={saving}
            data-testid="save-profile-btn" className="bg-primary hover:bg-primary/90 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* ── Email Accounts ── */}
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
          <Button size="sm" variant="outline" onClick={() => setConnectDialog(true)}
            disabled={accountLimitReached} data-testid="connect-gmail-settings-btn">
            {accountLimitReached
              ? <><Lock className="w-4 h-4 mr-1.5" />Limit Reached</>
              : <><Plus className="w-4 h-4 mr-1.5" />Connect Gmail</>}
          </Button>
        </CardHeader>
        <CardContent>
          {accountLimitReached && (
            <div className="mb-4 p-3 rounded-lg bg-accent/50 border border-primary/20 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                You've reached your limit ({planLimits?.max_email_accounts}). Upgrade to connect more.
              </p>
              <Button size="sm" variant="link" className="text-primary h-auto p-0 ml-3"
                onClick={() => navigate("/billing")}>
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
              {accounts.map(a => (
                <div key={a.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                  data-testid={`account-${a.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{a.email_address}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.is_active
                          ? <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Connected
                            </span>
                          : "Inactive"}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDisconnect(a.id)}
                    className="text-destructive" data-testid={`disconnect-${a.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── NEW: Follow-Up Control ── */}
      <Card data-testid="followup-scope-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4" /> Follow-Up Control
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Choose which email conversations get processed for follow-ups
          </p>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Scope radio buttons */}
          <RadioGroup value={scope} onValueChange={setScope} className="space-y-3">
            <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer
              ${scope === "sent_only" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              onClick={() => setScope("sent_only")}>
              <RadioGroupItem value="sent_only" id="sent_only" className="mt-0.5" />
              <div>
                <Label htmlFor="sent_only" className="text-sm font-medium cursor-pointer">
                  Only emails I sent <Badge variant="secondary" className="ml-1.5 text-xs">Recommended</Badge>
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Follow up only on conversations where you sent the last message
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer
              ${scope === "manual_contacts" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              onClick={() => setScope("manual_contacts")}>
              <RadioGroupItem value="manual_contacts" id="manual_contacts" className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="manual_contacts" className="text-sm font-medium cursor-pointer">
                  Only selected contacts
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Follow up only with specific email addresses
                </p>
                {scope === "manual_contacts" && (
                  <div className="mt-3">
                    <TagInput
                      tags={allowedContacts}
                      onAdd={val => setAllowedContacts(prev => [...prev, val])}
                      onRemove={val => setAllowedContacts(prev => prev.filter(c => c !== val))}
                      placeholder="Add email address…"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer
              ${scope === "domain_based" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              onClick={() => setScope("domain_based")}>
              <RadioGroupItem value="domain_based" id="domain_based" className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="domain_based" className="text-sm font-medium cursor-pointer">
                  Only specific domains
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Follow up only with emails from certain domains (e.g. @client.com)
                </p>
                {scope === "domain_based" && (
                  <div className="mt-3">
                    <TagInput
                      tags={allowedDomains}
                      onAdd={val => setAllowedDomains(prev => [...prev, val.startsWith("@") ? val : `@${val}`])}
                      onRemove={val => setAllowedDomains(prev => prev.filter(d => d !== val))}
                      placeholder="Add domain e.g. @client.com…"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer
              ${scope === "all" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              onClick={() => setScope("all")}>
              <RadioGroupItem value="all" id="all" className="mt-0.5" />
              <div>
                <Label htmlFor="all" className="text-sm font-medium cursor-pointer">All emails</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Process all non-automated conversations
                </p>
              </div>
            </div>
          </RadioGroup>

          <Button size="sm" onClick={handleSaveScope} disabled={savingScope}
            className="bg-primary hover:bg-primary/90 text-white">
            {savingScope ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Follow-Up Control
          </Button>
        </CardContent>
      </Card>

      {/* ── NEW: Blocked Senders ── */}
      <Card data-testid="blocked-senders-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" /> Blocked Senders
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Emails from these senders will never appear in your queue
          </p>
        </CardHeader>
        <CardContent>
          {blockedSenders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No blocked senders. Use "Ignore Sender" on any thread card to block them.
            </p>
          ) : (
            <div className="space-y-2">
              {blockedSenders.map(sender => (
                <div key={sender}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/30">
                  <span className="text-sm">{sender}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleUnblockSender(sender)}
                    className="text-muted-foreground hover:text-destructive h-7">
                    <X className="w-3.5 h-3.5 mr-1" /> Unblock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Silence Detection Rules ── */}
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
            <p className="text-xs text-muted-foreground mt-1">
              Threads with no reply after this many days are flagged as silent
            </p>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ignore Newsletters</p>
              <p className="text-xs text-muted-foreground">Skip automated newsletter emails</p>
            </div>
            <Switch checked={settings?.ignore_newsletters ?? true}
              onCheckedChange={v => handleSaveSilenceRules("ignore_newsletters", v)}
              data-testid="ignore-newsletters-switch" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ignore Notifications</p>
              <p className="text-xs text-muted-foreground">Skip automated system notifications</p>
            </div>
            <Switch checked={settings?.ignore_notifications ?? true}
              onCheckedChange={v => handleSaveSilenceRules("ignore_notifications", v)}
              data-testid="ignore-notifications-switch" />
          </div>
        </CardContent>
      </Card>

      {/* ── Notifications ── */}
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
            <Switch checked={settings?.daily_digest ?? true}
              onCheckedChange={v => handleSaveSettings("daily_digest", v)}
              data-testid="daily-digest-switch" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Weekly Report</p>
              <p className="text-xs text-muted-foreground">Get a weekly follow-up performance report</p>
            </div>
            <Switch checked={settings?.weekly_report ?? true}
              onCheckedChange={v => handleSaveSettings("weekly_report", v)}
              data-testid="weekly-report-switch" />
          </div>
        </CardContent>
      </Card>

      {/* ── Auto-Send ── */}
      <Card data-testid="autosend-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> Auto-Send
            {!autoSendAllowed && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                <Lock className="w-3 h-3 mr-1" /> Pro+
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!autoSendAllowed ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">Auto-send is available on Pro and Business plans.</p>
              <Button size="sm" onClick={() => navigate("/billing")}
                className="bg-primary hover:bg-primary/90 text-white" data-testid="upgrade-autosend-btn">
                Upgrade Plan <ArrowUpRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enable Auto-Send</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically send approved follow-ups within your send window
                  </p>
                </div>
                <Switch checked={settings?.auto_send ?? false}
                  onCheckedChange={v => handleSaveSettings("auto_send", v)}
                  data-testid="auto-send-switch" />
              </div>
              {settings?.auto_send && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Send Window Start</Label>
                      <Input type="time" value={settings?.send_window_start || "09:00"}
                        onChange={e => handleSaveSettings("send_window_start", e.target.value)}
                        className="mt-1.5" data-testid="send-start-input" />
                    </div>
                    <div>
                      <Label className="text-sm">Send Window End</Label>
                      <Input type="time" value={settings?.send_window_end || "18:00"}
                        onChange={e => handleSaveSettings("send_window_end", e.target.value)}
                        className="mt-1.5" data-testid="send-end-input" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">Daily Send Limit</Label>
                    <Input type="number" min={1} max={100}
                      value={settings?.daily_send_limit || 20}
                      onChange={e => handleSaveSettings("daily_send_limit", parseInt(e.target.value) || 20)}
                      className="mt-1.5 max-w-[120px]" data-testid="daily-limit-input" />
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Connect Gmail Dialog ── */}
      <Dialog open={connectDialog} onOpenChange={setConnectDialog}>
        <DialogContent data-testid="connect-gmail-dialog">
          <DialogHeader>
            <DialogTitle>Connect Gmail Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Gmail account to sync emails and detect silent conversations.
            </p>
            <Button onClick={handleConnectGmail} disabled={connecting}
              className="w-full bg-primary hover:bg-primary/90 text-white" data-testid="google-oauth-btn">
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Sign in with Google
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">or demo mode</span>
              </div>
            </div>
            <div>
              <Label className="text-sm">Email for Demo</Label>
              <Input type="email" placeholder="you@gmail.com" value={connectEmail}
                onChange={e => setConnectEmail(e.target.value)} className="mt-1.5"
                data-testid="connect-email-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialog(false)}>Cancel</Button>
            <Button onClick={handleConnectGmail} disabled={connecting || !connectEmail}
              variant="outline" data-testid="confirm-connect-btn">
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Connect Demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
