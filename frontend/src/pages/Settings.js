/**
 * Settings.js — Refactored with Smart Reply Mode
 * ================================================
 * CHANGES vs original:
 *   1. "Auto-Send" card replaced with "Smart Reply Mode" card (same position in page).
 *   2. Smart Reply Mode card has: toggle, config panel, first-time modal.
 *   3. New "Smart Reply Activity" card shows queued / sent / cancelled emails.
 *   4. Live countdown timer for queued emails with Cancel button.
 *
 * ALL other cards (Profile, Email Accounts, Follow-Up Control,
 * Blocked Senders, Silence Rules, Notifications) are 100% unchanged.
 */

import { useState, useEffect, useCallback, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  User, Mail, Bell, Clock, Shield, Trash2, Plus, Save,
  Loader2, CheckCircle2, Lock, ArrowUpRight, Filter, X, Target,
  Zap, Timer, Ban, Send, AlertCircle, Info,
} from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// Smart Reply API helper
// NOTE: Add these methods to your @/lib/api.js file and remove this block.
// ─────────────────────────────────────────────────────────────────
const smartReplyAPI = {
  getSettings: () =>
    fetch("/api/smart-reply/settings", { credentials: "include" }).then(r => r.json()),

  saveSettings: (data) =>
    fetch("/api/smart-reply/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => {
      if (!r.ok) return r.json().then(e => Promise.reject(e));
      return r.json();
    }),

  getQueue: (status) => {
    const qs = status ? `?status=${status}` : "";
    return fetch(`/api/smart-reply/queue${qs}`, { credentials: "include" }).then(r => r.json());
  },

  cancelEmail: (queueId) =>
    fetch(`/api/smart-reply/queue/${queueId}/cancel`, {
      method: "POST",
      credentials: "include",
    }).then(r => {
      if (!r.ok) return r.json().then(e => Promise.reject(e));
      return r.json();
    }),
};

