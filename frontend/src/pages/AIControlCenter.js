/**
 * AIControlCenter.js — Full merged page
 * =======================================
 * Contains ALL functionality from Settings.js PLUS the original AI Control Center:
 *
 *  ① Profile & Plan
 *  ② Connected Email Accounts (connect / disconnect Gmail)
 *  ③ Inbox Intelligence Stats
 *  ④ Follow-Up Control (scope selector + tag inputs)
 *  ⑤ Detection Settings
 *  ⑥ Category Tracking
 *  ⑦ Blocked Senders
 *  ⑧ Silence Detection Rules
 *  ⑨ Notifications (AI alerts + daily digest / weekly report)
 *  ⑩ Smart Reply Mode (confirmation modal, settings, activity queue)
 *  ⑪ AI Activity Log
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { inboxAPI, settingsAPI, emailAPI, billingAPI, aiSettingsAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isAnalyticsAllowed, isAutoSendAllowed } from "@/lib/plan-utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Cpu, Mail, Eye, Bell, Clock, Target, Users, DollarSign,
  Headphones, Handshake, TrendingUp, AlertTriangle, CheckCircle2,
  Sparkles, Activity, Loader2, User, Save, ArrowUpRight, CreditCard,
  Shield, Plus, Trash2, Lock, Filter, X, Zap, Timer, Ban, Send,
  AlertCircle, Info,
} from "lucide-react";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */

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
   SMART REPLY API (fetch-based, same as Settings.js)
═══════════════════════════════════════════════════════════════ */

const _srAuthHeaders = () => {
  const TOKEN_KEYS = ["replyzen_token", "token", "access_token", "auth_token", "authToken", "jwt"];
  const token = TOKEN_KEYS.reduce((found, key) => found || localStorage.getItem(key) || "", "");
  return { Authorization: `Bearer ${token}` };
};

const smartReplyAPI = {
  getSettings: () =>
    fetch("/api/smart-reply/settings", { headers: _srAuthHeaders() }).then(async (r) => {
      let json; try { json = await r.json(); } catch { json = { detail: `HTTP ${r.status}` }; }
      if (!r.ok) return Promise.reject(json);
      return json;
    }),

  saveSettings: async (data) => {
    const r = await fetch("/api/smart-reply/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ..._srAuthHeaders() },
      body: JSON.stringify(data),
    });
    let json; try { json = await r.json(); } catch { json = { detail: `HTTP ${r.status}` }; }
    if (!r.ok) return Promise.reject(json);
    return json;
  },

  getQueue: (status) => {
    const qs = status ? `?status=${status}` : "";
    return fetch(`/api/smart-reply/queue${qs}`, { headers: _srAuthHeaders() }).then(async (r) => {
      let json; try { json = await r.json(); } catch { json = { detail: `HTTP ${r.status}` }; }
      if (!r.ok) return Promise.reject(json);
      return json;
    });
  },

  cancelEmail: (queueId) =>
    fetch(`/api/smart-reply/queue/${queueId}/cancel`, { method: "POST", headers: _srAuthHeaders() })
      .then((r) => { if (!r.ok) return r.json().then((e) => Promise.reject(e)); return r.json(); }),
};

/* ═══════════════════════════════════════════════════════════════
   SHARED SUB-COMPONENTS
═══════════════════════════════════════════════════════════════ */

// ── Tag / Chip Input ──────────────────────────────────────────
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
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
            {tag}
            <button onClick={() => onRemove(tag)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : "Add more…"}
          className="flex-1 min-w-[120px] text-xs bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>
      <p className="text-xs text-muted-foreground">Press Enter or comma to add</p>
    </div>
  );
}

