import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { settingsAPI, emailAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  User, Mail, Bell, Clock, Shield, Trash2, Plus, Save,
  Loader2, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [settings, setSettings] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectDialog, setConnectDialog] = useState(false);
  const [connectEmail, setConnectEmail] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Profile state
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, accountsRes] = await Promise.all([
        settingsAPI.get(),
        emailAPI.getAccounts(),
      ]);
      setSettings(settingsRes.data);
      setAccounts(accountsRes.data || []);
      setFullName(user?.full_name || "");
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await settingsAPI.updateProfile({ full_name: fullName });
      await refreshUser();
      toast.success("Profile updated");
    } catch (err) {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (field, value) => {
    try {
      await settingsAPI.update({ [field]: value });
      setSettings((prev) => ({ ...prev, [field]: value }));
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Failed to save");
    }
  };

  const handleSaveSilenceRules = async (field, value) => {
    try {
      await settingsAPI.updateSilenceRules({ [field]: value });
      setSettings((prev) => ({ ...prev, [field]: value }));
      toast.success("Silence rules updated");
    } catch (err) {
      toast.error("Failed to save");
    }
  };

  const handleConnectGmail = async () => {
    if (!connectEmail) return;
    setConnecting(true);
    try {
      await emailAPI.connectGmail(connectEmail);
      toast.success("Gmail connected! Mock emails synced.");
      setConnectDialog(false);
      setConnectEmail("");
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (accountId) => {
    try {
      await settingsAPI.disconnectEmail(accountId);
      toast.success("Account disconnected");
      loadData();
    } catch (err) {
      toast.error("Failed to disconnect");
    }
  };

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
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1.5 max-w-sm"
              data-testid="profile-name-input"
            />
          </div>
          <div>
            <Label className="text-sm">Email</Label>
            <Input value={user?.email || ""} disabled className="mt-1.5 max-w-sm bg-muted" />
          </div>
          <div>
            <Label className="text-sm">Plan</Label>
            <div className="mt-1.5">
              <Badge className="capitalize bg-primary/10 text-primary border-primary/20">{user?.plan || "free"}</Badge>
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
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" /> Connected Email Accounts
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setConnectDialog(true)} data-testid="connect-gmail-settings-btn">
            <Plus className="w-4 h-4 mr-1.5" /> Connect Gmail
          </Button>
        </CardHeader>
        <CardContent>
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
                      <p className="text-sm font-medium">{a.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.status === "connected" ? (
                          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Connected</span>
                        ) : a.status}
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
              min={1}
              max={10}
              step={1}
              className="max-w-sm"
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
            <Switch
              checked={settings?.ignore_newsletters ?? true}
              onCheckedChange={(v) => handleSaveSilenceRules("ignore_newsletters", v)}
              data-testid="ignore-newsletters-switch"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ignore Notifications</p>
              <p className="text-xs text-muted-foreground">Skip automated system notifications</p>
            </div>
            <Switch
              checked={settings?.ignore_notifications ?? true}
              onCheckedChange={(v) => handleSaveSilenceRules("ignore_notifications", v)}
              data-testid="ignore-notifications-switch"
            />
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
            <Switch
              checked={settings?.daily_digest ?? true}
              onCheckedChange={(v) => handleSaveSettings("daily_digest", v)}
              data-testid="daily-digest-switch"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Weekly Report</p>
              <p className="text-xs text-muted-foreground">Get a weekly follow-up performance report</p>
            </div>
            <Switch
              checked={settings?.weekly_report ?? true}
              onCheckedChange={(v) => handleSaveSettings("weekly_report", v)}
              data-testid="weekly-report-switch"
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto-Send Settings */}
      <Card data-testid="autosend-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> Auto-Send
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Auto-Send</p>
              <p className="text-xs text-muted-foreground">Automatically send approved follow-ups within your send window</p>
            </div>
            <Switch
              checked={settings?.auto_send ?? false}
              onCheckedChange={(v) => handleSaveSettings("auto_send", v)}
              data-testid="auto-send-switch"
            />
          </div>
          {settings?.auto_send && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Send Window Start</Label>
                  <Input
                    type="time"
                    value={settings?.send_window_start || "09:00"}
                    onChange={(e) => handleSaveSettings("send_window_start", e.target.value)}
                    className="mt-1.5"
                    data-testid="send-start-input"
                  />
                </div>
                <div>
                  <Label className="text-sm">Send Window End</Label>
                  <Input
                    type="time"
                    value={settings?.send_window_end || "18:00"}
                    onChange={(e) => handleSaveSettings("send_window_end", e.target.value)}
                    className="mt-1.5"
                    data-testid="send-end-input"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm">Daily Send Limit</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={settings?.daily_send_limit || 20}
                  onChange={(e) => handleSaveSettings("daily_send_limit", parseInt(e.target.value) || 20)}
                  className="mt-1.5 max-w-[120px]"
                  data-testid="daily-limit-input"
                />
              </div>
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
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter your Gmail address to connect. Mock email data will be generated for demo purposes.
            </p>
            <div>
              <Label className="text-sm">Gmail Address</Label>
              <Input
                type="email"
                placeholder="you@gmail.com"
                value={connectEmail}
                onChange={(e) => setConnectEmail(e.target.value)}
                className="mt-1.5"
                data-testid="connect-email-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialog(false)}>Cancel</Button>
            <Button onClick={handleConnectGmail} disabled={connecting || !connectEmail} className="bg-primary hover:bg-primary/90 text-white" data-testid="confirm-connect-btn">
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
