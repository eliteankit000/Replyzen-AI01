import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { emailAPI, followupAPI, billingAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isToneAllowed } from "@/lib/plan-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Zap, Send, X, Clock, Edit3, Mail, RefreshCw,
  MessageSquare, CheckCircle2, XCircle, Loader2, Lock, ArrowUpRight
} from "lucide-react";
import { toast } from "sonner";

export default function FollowupQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [tab, setTab] = useState("silent");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState({});
  const [sending, setSending] = useState({});
  const [editDialog, setEditDialog] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [tone, setTone] = useState("professional");
  const [syncing, setSyncing] = useState(false);
  const [planLimits, setPlanLimits] = useState(null);

  const userPlan = user?.plan || "free";

  useEffect(() => {
    loadPlanLimits();
  }, []);

  useEffect(() => {
    loadData();
  }, [tab]);

  const loadPlanLimits = async () => {
    try {
      const res = await billingAPI.getPlanLimits();
      setPlanLimits(res.data);
    } catch (err) {
      console.error("Failed to load plan limits:", err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === "silent") {
        const res = await emailAPI.getSilentThreads({ limit: 50 });
        setThreads(res.data.threads || []);
      } else {
        const res = await followupAPI.list({ status: tab === "all" ? undefined : tab, limit: 50 });
        setFollowups(res.data.followups || []);
      }
    } catch (err) {
      console.error("Failed to load:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (threadId) => {
    setGenerating((prev) => ({ ...prev, [threadId]: true }));
    try {
      await followupAPI.generate(threadId, tone);
      toast.success("AI draft generated!");
      await loadPlanLimits();
      setTab("pending");
    } catch (err) {
      const detail = err.response?.data?.detail || "Failed to generate draft";
      if (err.response?.status === 403) {
        toast.error(detail);
      } else {
        toast.error(detail);
      }
    } finally {
      setGenerating((prev) => ({ ...prev, [threadId]: false }));
    }
  };

  const handleSend = async (followupId) => {
    setSending((prev) => ({ ...prev, [followupId]: true }));
    try {
      await followupAPI.send(followupId);
      toast.success("Follow-up sent!");
      loadData();
    } catch (err) {
      toast.error("Failed to send follow-up");
    } finally {
      setSending((prev) => ({ ...prev, [followupId]: false }));
    }
  };

  const handleDismiss = async (followupId) => {
    try {
      await followupAPI.dismiss(followupId);
      toast.success("Follow-up dismissed");
      loadData();
    } catch (err) {
      toast.error("Failed to dismiss");
    }
  };

  const handleEditSave = async () => {
    if (!editDialog) return;
    try {
      await followupAPI.update(editDialog.id, editDraft);
      toast.success("Draft updated");
      setEditDialog(null);
      loadData();
    } catch (err) {
      toast.error("Failed to update");
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await emailAPI.syncEmails();
      toast.success(res.data.message);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sync failed. Connect Gmail first.");
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const limitReached = planLimits && planLimits.followups_per_month !== -1 && planLimits.followups_used >= planLimits.followups_per_month;

  return (
    <div className="space-y-6" data-testid="followup-queue-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="followup-heading">Follow-up Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your AI-generated follow-up drafts</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="w-36" data-testid="tone-select">
              <SelectValue placeholder="Tone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="friendly" disabled={!isToneAllowed(userPlan, "friendly")}>
                Friendly {!isToneAllowed(userPlan, "friendly") && "(Pro)"}
              </SelectItem>
              <SelectItem value="casual" disabled={!isToneAllowed(userPlan, "casual")}>
                Casual {!isToneAllowed(userPlan, "casual") && "(Pro)"}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} data-testid="sync-queue-btn">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Sync
          </Button>
        </div>
      </div>

      {/* Plan usage bar */}
      {planLimits && planLimits.followups_per_month !== -1 && (
        <Card className={limitReached ? "border-destructive/50 bg-destructive/5" : ""} data-testid="usage-bar">
          <CardContent className="py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Monthly Follow-ups: {planLimits.followups_used} / {planLimits.followups_per_month}
              </span>
              {limitReached && (
                <Button size="sm" variant="link" className="text-primary h-auto p-0" onClick={() => navigate("/billing")} data-testid="upgrade-from-queue">
                  Upgrade <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${limitReached ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${Math.min((planLimits.followups_used / planLimits.followups_per_month) * 100, 100)}%` }}
              />
            </div>
            {limitReached && (
              <p className="text-xs text-destructive mt-1.5" data-testid="limit-reached-msg">
                You have reached your monthly follow-up limit. Upgrade your plan to continue.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="queue-tabs">
          <TabsTrigger value="silent" data-testid="tab-silent">
            <Clock className="w-3.5 h-3.5 mr-1.5" /> Silent Threads
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">
            <Zap className="w-3.5 h-3.5 mr-1.5" /> Pending
          </TabsTrigger>
          <TabsTrigger value="sent" data-testid="tab-sent">
            <Send className="w-3.5 h-3.5 mr-1.5" /> Sent
          </TabsTrigger>
          <TabsTrigger value="dismissed" data-testid="tab-dismissed">
            <XCircle className="w-3.5 h-3.5 mr-1.5" /> Dismissed
          </TabsTrigger>
        </TabsList>

        {/* Silent Threads */}
        <TabsContent value="silent" className="mt-4">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : threads.length === 0 ? (
            <EmptyState icon={Mail} title="No silent threads" desc="All your conversations are active, or connect Gmail to start." />
          ) : (
            <div className="space-y-3">
              {threads.map((t) => (
                <Card key={t.id} className="hover-lift" data-testid={`silent-thread-${t.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold truncate">{t.subject}</p>
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 shrink-0">
                            {t.days_silent}d silent
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">
                          To: {t.participant_names?.[0] || "Unknown"} ({t.participants?.[1] || ""})
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{t.snippet}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleGenerate(t.id)}
                        disabled={generating[t.id] || limitReached}
                        className="shrink-0 bg-primary hover:bg-primary/90 text-white"
                        data-testid={`generate-btn-${t.id}`}
                      >
                        {generating[t.id] ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</>
                        ) : limitReached ? (
                          <><Lock className="w-3.5 h-3.5 mr-1.5" /> Limit</>
                        ) : (
                          <><Zap className="w-3.5 h-3.5 mr-1.5" /> Generate</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Pending Follow-ups */}
        <TabsContent value="pending" className="mt-4">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
          ) : followups.length === 0 ? (
            <EmptyState icon={Zap} title="No pending drafts" desc="Generate AI follow-ups from silent threads." />
          ) : (
            <div className="space-y-3">
              {followups.map((f) => (
                <Card key={f.id} className="hover-lift" data-testid={`pending-followup-${f.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{f.original_subject}</p>
                        <Badge variant="secondary" className="text-xs">{f.tone}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(f.created_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">To: {f.recipient_name || f.recipient}</p>
                    <div className="p-3 rounded-lg bg-muted/50 text-sm mt-2 mb-3 leading-relaxed whitespace-pre-line">
                      {f.ai_draft}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleSend(f.id)} disabled={sending[f.id]} className="bg-primary hover:bg-primary/90 text-white" data-testid={`send-btn-${f.id}`}>
                        {sending[f.id] ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                        Send
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditDialog(f); setEditDraft(f.ai_draft); }}
                        data-testid={`edit-btn-${f.id}`}
                      >
                        <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDismiss(f.id)} className="text-muted-foreground" data-testid={`dismiss-btn-${f.id}`}>
                        <X className="w-3.5 h-3.5 mr-1.5" /> Dismiss
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Sent */}
        <TabsContent value="sent" className="mt-4">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : followups.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No sent follow-ups yet" desc="Send your first AI-generated follow-up." />
          ) : (
            <div className="space-y-3">
              {followups.map((f) => (
                <Card key={f.id} data-testid={`sent-followup-${f.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold">{f.original_subject}</p>
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Sent
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">To: {f.recipient_name || f.recipient} &middot; Sent {formatDate(f.sent_at)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Dismissed */}
        <TabsContent value="dismissed" className="mt-4">
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : followups.length === 0 ? (
            <EmptyState icon={XCircle} title="No dismissed follow-ups" desc="Dismissed drafts will appear here." />
          ) : (
            <div className="space-y-3">
              {followups.map((f) => (
                <Card key={f.id} className="opacity-70" data-testid={`dismissed-followup-${f.id}`}>
                  <CardContent className="py-4">
                    <p className="text-sm font-semibold">{f.original_subject}</p>
                    <p className="text-xs text-muted-foreground">To: {f.recipient_name || f.recipient} &middot; Dismissed</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent data-testid="edit-draft-dialog">
          <DialogHeader>
            <DialogTitle>Edit Follow-up Draft</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Re: {editDialog?.original_subject}</p>
            <Textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              rows={8}
              className="resize-none"
              data-testid="edit-draft-textarea"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={handleEditSave} className="bg-primary hover:bg-primary/90 text-white" data-testid="save-draft-btn">
              Save Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }) {
  return (
    <div className="text-center py-16">
      <Icon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </div>
  );
}