// ── Countdown Timer ───────────────────────────────────────────
function CountdownTimer({ scheduledAt }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    const target = new Date(scheduledAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [scheduledAt]);
  if (secondsLeft <= 0) return <span className="text-xs text-emerald-600 font-medium">Sending now…</span>;
  const mins = Math.floor(secondsLeft / 60), secs = secondsLeft % 60;
  return (
    <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
      <Timer className="w-3 h-3" />Sends in {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </span>
  );
}

// ── Queue Item Row ─────────────────────────────────────────────
function QueueItemRow({ item, onCancel }) {
  const [cancelling, setCancelling] = useState(false);
  const handleCancel = async () => { setCancelling(true); try { await onCancel(item.id); } finally { setCancelling(false); } };
  const statusBadge = {
    queued:    <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs">Queued</Badge>,
    sent:      <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-xs">Sent</Badge>,
    cancelled: <Badge variant="outline" className="text-muted-foreground border-muted text-xs">Cancelled</Badge>,
  }[item.status] || null;
  return (
    <div className="p-3 rounded-lg border border-border bg-background space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium truncate flex-1">{item.subject || "(No Subject)"}</p>
        {statusBadge}
      </div>
      <p className="text-xs text-muted-foreground truncate">To: {item.to_email}</p>
      <div className="flex items-center justify-between">
        {item.status === "queued" ? <CountdownTimer scheduledAt={item.scheduled_at} />
          : item.status === "sent"
            ? <span className="text-xs text-muted-foreground flex items-center gap-1"><Send className="w-3 h-3" />Sent {item.sent_at ? new Date(item.sent_at).toLocaleTimeString() : ""}</span>
            : <span className="text-xs text-muted-foreground flex items-center gap-1"><Ban className="w-3 h-3" />Cancelled</span>}
        {item.status === "queued" && (
          <Button size="sm" variant="ghost" onClick={handleCancel} disabled={cancelling}
            className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
            {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <><X className="w-3 h-3 mr-1" />Cancel</>}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Smart Reply Confirmation Modal ─────────────────────────────
const CATEGORY_OPTIONS = [
  { value: "faq",       label: "FAQ",       description: "Frequently asked questions" },
  { value: "inquiry",   label: "Inquiry",   description: "General inquiries" },
  { value: "follow_up", label: "Follow-up", description: "Follow-up conversations" },
  { value: "support",   label: "Support",   description: "Support requests" },
  { value: "sales",     label: "Sales",     description: "Sales-related emails" },
];

function SmartReplyConfirmationModal({ open, onConfirm, onCancel, saving }) {
  const [checked, setChecked] = useState(false);
  useEffect(() => { if (open) setChecked(false); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> Enable Smart Reply Mode
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">How Smart Reply Mode works:</p>
            <ul className="space-y-2">
              {[
                "Emails are sent based on your rules — never without your configuration.",
                "Each email waits in a queue for your chosen delay before sending.",
                "You can cancel any queued email before it sends.",
                "You can disable Smart Reply Mode at any time.",
                "Daily send limits are enforced automatically.",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />{item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Smart Reply Mode is user-controlled automation. You remain in control at all times.</p>
          </div>
          <div className="flex items-start gap-2.5">
            <Checkbox checked={checked} onCheckedChange={(val) => setChecked(Boolean(val))} id="sr-confirm-check" className="mt-0.5 cursor-pointer" />
            <Label htmlFor="sr-confirm-check" className="text-sm cursor-pointer leading-snug select-none">
              I understand how Smart Reply Mode works and want to enable it
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!checked || saving} className="bg-primary hover:bg-primary/90 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Zap className="w-4 h-4 mr-1.5" />}
            Enable Smart Reply Mode
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION CARDS
═══════════════════════════════════════════════════════════════ */

// ① Profile & Plan ─────────────────────────────────────────────
function ProfilePlanCard({ user, planLimits, accounts, loading, onNavigate }) {
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [saving, setSaving] = useState(false);
  const { refreshUser } = useAuth();

  useEffect(() => { setFullName(user?.full_name || ""); }, [user?.full_name]);

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

  if (loading) return (
    <Card><CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
      <CardContent><div className="space-y-3">{[1,2,3].map(i=><Skeleton key={i} className="h-10"/>)}</div></CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4 text-primary" />Profile & Plan</CardTitle>
        <CardDescription className="text-xs">Your account details and subscription information</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-8 text-sm" placeholder="Your full name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Email Address</Label>
            <Input value={user?.email || ""} disabled className="h-8 text-sm bg-muted" />
          </div>
        </div>
        <Button size="sm" onClick={handleSaveProfile} disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Save Profile
        </Button>
        <Separator />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Shield className="w-3.5 h-3.5" />Current Plan</div>
            <Badge variant="outline" className={`capitalize text-xs font-semibold ${planColors[userPlan] || planColors.free}`}>{userPlan}</Badge>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3.5 h-3.5" />Email Accounts</div>
            <p className="text-sm font-semibold">{accounts.length}{planLimits && <span className="text-xs font-normal text-muted-foreground ml-1">/ {planLimits.max_email_accounts}</span>}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CreditCard className="w-3.5 h-3.5" />Daily Send Limit</div>
            <p className="text-sm font-semibold">{planLimits?.max_daily_sends ?? "—"}<span className="text-xs font-normal text-muted-foreground ml-1">emails/day</span></p>
          </div>
        </div>
        {userPlan === "free" && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground">Upgrade to unlock Smart Reply, higher limits &amp; more.</p>
            <Button size="sm" variant="link" className="text-primary h-auto p-0 shrink-0 ml-3" onClick={() => onNavigate("/billing")}>
              Upgrade <ArrowUpRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ② Connected Email Accounts ───────────────────────────────────
function EmailAccountsCard({ accounts, planLimits, loading, onConnect, onDisconnect, disconnectingId, connecting }) {
  const navigate = useNavigate();
  const accountLimitReached = planLimits && accounts.length >= planLimits.max_email_accounts;

  if (loading) return (
    <Card><CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
      <CardContent><div className="space-y-3">{[1,2].map(i=><Skeleton key={i} className="h-14"/>)}</div></CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-primary" />Connected Email Accounts</CardTitle>
          {planLimits && <p className="text-xs text-muted-foreground mt-1">{accounts.length} / {planLimits.max_email_accounts} accounts used</p>}
        </div>
        <Button size="sm" variant="outline" onClick={onConnect} disabled={accountLimitReached || connecting}>
          {connecting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : accountLimitReached ? <><Lock className="w-4 h-4 mr-1.5" />Limit Reached</> : <><Plus className="w-4 h-4 mr-1.5" />Connect Gmail</>}
        </Button>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {accountLimitReached && (
          <div className="p-3 rounded-lg bg-accent/50 border border-primary/20 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">You've reached your limit ({planLimits?.max_email_accounts}). Upgrade to connect more.</p>
            <Button size="sm" variant="link" className="text-primary h-auto p-0 ml-3" onClick={() => navigate("/billing")}>
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
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{a.email_address}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.is_active
                        ? <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Connected</span>
                        : "Inactive"}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onDisconnect(a.id)} disabled={disconnectingId === a.id} className="text-destructive">
                  {disconnectingId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-xs text-blue-700"><strong>Privacy:</strong> We only read your emails — never send or modify. All sending is done through Gmail's compose interface.</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ③ Inbox Intelligence Stats ───────────────────────────────────
function InboxIntelligenceStats({ stats, loading }) {
  const items = [
    { label: "Emails Scanned",         value: stats?.total_messages || 0, icon: Mail, color: "text-blue-600" },
    { label: "Opportunities Detected", value: (stats?.category_breakdown?.Lead || 0) + (stats?.category_breakdown?.Client || 0), icon: Target, color: "text-emerald-600" },
    { label: "Follow-ups Detected",    value: stats?.needs_followup || 0, icon: Clock, color: "text-amber-600" },
    { label: "High Priority",          value: stats?.hot_priority || 0, icon: AlertTriangle, color: "text-red-600" },
  ];
  if (loading) return (
    <Card><CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
      <CardContent><div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i=><Skeleton key={i} className="h-20"/>)}</div></CardContent>
    </Card>
  );
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-primary" />Inbox Intelligence</CardTitle>
        <CardDescription className="text-xs">AI analysis summary of your connected inbox</CardDescription>
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

// ④ Follow-Up Control ─────────────────────────────────────────
function FollowUpControlCard({ scope, setScope, allowedContacts, setAllowedContacts, allowedDomains, setAllowedDomains, onSave, saving }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-primary" />Follow-Up Control</CardTitle>
        <CardDescription className="text-xs">Choose which email conversations get processed for follow-ups</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        <RadioGroup value={scope} onValueChange={setScope} className="space-y-3">
          {[
            { value: "sent_only",       label: "Only emails I sent",     rec: true,  desc: "Follow up only on conversations where you sent the last message" },
            { value: "manual_contacts", label: "Only selected contacts", rec: false, desc: "Follow up only with specific email addresses" },
            { value: "domain_based",    label: "Only specific domains",  rec: false, desc: "Follow up only with emails from certain domains (e.g. @client.com)" },
            { value: "all",             label: "All emails",             rec: false, desc: "Process all non-automated conversations" },
          ].map((opt) => (
            <div
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${scope === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              onClick={() => setScope(opt.value)}
            >
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
                      onAdd={(val) => setAllowedContacts((p) => [...p, val])}
                      onRemove={(val) => setAllowedContacts((p) => p.filter((c) => c !== val))}
                      placeholder="Add email address…" />
                  </div>
                )}
                {scope === "domain_based" && opt.value === "domain_based" && (
                  <div className="mt-3">
                    <TagInput tags={allowedDomains}
                      onAdd={(val) => setAllowedDomains((p) => [...p, val.startsWith("@") ? val : `@${val}`])}
                      onRemove={(val) => setAllowedDomains((p) => p.filter((d) => d !== val))}
                      placeholder="Add domain e.g. @client.com…" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </RadioGroup>
        <Button size="sm" onClick={onSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Save Follow-Up Control
        </Button>
      </CardContent>
    </Card>
  );
}

// ⑤ Detection Settings ────────────────────────────────────────
function DetectionSettings({ settings, onUpdate }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-primary" />Detection Settings</CardTitle>
        <CardDescription className="text-xs">Configure how AI detects opportunities and follow-ups</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-6">
        <div className="space-y-2">
          <Label className="text-xs font-medium">Detection Sensitivity</Label>
          <Select value={settings?.sensitivity || "medium"} onValueChange={(v) => onUpdate({ sensitivity: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low - Only high-confidence detections</SelectItem>
              <SelectItem value="medium">Medium - Balanced detection</SelectItem>
              <SelectItem value="high">High - Catch more potential opportunities</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Higher sensitivity may result in more false positives</p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Follow-up Detection Timing</Label>
          <Select value={settings?.followupTiming || "48h"} onValueChange={(v) => onUpdate({ followupTiming: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24 hours - Flag quickly</SelectItem>
              <SelectItem value="48h">48 hours - Standard timing</SelectItem>
              <SelectItem value="72h">72 hours - Allow more time</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Time without response before suggesting follow-up</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ⑥ Category Tracking ─────────────────────────────────────────
function CategoryTracking({ settings, onUpdate }) {
  const categories = [
    { key: "client",      label: "Client",      icon: Users,      description: "Existing customer communications" },
    { key: "lead",        label: "Lead",        icon: TrendingUp, description: "Potential new business" },
    { key: "payment",     label: "Payment",     icon: DollarSign, description: "Invoices and billing" },
    { key: "support",     label: "Support",     icon: Headphones, description: "Help requests" },
    { key: "partnership", label: "Partnership", icon: Handshake,  description: "Collaboration proposals" },
  ];
  const tracked = settings?.trackedCategories || categories.map((c) => c.key);
  const toggleCategory = (key) => {
    const updated = tracked.includes(key) ? tracked.filter((c) => c !== key) : [...tracked, key];
    onUpdate({ trackedCategories: updated });
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Category Tracking</CardTitle>
        <CardDescription className="text-xs">Choose which email categories to analyze and track</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {categories.map((cat) => (
          <div key={cat.key} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-muted"><cat.icon className="w-4 h-4 text-muted-foreground" /></div>
              <div>
                <p className="text-sm font-medium">{cat.label}</p>
                <p className="text-xs text-muted-foreground">{cat.description}</p>
              </div>
            </div>
            <Switch checked={tracked.includes(cat.key)} onCheckedChange={() => toggleCategory(cat.key)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ⑦ Blocked Senders ───────────────────────────────────────────
function BlockedSendersCard({ blockedSenders, onUnblock }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Filter className="w-4 h-4 text-primary" />Blocked Senders</CardTitle>
        <CardDescription className="text-xs">Emails from these senders will never appear in your queue</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {blockedSenders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No blocked senders. Use "Ignore Sender" on any thread card to block them.
          </p>
        ) : (
          <div className="space-y-2">
            {blockedSenders.map((sender) => (
              <div key={sender} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/30">
                <span className="text-sm">{sender}</span>
                <Button variant="ghost" size="sm" onClick={() => onUnblock(sender)} className="text-muted-foreground hover:text-destructive h-7">
                  <X className="w-3.5 h-3.5 mr-1" />Unblock
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ⑧ Silence Detection Rules ───────────────────────────────────
function SilenceRulesCard({ settings, onSave }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Silence Detection Rules</CardTitle>
        <CardDescription className="text-xs">Configure when threads are flagged as needing follow-up</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm">Silence Threshold</Label>
            <span className="text-sm font-medium text-primary">{settings?.silence_delay_days || 3} days</span>
          </div>
          <Slider value={[settings?.silence_delay_days || 3]} onValueChange={([val]) => onSave("silence_delay_days", val)} min={1} max={10} step={1} className="max-w-sm" />
          <p className="text-xs text-muted-foreground mt-1">Threads with no reply after this many days are flagged as silent</p>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Ignore Newsletters</p>
            <p className="text-xs text-muted-foreground">Skip automated newsletter emails</p>
          </div>
          <Switch checked={settings?.ignore_newsletters ?? true} onCheckedChange={(v) => onSave("ignore_newsletters", v)} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Ignore Notifications</p>
            <p className="text-xs text-muted-foreground">Skip automated system notifications</p>
          </div>
          <Switch checked={settings?.ignore_notifications ?? true} onCheckedChange={(v) => onSave("ignore_notifications", v)} />
        </div>
      </CardContent>
    </Card>
  );
}

// ⑨ Notifications (merged: AI alerts + digest / report) ───────
function NotificationsCard({ settings, aiSettings, onSaveSettings, onUpdateAI }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Bell className="w-4 h-4 text-primary" />Notifications</CardTitle>
        <CardDescription className="text-xs">Configure alerts for AI events and digest reports</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* AI-driven alerts */}
        {[
          { key: "potentialClient", label: "Potential Client Alerts",  desc: "When a new lead or client email is detected" },
          { key: "followupAlert",   label: "Follow-up Alerts",         desc: "When an email needs follow-up" },
          { key: "urgentEmail",     label: "Urgent Email Alerts",      desc: "When a high-priority email arrives" },
        ].map((n) => (
          <div key={n.key} className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium">{n.label}</p>
              <p className="text-xs text-muted-foreground">{n.desc}</p>
            </div>
            <Switch
              checked={aiSettings?.notifications?.[n.key] ?? true}
              onCheckedChange={() =>
                onUpdateAI({ notifications: { ...(aiSettings?.notifications || {}), [n.key]: !(aiSettings?.notifications?.[n.key] ?? true) } })
              }
            />
          </div>
        ))}

        <Separator />

        {/* Digest / report toggles from Settings.js */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border">
          <div>
            <p className="text-sm font-medium">Daily Digest</p>
            <p className="text-xs text-muted-foreground">Receive a daily summary of silent threads</p>
          </div>
          <Switch checked={settings?.daily_digest ?? true} onCheckedChange={(v) => onSaveSettings("daily_digest", v)} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-border">
          <div>
            <p className="text-sm font-medium">Weekly Report</p>
            <p className="text-xs text-muted-foreground">Get a weekly follow-up performance report</p>
          </div>
          <Switch checked={settings?.weekly_report ?? true} onCheckedChange={(v) => onSaveSettings("weekly_report", v)} />
        </div>
      </CardContent>
    </Card>
  );
}

// ⑩ Smart Reply Mode ──────────────────────────────────────────
function SmartReplyCard({
  srSettings, setSrSettings, srMeta, srLoading, srSaving,
  srConfirmModal, setSrConfirmModal,
  queueItems, queueLoading, queueTab, setQueueTab,
  autoSendAllowed,
  onToggle, onConfirm, onSaveConfig, onFieldChange, onCategoryToggle,
  onCancelQueueItem, onQueueTabChange,
}) {
  // ✅ useNavigate called unconditionally at the top — fixes the ESLint error
  const navigate = useNavigate();

  if (!autoSendAllowed) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />Smart Reply Mode
            <Badge variant="outline" className="text-xs text-muted-foreground"><Lock className="w-3 h-3 mr-1" />Pro+</Badge>
          </CardTitle>
          <CardDescription className="text-xs">User-controlled automation — emails are sent based on your rules</CardDescription>
        </CardHeader>
        <CardContent className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-3">Smart Reply Mode is available on Pro and Business plans.</p>
          <Button size="sm" onClick={() => navigate("/billing")} className="bg-primary hover:bg-primary/90 text-white">
            Upgrade Plan <ArrowUpRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />Smart Reply Mode
            {srSettings.enabled && <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>}
          </CardTitle>
          <CardDescription className="text-xs">
            User-controlled automation — emails are sent based on your rules. You can cancel anytime before sending.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {srLoading ? (
            <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enable Smart Reply Mode</p>
                  <p className="text-xs text-muted-foreground">Emails are sent based on your rules, with a delay window you can cancel</p>
                </div>
                <Switch checked={srSettings.enabled} onCheckedChange={onToggle} disabled={srSaving} />
              </div>

              {!srSettings.enabled && (
                <div className="flex gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">No email will be sent automatically until you enable Smart Reply Mode and configure your rules below.</p>
                </div>
              )}

              {srSettings.enabled && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div>
                      <p className="text-xs font-medium text-primary">Today's Usage</p>
                      <p className="text-xs text-muted-foreground">{srMeta.daily_sent_today} sent · {srMeta.daily_remaining} remaining</p>
                    </div>
                    <Badge variant="outline" className="text-primary border-primary/30 text-xs">{srMeta.daily_sent_today} / {srSettings.daily_limit}</Badge>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm">AI Confidence Threshold <span className="ml-1 text-xs text-muted-foreground">(minimum to queue)</span></Label>
                      <span className="text-sm font-medium text-primary">{srSettings.confidence_threshold}%</span>
                    </div>
                    <Slider value={[srSettings.confidence_threshold]} onValueChange={([val]) => onFieldChange("confidence_threshold", val)} min={50} max={100} step={5} className="max-w-sm" />
                    <p className="text-xs text-muted-foreground mt-1">Only queue emails where AI confidence is at or above this level</p>
                  </div>

                  <div>
                    <Label className="text-sm">Daily Send Limit</Label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <Input type="number" min={1} max={500} value={srSettings.daily_limit}
                        onChange={(e) => onFieldChange("daily_limit", parseInt(e.target.value) || 20)}
                        className="max-w-[120px]" />
                      <p className="text-xs text-muted-foreground">emails per day</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm">Delay Before Sending <span className="ml-1 text-xs text-muted-foreground">(cancel window)</span></Label>
                      <span className="text-sm font-medium text-primary">
                        {srSettings.delay_seconds >= 60
                          ? `${Math.floor(srSettings.delay_seconds / 60)}m ${srSettings.delay_seconds % 60}s`
                          : `${srSettings.delay_seconds}s`}
                      </span>
                    </div>
                    <Slider value={[srSettings.delay_seconds]} onValueChange={([val]) => onFieldChange("delay_seconds", val)} min={30} max={3600} step={30} className="max-w-sm" />
                    <p className="text-xs text-muted-foreground mt-1">Emails wait this long in the queue — cancel anytime before they send</p>
                  </div>

                  <div>
                    <Label className="text-sm mb-2 block">Allowed Email Categories</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {CATEGORY_OPTIONS.map((cat) => (
                        <div key={cat.value} onClick={() => onCategoryToggle(cat.value)}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${srSettings.allowed_categories?.includes(cat.value) ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                          <Checkbox checked={srSettings.allowed_categories?.includes(cat.value)} onCheckedChange={() => onCategoryToggle(cat.value)} onClick={(e) => e.stopPropagation()} />
                          <div>
                            <p className="text-xs font-medium">{cat.label}</p>
                            <p className="text-xs text-muted-foreground hidden sm:block">{cat.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Only emails matching these categories will enter the Smart Reply queue</p>
                  </div>

                  <Button size="sm" onClick={onSaveConfig} disabled={srSaving} className="bg-primary hover:bg-primary/90 text-white">
                    {srSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Save Smart Reply Settings
                  </Button>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Smart Reply Activity Queue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Timer className="w-4 h-4 text-primary" />Smart Reply Activity</CardTitle>
          <CardDescription className="text-xs">View queued, sent, and cancelled emails from Smart Reply Mode</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-1 p-1 rounded-lg bg-muted">
            {[{ key: "queued", label: "Queued", icon: Timer }, { key: "sent", label: "Sent", icon: Send }, { key: "cancelled", label: "Cancelled", icon: Ban }]
              .map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => onQueueTabChange(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${queueTab === key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="w-3 h-3" />{label}
                </button>
              ))}
          </div>
          {queueLoading ? (
            <div className="space-y-2">{[1,2].map(i=><Skeleton key={i} className="h-20 w-full"/>)}</div>
          ) : queueItems.length === 0 ? (
            <div className="text-center py-8">
              <Timer className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {queueTab === "queued" ? "No emails queued right now" : queueTab === "sent" ? "No emails sent via Smart Reply yet" : "No cancelled emails"}
              </p>
              {queueTab === "queued" && !srSettings.enabled && (
                <p className="text-xs text-muted-foreground mt-1">Enable Smart Reply Mode above to start queuing emails</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {queueItems.map((item) => <QueueItemRow key={item.id} item={item} onCancel={onCancelQueueItem} />)}
            </div>
          )}
        </CardContent>
      </Card>

      <SmartReplyConfirmationModal open={srConfirmModal} onConfirm={onConfirm} onCancel={() => { setSrConfirmModal(false); }} saving={srSaving} />
    </>
  );
}

// ⑪ AI Activity Log ───────────────────────────────────────────
function AIActivityLog({ activities, loading }) {
  const defaultActivities = [
    { action: "Emails analyzed",        count: 0, icon: Eye,      time: "Today" },
    { action: "Opportunities detected", count: 0, icon: Target,   time: "Today" },
    { action: "Follow-ups triggered",   count: 0, icon: Clock,    time: "Today" },
    { action: "Replies generated",      count: 0, icon: Sparkles, time: "Today" },
  ];
  const displayActivities = activities?.length > 0 ? activities : defaultActivities;

  if (loading) return (
    <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
      <CardContent><div className="space-y-2">{[1,2,3,4].map(i=><Skeleton key={i} className="h-12"/>)}</div></CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-primary" />AI Activity Log</CardTitle>
        <CardDescription className="text-xs">Recent AI processing activity</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {displayActivities.map((activity, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              {activity.icon && <activity.icon className="w-4 h-4 text-muted-foreground" />}
              <span className="text-sm">{activity.action}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{activity.count}</Badge>
              <span className="text-xs text-muted-foreground">{activity.time}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN — AI CONTROL CENTER
═══════════════════════════════════════════════════════════════ */

export default function AIControlCenter() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const userPlan        = user?.plan || "free";
  const autoSendAllowed = isAutoSendAllowed(userPlan);

  // ── Loading / connecting state ────────────────────────────────
  const [loading, setLoading]           = useState(true);
  const [connecting, setConnecting]     = useState(false);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [connectDialog, setConnectDialog] = useState(false);
  const [connectEmail, setConnectEmail]   = useState("");

  // ── Core data ─────────────────────────────────────────────────
  const [accounts, setAccounts]     = useState([]);
  const [planLimits, setPlanLimits] = useState(null);
  const [stats, setStats]           = useState(null);

  // ── Settings.js state ─────────────────────────────────────────
  const [coreSettings, setCoreSettings]       = useState(null);
  const [scope, setScope]                     = useState("sent_only");
  const [allowedContacts, setAllowedContacts] = useState([]);
  const [allowedDomains, setAllowedDomains]   = useState([]);
  const [blockedSenders, setBlockedSenders]   = useState([]);
  const [savingScope, setSavingScope]         = useState(false);

  // ── AI Control Center state ───────────────────────────────────
  const [aiSettings, setAiSettings] = useState({
    sensitivity:         "medium",
    followupTiming:      "48h",
    trackedCategories:   ["client", "lead", "payment", "support", "partnership"],
    notifications:       { potentialClient: true, followupAlert: true, urgentEmail: true },
  });

  // ── Smart Reply state ─────────────────────────────────────────
  const [srSettings, setSrSettings] = useState({
    enabled: false, confidence_threshold: 80, daily_limit: 20,
    delay_seconds: 120, allowed_categories: ["faq", "inquiry"], confirmed_first_use: false,
  });
  const [srMeta, setSrMeta]                 = useState({ daily_sent_today: 0, daily_remaining: 20 });
  const [srLoading, setSrLoading]           = useState(true);
  const [srSaving, setSrSaving]             = useState(false);
  const [srConfirmModal, setSrConfirmModal] = useState(false);
  const [queueItems, setQueueItems]         = useState([]);
  const [queueLoading, setQueueLoading]     = useState(false);
  const [queueTab, setQueueTab]             = useState("queued");
  const queuePollRef = useRef(null);

  /* ── Bootstrap ─────────────────────────────────────────────── */
  useEffect(() => {
    loadData();
    if (searchParams.get("gmail") === "connected") {
      toast.success("Gmail account connected successfully! 🎉");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (srSettings.enabled && queueTab === "queued") {
      queuePollRef.current = setInterval(() => loadQueue("queued"), 10_000);
    }
    return () => clearInterval(queuePollRef.current);
  }, [srSettings.enabled, queueTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, accountsRes, limitsRes, coreSettingsRes, aiSettingsRes, activityRes] =
        await Promise.allSettled([
          inboxAPI.getStats(),
          emailAPI.getAccounts(),
          billingAPI.getPlanLimits(),
          settingsAPI.get(),
          aiSettingsAPI.get(),
          aiSettingsAPI.getActivity(20),
        ]);

      if (statsRes.status === "fulfilled")    setStats(statsRes.value.data.data);
      if (accountsRes.status === "fulfilled") setAccounts(accountsRes.value.data || []);
      if (limitsRes.status === "fulfilled")   setPlanLimits(limitsRes.value.data);

      if (coreSettingsRes.status === "fulfilled") {
        const s = coreSettingsRes.value.data;
        setCoreSettings(s);
        setScope(s.follow_up_scope || "sent_only");
        setAllowedContacts(s.allowed_contacts || []);
        setAllowedDomains(s.allowed_domains || []);
        setBlockedSenders(s.blocked_senders || []);
      }

      if (aiSettingsRes.status === "fulfilled" && aiSettingsRes.value.data.data)
        setAiSettings(aiSettingsRes.value.data.data);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }

    loadSmartReplySettings();
    loadQueue("queued");
  };

  const loadSmartReplySettings = async () => {
    setSrLoading(true);
    try {
      const res = await smartReplyAPI.getSettings();
      if (res.data) { setSrSettings(res.data); setSrMeta(res.meta || { daily_sent_today: 0, daily_remaining: 20 }); }
    } catch (e) { console.warn("Smart Reply settings not loaded:", e); }
    finally { setSrLoading(false); }
  };

  const loadQueue = useCallback(async (status) => {
    setQueueLoading(true);
    try {
      const res = await smartReplyAPI.getQueue(status);
      if (res.data) setQueueItems(res.data);
    } catch (e) { console.warn("Queue load failed:", e); }
    finally { setQueueLoading(false); }
  }, []);

  /* ── Handlers ─────────────────────────────────────────────── */

  // Core settings
  const handleSaveCoreSettings = async (field, value) => {
    try {
      await settingsAPI.update({ [field]: value });
      setCoreSettings((p) => ({ ...p, [field]: value }));
      toast.success("Settings saved ✅");
    } catch (err) { toast.error(extractErrorDetail(err, "Failed to save settings")); }
  };

  const handleSaveSilenceRules = async (field, value) => {
    try {
      await settingsAPI.updateSilenceRules({ [field]: value });
      setCoreSettings((p) => ({ ...p, [field]: value }));
      toast.success("Silence rules updated ✅");
    } catch (err) { toast.error(extractErrorDetail(err, "Failed to save silence rules")); }
  };

  const handleSaveScope = async () => {
    setSavingScope(true);
    try {
      await settingsAPI.updateFollowUpScope({ follow_up_scope: scope, allowed_contacts: allowedContacts, allowed_domains: allowedDomains });
      toast.success("Follow-up scope saved ✅");
    } catch (err) { toast.error(extractErrorDetail(err, "Failed to save follow-up scope")); }
    finally { setSavingScope(false); }
  };

  const handleUnblockSender = async (email) => {
    try {
      await settingsAPI.unblockSender(email);
      setBlockedSenders((p) => p.filter((s) => s !== email));
      toast.success(`${email} unblocked`);
    } catch (err) { toast.error(extractErrorDetail(err, "Failed to unblock sender")); }
  };

  // Gmail connect
  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      const response = await emailAPI.getGmailAuthUrl();
      if (response.data?.auth_url) { toast.info("Redirecting to Google…"); window.location.href = response.data.auth_url; return; }
      if (connectEmail) {
        await emailAPI.connectGmail(connectEmail);
        toast.success("Gmail connected 🎉");
        setConnectDialog(false); setConnectEmail("");
        loadData();
      }
    } catch (err) { toast.error(extractErrorDetail(err, "Failed to connect Gmail")); }
    finally { setConnecting(false); }
  };

  // Gmail disconnect
  const handleDisconnect = async (accountId) => {
    setDisconnectingId(accountId);
    try {
      await settingsAPI.disconnectEmail(accountId);
      toast.success("Account disconnected ✅");
      loadData();
    } catch (err) { toast.error(extractErrorDetail(err, "Failed to disconnect account")); }
    finally { setDisconnectingId(null); }
  };

  // AI settings
  const handleUpdateAISettings = async (updates) => {
    const backendUpdates = {};
    if (updates.sensitivity)       backendUpdates.sensitivity        = updates.sensitivity;
    if (updates.followupTiming)    backendUpdates.followup_timing    = updates.followupTiming;
    if (updates.trackedCategories) backendUpdates.tracked_categories = updates.trackedCategories;
    if (updates.notifications) {
      if (updates.notifications.potentialClient !== undefined) backendUpdates.notify_potential_client = updates.notifications.potentialClient;
      if (updates.notifications.followupAlert   !== undefined) backendUpdates.notify_followup         = updates.notifications.followupAlert;
      if (updates.notifications.urgentEmail     !== undefined) backendUpdates.notify_urgent           = updates.notifications.urgentEmail;
    }
    setAiSettings((p) => ({ ...p, ...updates }));
    try {
      await aiSettingsAPI.update(backendUpdates);
      toast.success("Settings updated");
    } catch (err) { toast.error(extractErrorDetail(err, "Failed to save settings")); }
  };

  // Smart Reply
  const handleSmartReplyToggle = (newValue) => {
    if (newValue && !srSettings.confirmed_first_use) { setSrConfirmModal(true); return; }
    saveSmartReplySettings({ ...srSettings, enabled: newValue });
  };

  const handleSmartReplyConfirm = async () => {
    const success = await saveSmartReplySettings({ ...srSettings, enabled: true, confirmed_first_use: true });
    if (success) setSrConfirmModal(false);
  };

  const saveSmartReplySettings = async (newSettings) => {
    const prev = srSettings;
    setSrSaving(true);
    setSrSettings(newSettings);
    try {
      const res = await smartReplyAPI.saveSettings(newSettings);
      if (res.data) { setSrSettings(res.data); setSrMeta(res.meta || srMeta); }
      toast.success("Smart Reply Mode updated ✅");
      return true;
    } catch (err) {
      setSrSettings(prev);
      toast.error(extractErrorDetail(err, "Failed to save Smart Reply settings"));
      return false;
    } finally { setSrSaving(false); }
  };

  const handleCancelQueueItem = async (queueId) => {
    try {
      await smartReplyAPI.cancelEmail(queueId);
      toast.success("Email cancelled — it will not be sent.");
      await loadQueue(queueTab);
    } catch (err) { toast.error(extractErrorDetail(err, "Failed to cancel email")); }
  };

  const handleQueueTabChange = (tab) => { setQueueTab(tab); loadQueue(tab); };

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Cpu className="w-6 h-6 text-primary" />AI Control Center
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure AI intelligence, email accounts, follow-up rules, and automation settings
        </p>
      </div>

      <div className="p-6 space-y-6 max-w-4xl">

        {/* ① Profile & Plan */}
        <ProfilePlanCard user={user} planLimits={planLimits} accounts={accounts} loading={loading} onNavigate={navigate} />

        {/* ② Connected Email Accounts */}
        <EmailAccountsCard
          accounts={accounts} planLimits={planLimits} loading={loading}
          onConnect={() => setConnectDialog(true)}
          onDisconnect={handleDisconnect}
          disconnectingId={disconnectingId}
          connecting={connecting}
        />

        {/* ③ Inbox Intelligence */}
        <InboxIntelligenceStats stats={stats} loading={loading} />

        {/* ④ Follow-Up Control */}
        <FollowUpControlCard
          scope={scope} setScope={setScope}
          allowedContacts={allowedContacts} setAllowedContacts={setAllowedContacts}
          allowedDomains={allowedDomains} setAllowedDomains={setAllowedDomains}
          onSave={handleSaveScope} saving={savingScope}
        />

        {/* ⑤ + ⑥ Detection Settings & Category Tracking */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DetectionSettings settings={aiSettings} onUpdate={handleUpdateAISettings} />
          <CategoryTracking settings={aiSettings} onUpdate={handleUpdateAISettings} />
        </div>

        {/* ⑦ Blocked Senders */}
        <BlockedSendersCard blockedSenders={blockedSenders} onUnblock={handleUnblockSender} />

        {/* ⑧ Silence Detection Rules */}
        <SilenceRulesCard settings={coreSettings} onSave={handleSaveSilenceRules} />

        {/* ⑨ Notifications */}
        <NotificationsCard
          settings={coreSettings}
          aiSettings={aiSettings}
          onSaveSettings={handleSaveCoreSettings}
          onUpdateAI={handleUpdateAISettings}
        />

        {/* ⑩ Smart Reply Mode + Activity Queue */}
        <SmartReplyCard
          srSettings={srSettings} setSrSettings={setSrSettings}
          srMeta={srMeta} srLoading={srLoading} srSaving={srSaving}
          srConfirmModal={srConfirmModal} setSrConfirmModal={setSrConfirmModal}
          queueItems={queueItems} queueLoading={queueLoading}
          queueTab={queueTab} setQueueTab={setQueueTab}
          autoSendAllowed={autoSendAllowed}
          onToggle={handleSmartReplyToggle}
          onConfirm={handleSmartReplyConfirm}
          onSaveConfig={() => saveSmartReplySettings(srSettings)}
          onFieldChange={(field, value) => setSrSettings((p) => ({ ...p, [field]: value }))}
          onCategoryToggle={(cat) => setSrSettings((p) => {
            const cur = p.allowed_categories || [];
            return { ...p, allowed_categories: cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat] };
          })}
          onCancelQueueItem={handleCancelQueueItem}
          onQueueTabChange={handleQueueTabChange}
        />

        {/* ⑪ AI Activity Log */}
        <AIActivityLog activities={stats?.recentActivities} loading={loading} />

      </div>

      {/* Connect Gmail Dialog */}
      <Dialog open={connectDialog} onOpenChange={setConnectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect Gmail Account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Connect your Gmail account to sync emails and detect silent conversations.</p>
            <Button onClick={handleConnectGmail} disabled={connecting} className="w-full bg-primary hover:bg-primary/90 text-white">
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}Sign in with Google
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">or demo mode</span></div>
            </div>
            <div>
              <Label className="text-sm">Email for Demo</Label>
              <Input type="email" placeholder="you@gmail.com" value={connectEmail} onChange={(e) => setConnectEmail(e.target.value)} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectDialog(false)}>Cancel</Button>
            <Button onClick={handleConnectGmail} disabled={connecting || !connectEmail} variant="outline">
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Connect Demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