// ─────────────────────────────────────────────────────────────────
// Chip / Tag component — UNCHANGED from original
// ─────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────
// Countdown display for queued emails
// ─────────────────────────────────────────────────────────────────
function CountdownTimer({ scheduledAt }) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const target = new Date(scheduledAt).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [scheduledAt]);

  if (secondsLeft <= 0) return <span className="text-xs text-emerald-600 font-medium">Sending now…</span>;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const label = mins > 0
    ? `${mins}m ${secs}s`
    : `${secs}s`;

  return (
    <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
      <Timer className="w-3 h-3" />
      Sends in {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
// Category options for Smart Reply
// ─────────────────────────────────────────────────────────────────
const CATEGORY_OPTIONS = [
  { value: "faq",       label: "FAQ",        description: "Frequently asked questions" },
  { value: "inquiry",   label: "Inquiry",    description: "General inquiries" },
  { value: "follow_up", label: "Follow-up",  description: "Follow-up conversations" },
  { value: "support",   label: "Support",    description: "Support requests" },
  { value: "sales",     label: "Sales",      description: "Sales-related emails" },
];

// ─────────────────────────────────────────────────────────────────
// First-Time Confirmation Modal
// ─────────────────────────────────────────────────────────────────
function SmartReplyConfirmationModal({ open, onConfirm, onCancel }) {
  const [checked, setChecked] = useState(false);

  // Reset checkbox every time the modal opens
  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={val => !val && onCancel()}>
      <DialogContent className="max-w-md" data-testid="smart-reply-confirm-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Enable Smart Reply Mode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">
              How Smart Reply Mode works:
            </p>
            <ul className="space-y-2">
              {[
                "Emails are sent based on your rules — never without your configuration.",
                "Each email waits in a queue for your chosen delay before sending.",
                "You can cancel any queued email before it sends.",
                "You can disable Smart Reply Mode at any time.",
                "Daily send limits are enforced automatically.",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40 p-3 flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Smart Reply Mode is a user-controlled automation.
              Emails are sent based on your rules — you remain in control at all times.
            </p>
          </div>

          {/* FIX: removed onClick from parent div — it was double-toggling with onCheckedChange */}
          <div className="flex items-start gap-2.5">
            <Checkbox
              checked={checked}
              onCheckedChange={(val) => setChecked(Boolean(val))}
              id="sr-confirm-check"
              className="mt-0.5 cursor-pointer"
            />
            <Label
              htmlFor="sr-confirm-check"
              className="text-sm cursor-pointer leading-snug select-none"
            >
              I understand how Smart Reply Mode works and want to enable it
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} data-testid="sr-modal-cancel">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!checked}
            className="bg-primary hover:bg-primary/90 text-white"
            data-testid="sr-modal-confirm"
          >
            <Zap className="w-4 h-4 mr-1.5" />
            Enable Smart Reply Mode
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────
// Queue Item Row
// ─────────────────────────────────────────────────────────────────
function QueueItemRow({ item, onCancel }) {
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await onCancel(item.id);
    } finally {
      setCancelling(false);
    }
  };

  const statusBadge = {
    queued:    <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs">Queued</Badge>,
    sent:      <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-xs">Sent</Badge>,
    cancelled: <Badge variant="outline" className="text-muted-foreground border-muted text-xs">Cancelled</Badge>,
  }[item.status] || null;

  return (
    <div
      className="p-3 rounded-lg border border-border bg-background space-y-1.5"
      data-testid={`queue-item-${item.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium truncate flex-1">{item.subject || "(No Subject)"}</p>
        {statusBadge}
      </div>
      <p className="text-xs text-muted-foreground truncate">To: {item.to_email}</p>
      <div className="flex items-center justify-between">
        {item.status === "queued" ? (
          <CountdownTimer scheduledAt={item.scheduled_at} />
        ) : item.status === "sent" ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Send className="w-3 h-3" />
            Sent {item.sent_at ? new Date(item.sent_at).toLocaleTimeString() : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Ban className="w-3 h-3" /> Cancelled
          </span>
        )}

        {item.status === "queued" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            disabled={cancelling}
            className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            data-testid={`cancel-queue-${item.id}`}
          >
            {cancelling
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <><X className="w-3 h-3 mr-1" />Cancel</>}
          </Button>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────
// Main Settings Component
// ─────────────────────────────────────────────────────────────────
export default function Settings() {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const { user, refreshUser } = useAuth();

  // ── Existing state (UNCHANGED) ──────────────────────────────────
  const [settings, setSettings]     = useState(null);
  const [accounts, setAccounts]     = useState([]);
  const [planLimits, setPlanLimits] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [connectDialog, setConnectDialog] = useState(false);
  const [connectEmail, setConnectEmail]   = useState("");
  const [connecting, setConnecting]       = useState(false);
  const [fullName, setFullName]           = useState("");

  const [scope, setScope]                   = useState("sent_only");
  const [allowedContacts, setAllowedContacts] = useState([]);
  const [allowedDomains, setAllowedDomains]   = useState([]);
  const [blockedSenders, setBlockedSenders]   = useState([]);
  const [savingScope, setSavingScope]         = useState(false);

  // ── NEW: Smart Reply state ───────────────────────────────────────
  const [srSettings, setSrSettings] = useState({
    enabled:              false,
    confidence_threshold: 80,
    daily_limit:          20,
    delay_seconds:        120,
    allowed_categories:   ["faq", "inquiry"],
    confirmed_first_use:  false,
  });
  const [srMeta, setSrMeta]           = useState({ daily_sent_today: 0, daily_remaining: 20 });
  const [srLoading, setSrLoading]     = useState(true);
  const [srSaving, setSrSaving]       = useState(false);
  const [srConfirmModal, setSrConfirmModal] = useState(false);

  const [queueItems, setQueueItems]   = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueTab, setQueueTab]       = useState("queued"); // 'queued' | 'sent' | 'cancelled'

  const queuePollRef = useRef(null);

  const userPlan        = user?.plan || "free";
  const autoSendAllowed = isAutoSendAllowed(userPlan);

  // ── Load all data ────────────────────────────────────────────────
  useEffect(() => {
    loadData();
    if (searchParams.get("gmail") === "connected") {
      toast.success("Gmail account connected successfully! 🎉");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Poll queue every 10s when tab is 'queued' and Smart Reply is enabled
  useEffect(() => {
    if (srSettings.enabled && queueTab === "queued") {
      queuePollRef.current = setInterval(() => loadQueue("queued"), 10_000);
    }
    return () => clearInterval(queuePollRef.current);
  }, [srSettings.enabled, queueTab]);

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

    // Load Smart Reply settings separately (non-blocking)
    loadSmartReplySettings();
    loadQueue("queued");
  };

  const loadSmartReplySettings = async () => {
    setSrLoading(true);
    try {
      const res = await smartReplyAPI.getSettings();
      if (res.data) {
        setSrSettings(res.data);
        setSrMeta(res.meta || { daily_sent_today: 0, daily_remaining: 20 });
      }
    } catch (e) {
      // Non-fatal — Smart Reply settings may not exist yet (first use)
      console.warn("Smart Reply settings not loaded:", e);
    } finally {
      setSrLoading(false);
    }
  };

  const loadQueue = useCallback(async (status) => {
    setQueueLoading(true);
    try {
      const res = await smartReplyAPI.getQueue(status);
      if (res.data) setQueueItems(res.data);
    } catch (e) {
      console.warn("Queue load failed:", e);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  // ── Existing handlers (UNCHANGED) ───────────────────────────────

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

  const handleUnblockSender = async (email) => {
    try {
      await settingsAPI.unblockSender(email);
      setBlockedSenders(prev => prev.filter(s => s !== email));
      toast.success(`${email} unblocked`);
    } catch {
      toast.error("Failed to unblock sender");
    }
  };

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

  // ── NEW: Smart Reply handlers ────────────────────────────────────

  const handleSmartReplyToggle = (newValue) => {
    if (newValue && !srSettings.confirmed_first_use) {
      // Show first-time confirmation modal
      setSrConfirmModal(true);
      return;
    }
    saveSmartReplySettings({ ...srSettings, enabled: newValue });
  };

  const handleSmartReplyConfirm = async () => {
    setSrConfirmModal(false);
    await saveSmartReplySettings({
      ...srSettings,
      enabled: true,
      confirmed_first_use: true,
    });
  };

  const saveSmartReplySettings = async (newSettings) => {
    setSrSaving(true);
    try {
      const res = await smartReplyAPI.saveSettings(newSettings);
      if (res.data) {
        setSrSettings(res.data);
        toast.success("Smart Reply Mode updated ✅");
      }
    } catch (err) {
      const detail = err?.detail || "Failed to save Smart Reply settings";
      toast.error(detail);
    } finally {
      setSrSaving(false);
    }
  };

  const handleSrFieldChange = (field, value) => {
    setSrSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSrSaveConfig = () => {
    saveSmartReplySettings(srSettings);
  };

  const handleCategoryToggle = (cat) => {
    setSrSettings(prev => {
      const current = prev.allowed_categories || [];
      const updated = current.includes(cat)
        ? current.filter(c => c !== cat)
        : [...current, cat];
      return { ...prev, allowed_categories: updated };
    });
  };

  const handleCancelQueueItem = async (queueId) => {
    try {
      await smartReplyAPI.cancelEmail(queueId);
      toast.success("Email cancelled — it will not be sent.");
      // Refresh queue
      await loadQueue(queueTab);
    } catch (err) {
      const detail = err?.detail || "Failed to cancel email";
      toast.error(detail);
    }
  };

  const handleQueueTabChange = (tab) => {
    setQueueTab(tab);
    loadQueue(tab);
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

      {/* ── Profile (UNCHANGED) ── */}
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

      {/* ── Email Accounts (UNCHANGED) ── */}
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

      {/* ── Follow-Up Control (UNCHANGED) ── */}
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
          <RadioGroup value={scope} onValueChange={setScope} className="space-y-3">
            {[
              { value: "sent_only", label: "Only emails I sent", rec: true,
                desc: "Follow up only on conversations where you sent the last message" },
              { value: "manual_contacts", label: "Only selected contacts",
                desc: "Follow up only with specific email addresses" },
              { value: "domain_based", label: "Only specific domains",
                desc: "Follow up only with emails from certain domains (e.g. @client.com)" },
              { value: "all", label: "All emails",
                desc: "Process all non-automated conversations" },
            ].map(opt => (
              <div key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer
                  ${scope === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                onClick={() => setScope(opt.value)}>
                <RadioGroupItem value={opt.value} id={opt.value} className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor={opt.value} className="text-sm font-medium cursor-pointer">
                    {opt.label}
                    {opt.rec && <Badge variant="secondary" className="ml-1.5 text-xs">Recommended</Badge>}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  {scope === "manual_contacts" && opt.value === "manual_contacts" && (
                    <div className="mt-3">
                      <TagInput tags={allowedContacts}
                        onAdd={val => setAllowedContacts(prev => [...prev, val])}
                        onRemove={val => setAllowedContacts(prev => prev.filter(c => c !== val))}
                        placeholder="Add email address…" />
                    </div>
                  )}
                  {scope === "domain_based" && opt.value === "domain_based" && (
                    <div className="mt-3">
                      <TagInput tags={allowedDomains}
                        onAdd={val => setAllowedDomains(prev => [...prev, val.startsWith("@") ? val : `@${val}`])}
                        onRemove={val => setAllowedDomains(prev => prev.filter(d => d !== val))}
                        placeholder="Add domain e.g. @client.com…" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </RadioGroup>
          <Button size="sm" onClick={handleSaveScope} disabled={savingScope}
            className="bg-primary hover:bg-primary/90 text-white">
            {savingScope ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Follow-Up Control
          </Button>
        </CardContent>
      </Card>

      {/* ── Blocked Senders (UNCHANGED) ── */}
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

      {/* ── Silence Detection Rules (UNCHANGED) ── */}
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

      {/* ── Notifications (UNCHANGED) ── */}
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

      {/* ── NEW: Smart Reply Mode (replaces Auto-Send card) ── */}
      <Card data-testid="smart-reply-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" /> Smart Reply Mode
            {!autoSendAllowed && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                <Lock className="w-3 h-3 mr-1" /> Pro+
              </Badge>
            )}
            {srSettings.enabled && (
              <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            User-controlled automation — emails are sent based on your rules. You can cancel anytime before sending.
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          {!autoSendAllowed ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                Smart Reply Mode is available on Pro and Business plans.
              </p>
              <Button size="sm" onClick={() => navigate("/billing")}
                className="bg-primary hover:bg-primary/90 text-white" data-testid="upgrade-smartreply-btn">
                Upgrade Plan <ArrowUpRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          ) : srLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : (
            <>
              {/* Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enable Smart Reply Mode</p>
                  <p className="text-xs text-muted-foreground">
                    Emails are sent based on your rules, with a delay window you can cancel
                  </p>
                </div>
                <Switch
                  checked={srSettings.enabled}
                  onCheckedChange={handleSmartReplyToggle}
                  disabled={srSaving}
                  data-testid="smart-reply-toggle"
                />
              </div>

              {/* Info banner when disabled */}
              {!srSettings.enabled && (
                <div className="flex gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    No email will be sent automatically until you enable Smart Reply Mode
                    and configure your rules below.
                  </p>
                </div>
              )}

              {/* Config panel — visible when enabled */}
              {srSettings.enabled && (
                <>
                  <Separator />

                  {/* Daily usage indicator */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div>
                      <p className="text-xs font-medium text-primary">Today's Usage</p>
                      <p className="text-xs text-muted-foreground">
                        {srMeta.daily_sent_today} sent · {srMeta.daily_remaining} remaining
                      </p>
                    </div>
                    <Badge variant="outline" className="text-primary border-primary/30 text-xs">
                      {srMeta.daily_sent_today} / {srSettings.daily_limit}
                    </Badge>
                  </div>

                  {/* AI Confidence Threshold */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm">
                        AI Confidence Threshold
                        <span className="ml-1 text-xs text-muted-foreground">(minimum to queue)</span>
                      </Label>
                      <span className="text-sm font-medium text-primary">
                        {srSettings.confidence_threshold}%
                      </span>
                    </div>
                    <Slider
                      value={[srSettings.confidence_threshold]}
                      onValueChange={([val]) => handleSrFieldChange("confidence_threshold", val)}
                      min={50} max={100} step={5}
                      className="max-w-sm"
                      data-testid="confidence-threshold-slider"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Only queue emails where AI confidence is at or above this level
                    </p>
                  </div>

                  {/* Daily Limit */}
                  <div>
                    <Label className="text-sm">Daily Send Limit</Label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <Input
                        type="number" min={1} max={500}
                        value={srSettings.daily_limit}
                        onChange={e => handleSrFieldChange("daily_limit", parseInt(e.target.value) || 20)}
                        className="max-w-[120px]"
                        data-testid="sr-daily-limit-input"
                      />
                      <p className="text-xs text-muted-foreground">emails per day</p>
                    </div>
                  </div>

                  {/* Delay Before Sending */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm">
                        Delay Before Sending
                        <span className="ml-1 text-xs text-muted-foreground">(cancel window)</span>
                      </Label>
                      <span className="text-sm font-medium text-primary">
                        {srSettings.delay_seconds >= 60
                          ? `${Math.floor(srSettings.delay_seconds / 60)}m ${srSettings.delay_seconds % 60}s`
                          : `${srSettings.delay_seconds}s`}
                      </span>
                    </div>
                    <Slider
                      value={[srSettings.delay_seconds]}
                      onValueChange={([val]) => handleSrFieldChange("delay_seconds", val)}
                      min={30} max={3600} step={30}
                      className="max-w-sm"
                      data-testid="sr-delay-slider"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Emails wait this long in the queue — cancel anytime before they send
                    </p>
                  </div>

                  {/* Category Selection */}
                  <div>
                    <Label className="text-sm mb-2 block">Allowed Email Categories</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {CATEGORY_OPTIONS.map(cat => (
                        <div
                          key={cat.value}
                          onClick={() => handleCategoryToggle(cat.value)}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors
                            ${srSettings.allowed_categories?.includes(cat.value)
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40"}`}
                          data-testid={`category-${cat.value}`}
                        >
                          <Checkbox
                            checked={srSettings.allowed_categories?.includes(cat.value)}
                            onCheckedChange={() => handleCategoryToggle(cat.value)}
                            onClick={e => e.stopPropagation()}
                          />
                          <div>
                            <p className="text-xs font-medium">{cat.label}</p>
                            <p className="text-xs text-muted-foreground hidden sm:block">{cat.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Only emails matching these categories will enter the Smart Reply queue
                    </p>
                  </div>

                  {/* Save config button */}
                  <Button
                    size="sm"
                    onClick={handleSrSaveConfig}
                    disabled={srSaving}
                    className="bg-primary hover:bg-primary/90 text-white"
                    data-testid="save-smart-reply-btn"
                  >
                    {srSaving
                      ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      : <Save className="w-4 h-4 mr-2" />}
                    Save Smart Reply Settings
                  </Button>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── NEW: Smart Reply Activity (queue visibility) ── */}
      {autoSendAllowed && (
        <Card data-testid="smart-reply-activity-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="w-4 h-4" /> Smart Reply Activity
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              View queued, sent, and cancelled emails from Smart Reply Mode
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tab row */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted">
              {[
                { key: "queued",    label: "Queued",    icon: Timer },
                { key: "sent",      label: "Sent",      icon: Send  },
                { key: "cancelled", label: "Cancelled", icon: Ban   },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => handleQueueTabChange(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-colors
                    ${queueTab === key
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"}`}
                  data-testid={`queue-tab-${key}`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Queue list */}
            {queueLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : queueItems.length === 0 ? (
              <div className="text-center py-8">
                <Timer className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {queueTab === "queued"
                    ? "No emails queued right now"
                    : queueTab === "sent"
                    ? "No emails sent via Smart Reply yet"
                    : "No cancelled emails"}
                </p>
                {queueTab === "queued" && !srSettings.enabled && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Enable Smart Reply Mode above to start queuing emails
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {queueItems.map(item => (
                  <QueueItemRow
                    key={item.id}
                    item={item}
                    onCancel={handleCancelQueueItem}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Connect Gmail Dialog (UNCHANGED) ── */}
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

      {/* ── NEW: Smart Reply First-Time Confirmation Modal ── */}
      <SmartReplyConfirmationModal
        open={srConfirmModal}
        onConfirm={handleSmartReplyConfirm}
        onCancel={() => setSrConfirmModal(false)}
      />
    </div>
  );
}
