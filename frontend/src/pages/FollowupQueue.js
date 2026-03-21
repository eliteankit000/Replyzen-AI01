import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { emailAPI, followupAPI, settingsAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw, Send, Edit3, EyeOff, ThumbsDown, Loader2,
  Clock, CheckCircle2, Zap, Bot, AlertCircle, Activity, Ban, X,
} from "lucide-react";
import { toast } from "sonner";

// ── Badges ──────────────────────────────────────────────────

function PriorityBadge({ level }) {
  const cfg = {
    high:   { label: "🔥 High",   cls: "bg-red-50 text-red-700 border-red-200" },
    medium: { label: "⚡ Medium", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    low:    { label: "💤 Low",    cls: "bg-gray-50 text-gray-500 border-gray-200" },
  };
  const c = cfg[level] || cfg.low;
  return <Badge variant="outline" className={`${c.cls} text-xs`}>{c.label}</Badge>;
}

function TypeBadge({ type }) {
  const cfg = {
    client_proposal: { label: "Client Proposal", cls: "bg-purple-50 text-purple-700 border-purple-200" },
    payment:         { label: "Payment",          cls: "bg-green-50 text-green-700 border-green-200" },
    interview:       { label: "Interview",        cls: "bg-blue-50 text-blue-700 border-blue-200" },
    lead:            { label: "Lead",             cls: "bg-orange-50 text-orange-700 border-orange-200" },
    partnership:     { label: "Partnership",      cls: "bg-pink-50 text-pink-700 border-pink-200" },
    other:           { label: "General",          cls: "bg-gray-50 text-gray-600 border-gray-200" },
  };
  if (!type || ["notification", "newsletter"].includes(type)) return null;
  const c = cfg[type] || cfg.other;
  return <Badge variant="outline" className={`${c.cls} text-xs`}>{c.label}</Badge>;
}

// ── Thread Card ─────────────────────────────────────────────

function OpportunityCard({ thread, onGenerate, onSend, onDismiss, onNotImportant, onIgnoreSender, generating }) {
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft]       = useState(thread.ai_draft || "");
  const [saving, setSaving]     = useState(false);
  const [sending, setSending]   = useState(false);

  const hasDraft = !!thread.ai_draft;
  const sender   = thread.last_message_from || "";

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await followupAPI.update(thread.followup_id, draft);
      toast.success("Draft saved ✅");
      setEditMode(false);
    } catch {
      toast.error("Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      await onSend(thread.followup_id);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border border-border hover:border-primary/30 transition-colors">
      <CardContent className="p-4">

        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <TypeBadge type={thread.type} />
              {thread.priority_level && <PriorityBadge level={thread.priority_level} />}
              <Badge variant="outline" className="text-xs text-muted-foreground">
                <Clock className="w-3 h-3 mr-1" />{thread.days_silent}d silent
              </Badge>
              {hasDraft && (
                <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                  <Zap className="w-3 h-3 mr-1" />Draft Ready
                </Badge>
              )}
            </div>
            <p className="text-sm font-semibold truncate">{thread.subject}</p>
            <p className="text-xs text-muted-foreground mt-0.5">From: {sender || "Unknown"}</p>
          </div>
        </div>

        {/* Snippet */}
        {thread.snippet && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 bg-muted/40 rounded p-2">
            {thread.snippet}
          </p>
        )}

        {/* Draft */}
        {hasDraft && (
          <div className="mt-3">
            {editMode ? (
              <div className="space-y-2">
                <Textarea value={draft} onChange={e => setDraft(e.target.value)}
                  className="text-sm min-h-[120px]" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveDraft} disabled={saving}
                    className="bg-primary hover:bg-primary/90 text-white">
                    {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null} Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div
                className="text-xs text-muted-foreground bg-muted/30 rounded p-3 cursor-pointer border border-dashed border-border hover:border-primary/40 transition-colors"
                onClick={() => setExpanded(e => !e)}>
                <p className={expanded ? "" : "line-clamp-3"}>{thread.ai_draft}</p>
                {!expanded && (thread.ai_draft?.length || 0) > 200 && (
                  <span className="text-primary text-xs mt-1 block">Show more…</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {!hasDraft ? (
            <Button size="sm" onClick={() => onGenerate(thread.id)} disabled={generating === thread.id}
              className="bg-primary hover:bg-primary/90 text-white">
              {generating === thread.id
                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating…</>
                : <><Zap className="w-3 h-3 mr-1" />Generate Draft</>}
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={handleSend} disabled={sending}
                className="bg-primary hover:bg-primary/90 text-white">
                {sending
                  ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sending…</>
                  : <><Send className="w-3 h-3 mr-1" />Send Now</>}
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => { setEditMode(true); setExpanded(false); }}>
                <Edit3 className="w-3 h-3 mr-1" />Edit Draft
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => onDismiss(thread)}
            className="text-muted-foreground hover:text-foreground">
            <EyeOff className="w-3 h-3 mr-1" />Dismiss
          </Button>
          {/* ✅ NEW: Ignore Sender */}
          {sender && (
            <Button size="sm" variant="ghost" onClick={() => onIgnoreSender(thread)}
              className="text-muted-foreground hover:text-destructive">
              <Ban className="w-3 h-3 mr-1" />Ignore Sender
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onNotImportant(thread)}
            className="text-muted-foreground hover:text-foreground">
            <ThumbsDown className="w-3 h-3 mr-1" />Not Important
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sent Card ───────────────────────────────────────────────

function SentCard({ followup }) {
  return (
    <Card className="border border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-sm font-medium truncate">{followup.original_subject}</p>
              {followup.auto_sent && (
                <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50 shrink-0">
                  <Bot className="w-3 h-3 mr-1" />Auto-sent
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              To: {followup.recipient} · Sent {followup.sent_at
                ? new Date(followup.sent_at).toLocaleDateString() : "recently"}
            </p>
            {followup.ai_draft && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2 bg-muted/30 rounded p-2">
                {followup.ai_draft}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ───────────────────────────────────────────────

const TONES = ["professional", "friendly", "casual"];

export default function FollowupQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [threads, setThreads]             = useState([]);
  const [sentFollowups, setSentFollowups] = useState([]);
  const [dismissed, setDismissed]         = useState([]);
  const [loading, setLoading]             = useState(true);
  const [syncing, setSyncing]             = useState(false);
  const [generating, setGenerating]       = useState(null);
  const [tone, setTone]                   = useState("professional");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [confirmDialog, setConfirmDialog]   = useState(null);
  const [ignoreSenderDialog, setIgnoreSenderDialog] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [silentRes, sentRes, dismissedRes] = await Promise.allSettled([
        emailAPI.getSilentThreads({ limit: 50 }),
        followupAPI.list({ status: "sent", limit: 50 }),
        emailAPI.getThreads({ filter_type: "dismissed", limit: 50 }),
      ]);

      if (silentRes.status === "fulfilled") {
        const pendingRes = await followupAPI.list({ status: "pending", limit: 100 });
        const pendingMap = {};
        (pendingRes.data.followups || []).forEach(f => { pendingMap[f.thread_id] = f; });

        const enriched = (silentRes.value.data.threads || []).map(t => ({
          ...t,
          followup_id: pendingMap[t.id]?.id || null,
          ai_draft:    pendingMap[t.id]?.ai_draft || null,
          tone:        pendingMap[t.id]?.tone || tone,
        }));
        setThreads(enriched);
      }

      if (sentRes.status === "fulfilled")
        setSentFollowups(sentRes.value.data.followups || []);

      if (dismissedRes.status === "fulfilled")
        setDismissed(dismissedRes.value.data.threads || []);

    } catch {
      toast.error("Failed to load opportunities");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await emailAPI.syncEmails();
      const n   = res?.data?.new_threads ?? 0;
      toast.success(n > 0 ? `${n} new thread${n !== 1 ? "s" : ""} synced 📬` : "Already up to date ✅");
      loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerate = async (threadId) => {
    setGenerating(threadId);
    try {
      const res = await followupAPI.generate(threadId, tone, false);
      toast.success("AI draft generated ✅");
      setThreads(prev => prev.map(t =>
        t.id === threadId
          ? { ...t, followup_id: res.data.id, ai_draft: res.data.ai_draft, tone: res.data.tone }
          : t
      ));
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to generate draft");
    } finally {
      setGenerating(null);
    }
  };

  const handleSend = async (followupId) => {
    try {
      await followupAPI.send(followupId);
      toast.success("Follow-up sent via Gmail ✅");
      loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to send follow-up");
    }
  };

  const handleDismiss      = (thread) => setConfirmDialog({ type: "dismiss", thread });
  const handleNotImportant = (thread) => setConfirmDialog({ type: "not_important", thread });

  // ✅ NEW: Ignore Sender
  const handleIgnoreSender = (thread) => setIgnoreSenderDialog(thread);

  const confirmIgnoreSender = async () => {
    if (!ignoreSenderDialog) return;
    const sender = ignoreSenderDialog.last_message_from;
    try {
      await settingsAPI.blockSender(sender);
      toast.success(`${sender} blocked — threads hidden`);
      // Immediately remove threads from this sender from UI
      setThreads(prev => prev.filter(t =>
        (t.last_message_from || "").toLowerCase() !== sender.toLowerCase()
      ));
      setIgnoreSenderDialog(null);
    } catch {
      toast.error("Failed to block sender");
    }
  };

  const confirmAction = async () => {
    if (!confirmDialog) return;
    const { type, thread } = confirmDialog;
    try {
      await emailAPI.dismissThread(thread.id);
      toast.success(type === "dismiss" ? "Thread dismissed" : "Marked as not important");
      setConfirmDialog(null);
      loadAll();
    } catch {
      toast.error("Action failed");
    }
  };

  // Filter by priority
  const filteredThreads = threads.filter(t => {
    if (priorityFilter === "all")    return true;
    if (priorityFilter === "high")   return t.priority_level === "high";
    if (priorityFilter === "medium") return t.priority_level === "medium";
    if (priorityFilter === "low")    return t.priority_level === "low";
    return true;
  });

  const highCount   = threads.filter(t => t.priority_level === "high").length;
  const mediumCount = threads.filter(t => t.priority_level === "medium").length;
  const lowCount    = threads.filter(t => t.priority_level === "low").length;

  const renderSkeleton = () => (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}
    </div>
  );

  return (
    <div className="space-y-6" data-testid="followup-queue-page">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Opportunities</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-detected threads that need your attention
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TONES.map(t => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync"}
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <Card className="bg-muted/30 border-border">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              🔥 {highCount} High · ⚡ {mediumCount} Medium · 💤 {lowCount} Low
            </span>
            <span className="text-muted-foreground">{threads.length} total</span>
          </div>
        </CardContent>
      </Card>

      {/* Priority filter */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all",    label: "All",       count: threads.length },
          { key: "high",   label: "🔥 High",   count: highCount },
          { key: "medium", label: "⚡ Medium", count: mediumCount },
          { key: "low",    label: "💤 Low",    count: lowCount },
        ].map(tab => (
          <button key={tab.key} onClick={() => setPriorityFilter(tab.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border
              ${priorityFilter === tab.key
                ? "bg-primary text-white border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}>
            {tab.label}
            <span className={`ml-1.5 text-xs ${priorityFilter === tab.key ? "opacity-80" : "text-muted-foreground"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="silent">
        <TabsList className="mb-4">
          <TabsTrigger value="silent">
            Opportunities
            {threads.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{threads.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent">
            Sent
            {sentFollowups.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{sentFollowups.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>

        {/* Opportunities */}
        <TabsContent value="silent">
          {loading ? renderSkeleton() : filteredThreads.length === 0 ? (
            <div className="text-center py-16">
              <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-base font-medium text-muted-foreground">
                You're all caught up. No important conversations need follow-up.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Sync your Gmail or adjust your Follow-Up Control in Settings
              </p>
              <Button variant="outline" size="sm" onClick={handleSync} className="mt-4" disabled={syncing}>
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                Sync Now
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredThreads.map(thread => (
                <OpportunityCard
                  key={thread.id}
                  thread={thread}
                  onGenerate={handleGenerate}
                  onSend={handleSend}
                  onDismiss={handleDismiss}
                  onNotImportant={handleNotImportant}
                  onIgnoreSender={handleIgnoreSender}
                  generating={generating}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Sent */}
        <TabsContent value="sent">
          {loading ? renderSkeleton() : sentFollowups.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">No sent follow-ups yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sentFollowups.map(f => <SentCard key={f.id} followup={f} />)}
            </div>
          )}
        </TabsContent>

        {/* Dismissed */}
        <TabsContent value="dismissed">
          {loading ? renderSkeleton() : dismissed.length === 0 ? (
            <div className="text-center py-16">
              <EyeOff className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">No dismissed threads</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dismissed.map(t => (
                <Card key={t.id} className="border border-border opacity-60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{t.subject}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t.last_message_from} · {t.days_silent}d silent
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={async () => {
                        try {
                          await emailAPI.undismissThread(t.id);
                          toast.success("Thread restored");
                          loadAll();
                        } catch { toast.error("Failed to restore"); }
                      }}>
                        Restore
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dismiss / Not Important Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.type === "dismiss" ? "Dismiss Thread?" : "Mark as Not Important?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDialog?.type === "dismiss"
              ? "This thread will be moved to dismissed and won't appear in your opportunities."
              : "This thread will be dismissed from your queue."}
          </p>
          <p className="text-sm font-medium mt-2">{confirmDialog?.thread?.subject}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button onClick={confirmAction} className="bg-primary hover:bg-primary/90 text-white">
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ NEW: Ignore Sender Dialog */}
      <Dialog open={!!ignoreSenderDialog} onOpenChange={() => setIgnoreSenderDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ignore Sender?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              All emails from this sender will be blocked and removed from your queue permanently.
            </p>
            <div className="p-3 bg-muted/50 rounded-lg border border-border">
              <p className="text-sm font-medium">{ignoreSenderDialog?.last_message_from}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{ignoreSenderDialog?.subject}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              You can unblock them later in <strong>Settings → Blocked Senders</strong>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIgnoreSenderDialog(null)}>Cancel</Button>
            <Button onClick={confirmIgnoreSender}
              className="bg-destructive hover:bg-destructive/90 text-white">
              <Ban className="w-3.5 h-3.5 mr-1.5" /> Block Sender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
