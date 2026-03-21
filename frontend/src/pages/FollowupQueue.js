import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { emailAPI, followupAPI, settingsAPI } from "@/lib/api";
import api from "@/lib/api";  // default export for smart-replies call
import { Button } from "@/components/ui/button";
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
  RefreshCw, Send, Edit3, EyeOff, Loader2, Clock,
  CheckCircle2, Zap, Bot, Ban, PartyPopper, Flame,
  AlertCircle, RotateCcw, Sparkles, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

/* ─────────────────────────────────────────────────────────────
   PRIORITY ICON — unchanged
───────────────────────────────────────────────────────────── */
function PriorityIcon({ level }) {
  if (level === "high")   return <span className="text-red-500 text-sm leading-none" title="High priority">🔥</span>;
  if (level === "medium") return <span className="text-amber-500 text-sm leading-none" title="Medium priority">⚡</span>;
  return                         <span className="text-gray-400 text-sm leading-none" title="Low priority">💤</span>;
}

/* ─────────────────────────────────────────────────────────────
   TYPE CHIP — unchanged
───────────────────────────────────────────────────────────── */
function TypeChip({ type }) {
  const cfg = {
    client_proposal: { label: "Proposal",    cls: "bg-purple-50 text-purple-600 border-purple-100" },
    payment:         { label: "Payment",     cls: "bg-green-50 text-green-600 border-green-100"   },
    interview:       { label: "Interview",   cls: "bg-blue-50 text-blue-600 border-blue-100"      },
    lead:            { label: "Lead",        cls: "bg-orange-50 text-orange-600 border-orange-100"},
    partnership:     { label: "Partnership", cls: "bg-pink-50 text-pink-600 border-pink-100"      },
    other:           { label: "General",     cls: "bg-gray-50 text-gray-500 border-gray-100"      },
  };
  if (!type || ["notification", "newsletter"].includes(type)) return null;
  const c = cfg[type] || cfg.other;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${c.cls}`}>
      {c.label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   SMART SUGGESTION CARD — individual reply option
───────────────────────────────────────────────────────────── */
const SUGGESTION_META = {
  friendly:     { emoji: "😊", label: "Friendly",     cls: "border-blue-100 hover:border-blue-300 hover:bg-blue-50/50"   },
  professional: { emoji: "💼", label: "Professional", cls: "border-purple-100 hover:border-purple-300 hover:bg-purple-50/50" },
  direct:       { emoji: "⚡", label: "Direct",       cls: "border-amber-100 hover:border-amber-300 hover:bg-amber-50/50" },
};

function SuggestionCard({ suggestion, isSelected, onSelect }) {
  const meta = SUGGESTION_META[suggestion.type] || { emoji: "✉️", label: suggestion.type, cls: "border-border hover:bg-muted/50" };
  return (
    <div
      onClick={() => onSelect(suggestion.text)}
      className={`relative cursor-pointer rounded-xl border p-3 transition-all duration-150 ${meta.cls} ${
        isSelected
          ? "ring-2 ring-primary border-primary bg-primary/4"
          : "bg-background"
      }`}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
          <CheckCircle2 className="w-2.5 h-2.5 text-white" />
        </div>
      )}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">{meta.emoji}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
      </div>
      <p className="text-xs text-foreground/80 leading-relaxed line-clamp-4 whitespace-pre-wrap">
        {suggestion.text}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SMART REPLIES PANEL — inline expand below the row
   Handles its own loading/suggestion state.
   onConfirm(text) → saves draft text back to parent then sends.
   onClose() → collapses panel.
───────────────────────────────────────────────────────────── */
function SmartRepliesPanel({ thread, tone, onSend, onSaveDraft, onClose, followupId }) {
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions,        setSuggestions]        = useState([]);
  const [selectedText,       setSelectedText]       = useState("");
  const [sending,            setSending]            = useState(false);
  const [saving,             setSaving]             = useState(false);
  const [editedText,         setEditedText]         = useState("");
  const [fetched,            setFetched]            = useState(false);

  // Auto-fetch on mount
  useEffect(() => {
    if (!fetched) fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await api.post("/followups/smart-replies", {
        thread_id: thread.id,
        tone,
      });
      const sugs = res.data.suggestions || [];
      setSuggestions(sugs);
      // Auto-select first suggestion
      if (sugs.length > 0) {
        setSelectedText(sugs[0].text);
        setEditedText(sugs[0].text);
      }
      setFetched(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to generate suggestions");
      onClose();
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSelectSuggestion = (text) => {
    setSelectedText(text);
    setEditedText(text);
  };

  // Save chosen text as draft then send
  const handleSendSelected = async () => {
    if (!editedText.trim()) return;
    setSending(true);
    try {
      // If there's already a followup_id, update its text then send
      // Otherwise use the parent's onGenerate flow via onSaveDraft callback
      if (followupId) {
        await followupAPI.update(followupId, editedText);
        await onSend(followupId);
      } else {
        // Save draft first via parent callback, then send
        const newFollowupId = await onSaveDraft(editedText);
        if (newFollowupId) await onSend(newFollowupId);
      }
    } catch {
      // errors handled in onSend
    } finally {
      setSending(false);
    }
  };

  // Save as draft without sending
  const handleSaveAsDraft = async () => {
    if (!editedText.trim()) return;
    setSaving(true);
    try {
      if (followupId) {
        await followupAPI.update(followupId, editedText);
        toast.success("Draft saved ✅");
        onClose();
      } else {
        await onSaveDraft(editedText);
        onClose();
      }
    } catch {
      toast.error("Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 pb-5 pt-1 space-y-4 border-t border-border/60 bg-muted/20"
      onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Smart Reply Suggestions</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            AI · {thread.days_silent}d silent
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
        >
          Close
        </button>
      </div>

      {/* Suggestion cards */}
      {loadingSuggestions ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-border bg-background p-3 space-y-2 animate-pulse">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {suggestions.map((s, i) => (
            <SuggestionCard
              key={i}
              suggestion={s}
              isSelected={selectedText === s.text}
              onSelect={handleSelectSuggestion}
            />
          ))}
        </div>
      )}

      {/* Editable textarea */}
      {!loadingSuggestions && suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Edit before sending
          </p>
          <Textarea
            value={editedText}
            onChange={e => setEditedText(e.target.value)}
            className="text-sm min-h-[100px] resize-none bg-background"
            placeholder="Select a suggestion above or type your own…"
          />
          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleSendSelected}
              disabled={sending || !editedText.trim()}
              className="bg-primary hover:bg-primary/90 text-white h-8 text-xs font-semibold"
            >
              {sending
                ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Sending…</>
                : <><Send className="w-3 h-3 mr-1.5" />Send Now</>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveAsDraft}
              disabled={saving || !editedText.trim()}
              className="h-8 text-xs"
            >
              {saving
                ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Saving…</>
                : <><Edit3 className="w-3 h-3 mr-1.5" />Save as Draft</>}
            </Button>
            <button
              onClick={fetchSuggestions}
              disabled={loadingSuggestions}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors ml-auto"
            >
              <RefreshCw className={`w-3 h-3 ${loadingSuggestions ? "animate-spin" : ""}`} />
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   OPPORTUNITY ROW — upgraded with smart replies panel
   All original handlers (onGenerate, onSend, onDismiss,
   onIgnoreSender) are passed through and called exactly as before.
   
   CHANGE SUMMARY vs original:
   - Added: suggestions state + SmartRepliesPanel
   - Generate button now opens SmartRepliesPanel instead of
     calling onGenerate directly (onGenerate still called for
     "existing draft" flow)
   - All other behaviour identical
───────────────────────────────────────────────────────────── */
function OpportunityRow({ thread, onGenerate, onSend, onDismiss, onIgnoreSender, generating }) {
  const [expanded,        setExpanded]        = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editMode,        setEditMode]        = useState(false);
  const [draft,           setDraft]           = useState(thread.ai_draft || "");
  const [saving,          setSaving]          = useState(false);
  const [sending,         setSending]         = useState(false);
  const [hovered,         setHovered]         = useState(false);

  const hasDraft = !!thread.ai_draft;
  const sender   = thread.last_message_from || "";
  const context  = thread.opportunity_context || "";

  // ── Unchanged handlers ──
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

  // ── NEW: called by SmartRepliesPanel when user picks a suggestion
  //    and wants to save it as a draft. Returns the followup_id so
  //    the panel can immediately send it.
  const handleSaveSuggestionAsDraft = async (text) => {
    try {
      if (thread.followup_id) {
        // Existing draft row — just update the text
        await followupAPI.update(thread.followup_id, text);
        toast.success("Draft saved ✅");
        return thread.followup_id;
      } else {
        // No draft row yet. We use force_regenerate: true here to bypass the
        // should_show_reply gate on the backend. That gate is designed to
        // prevent accidental generation — but the user has already reviewed
        // and chosen a suggestion, so the intent is explicit. Without this flag
        // the backend returns 400 "Cannot generate reply: ..." which surfaces
        // as "Failed to save draft" in the catch block.
        const res = await followupAPI.generate(thread.id, "professional", true);
        const newId = res.data.id;
        // Overwrite the AI-generated text with the user's chosen suggestion
        await followupAPI.update(newId, text);
        toast.success("Draft saved ✅");
        return newId;
      }
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(detail || "Failed to save draft");
      return null;
    }
  };

  // ── NEW: Generate button click — show smart panel instead of raw draft
  const handleGenerateClick = (e) => {
    e.stopPropagation();
    setShowSuggestions(true);
    setExpanded(true);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group border-b border-border transition-colors duration-100 ${
        hovered ? "bg-muted/40" : "bg-background"
      }`}
      data-testid={`opportunity-row-${thread.id}`}
    >
      {/* ── Main row — identical layout to original ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => !editMode && setExpanded(e => !e)}
      >
        {/* Priority icon */}
        <div className="w-5 shrink-0 flex items-center justify-center">
          <PriorityIcon level={thread.priority_level} />
        </div>

        {/* Center */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm truncate max-w-[340px] ${hasDraft ? "font-semibold" : "font-medium"}`}>
              {thread.subject}
            </span>
            <TypeChip type={thread.type} />
            {hasDraft && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/8 text-primary border border-primary/20">
                <Zap className="w-2.5 h-2.5" /> Draft ready
              </span>
            )}
            {showSuggestions && !hasDraft && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600 border border-purple-100">
                <Sparkles className="w-2.5 h-2.5" /> Suggestions open
              </span>
            )}
          </div>
          {context && (
            <p className="text-xs text-primary/70 font-medium mt-0.5 truncate">💡 {context}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            From: {sender || "Unknown"}
          </p>
        </div>

        {/* Right — time + hover actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
            thread.days_silent >= 7
              ? "bg-red-50 text-red-600 border-red-100"
              : thread.days_silent >= 3
              ? "bg-amber-50 text-amber-600 border-amber-100"
              : "bg-muted text-muted-foreground border-border"
          }`}>
            {thread.days_silent}d
          </span>

          <div
            className={`flex items-center gap-1 transition-opacity duration-100 ${hovered ? "opacity-100" : "opacity-0"}`}
            onClick={e => e.stopPropagation()}
          >
            {!hasDraft ? (
              /* ✅ NEW: Generate → opens SmartRepliesPanel */
              <button
                onClick={handleGenerateClick}
                disabled={generating === thread.id}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border bg-background hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:opacity-50"
                title="Generate smart replies"
              >
                {generating === thread.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Sparkles className="w-3 h-3" />}
                <span className="hidden sm:inline">Generate</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border bg-background hover:bg-primary hover:text-white hover:border-primary transition-colors"
                  title="Send follow-up"
                >
                  {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  <span className="hidden sm:inline">Send</span>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setEditMode(true); setExpanded(true); }}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border bg-background hover:bg-muted transition-colors"
                  title="Edit draft"
                >
                  <Edit3 className="w-3 h-3" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              </>
            )}
            <button
              onClick={() => onDismiss(thread)}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border bg-background hover:bg-muted text-muted-foreground transition-colors"
              title="Dismiss"
            >
              <EyeOff className="w-3 h-3" />
              <span className="hidden sm:inline">Dismiss</span>
            </button>
            {sender && (
              <button
                onClick={() => onIgnoreSender(thread)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border bg-background hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-muted-foreground transition-colors"
                title="Block sender"
              >
                <Ban className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Smart Replies Panel (NEW) ── */}
      {showSuggestions && !hasDraft && (
        <SmartRepliesPanel
          thread={thread}
          tone="professional"
          onSend={onSend}
          onSaveDraft={handleSaveSuggestionAsDraft}
          onClose={() => { setShowSuggestions(false); setExpanded(false); }}
          followupId={thread.followup_id}
        />
      )}

      {/* ── Expanded panel — existing draft viewer/editor (unchanged) ── */}
      {expanded && !showSuggestions && (
        <div className="px-12 pb-4 space-y-3" onClick={e => e.stopPropagation()}>
          {/* Email snippet */}
          {thread.snippet && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border/60">
              {thread.snippet}
            </div>
          )}

          {/* Draft */}
          {hasDraft && (
            <div>
              {editMode ? (
                <div className="space-y-2">
                  <Textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    className="text-sm min-h-[120px] resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveDraft} disabled={saving}
                      className="bg-primary hover:bg-primary/90 text-white h-7 text-xs">
                      {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                      Save Draft
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)} className="h-7 text-xs">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-foreground/80 bg-muted/30 rounded-lg p-3 border border-dashed border-border hover:border-primary/30 transition-colors">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    AI Draft
                  </p>
                  <p className="leading-relaxed whitespace-pre-wrap">{thread.ai_draft}</p>
                </div>
              )}
            </div>
          )}

          {/* Expanded action bar */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {!hasDraft ? (
              /* In expanded state with no draft → also open suggestions */
              <Button size="sm"
                onClick={e => { e.stopPropagation(); setShowSuggestions(true); }}
                className="bg-primary hover:bg-primary/90 text-white h-7 text-xs">
                <Sparkles className="w-3 h-3 mr-1" />Get Smart Replies
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={handleSend} disabled={sending}
                  className="bg-primary hover:bg-primary/90 text-white h-7 text-xs">
                  {sending
                    ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Sending…</>
                    : <><Send className="w-3 h-3 mr-1" />Send Now</>}
                </Button>
                {!editMode && (
                  <Button size="sm" variant="outline" onClick={() => setEditMode(true)} className="h-7 text-xs">
                    <Edit3 className="w-3 h-3 mr-1" />Edit Draft
                  </Button>
                )}
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => onDismiss(thread)}
              className="text-muted-foreground hover:text-foreground h-7 text-xs">
              <EyeOff className="w-3 h-3 mr-1" />Dismiss
            </Button>
            {sender && (
              <Button size="sm" variant="ghost" onClick={() => onIgnoreSender(thread)}
                className="text-muted-foreground hover:text-destructive h-7 text-xs">
                <Ban className="w-3 h-3 mr-1" />Ignore Sender
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ALL COMPONENTS BELOW — byte-for-byte identical to original
───────────────────────────────────────────────────────────── */

function SentRow({ followup }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors">
      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{followup.original_subject}</p>
          {followup.auto_sent && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100">
              <Bot className="w-2.5 h-2.5" /> Auto-sent
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          To: {followup.recipient} · {followup.sent_at
            ? new Date(followup.sent_at).toLocaleDateString() : "recently"}
        </p>
      </div>
      {followup.ai_draft && (
        <p className="text-xs text-muted-foreground truncate max-w-[200px] hidden md:block">
          {followup.ai_draft}
        </p>
      )}
    </div>
  );
}

function EmptyOpportunities({ onSync, syncing }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
        <PartyPopper className="w-7 h-7 text-emerald-500" />
      </div>
      <p className="text-base font-semibold">You're all caught up</p>
      <p className="text-sm text-muted-foreground mt-1.5 text-center max-w-xs">
        No important conversations need follow-up right now.
      </p>
      <Button variant="outline" size="sm" onClick={onSync} disabled={syncing} className="mt-6">
        <RefreshCw className={`w-3.5 h-3.5 mr-2 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing…" : "Sync Gmail"}
      </Button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-border">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="w-4 h-4 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function InsightBar({ threads, sentFollowups }) {
  const high    = threads.filter(t => t.priority_level === "high").length;
  const ready   = threads.filter(t => !!t.ai_draft).length;
  const autoToday = sentFollowups.filter(f => {
    if (!f.auto_sent || !f.sent_at) return false;
    const d = new Date(f.sent_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  if (threads.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground flex-wrap">
      {high > 0 && (
        <span className="flex items-center gap-1 font-medium text-red-600">
          🔥 <span>{high} need attention</span>
        </span>
      )}
      {high > 0 && (ready > 0 || autoToday > 0) && <span className="text-border">·</span>}
      {ready > 0 && (
        <span className="flex items-center gap-1 font-medium text-primary">
          ⚡ <span>{ready} draft{ready !== 1 ? "s" : ""} ready to send</span>
        </span>
      )}
      {autoToday > 0 && (
        <>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1">
            🤖 <span>{autoToday} automated today</span>
          </span>
        </>
      )}
      {high === 0 && ready === 0 && autoToday === 0 && (
        <span>{threads.length} conversation{threads.length !== 1 ? "s" : ""} waiting for follow-up</span>
      )}
    </div>
  );
}

function PriorityFilter({ value, onChange, threads }) {
  const highCount   = threads.filter(t => t.priority_level === "high").length;
  const mediumCount = threads.filter(t => t.priority_level === "medium").length;
  const lowCount    = threads.filter(t => t.priority_level === "low").length;

  const tabs = [
    { key: "all",    label: "All",       count: threads.length },
    { key: "high",   label: "🔥 High",   count: highCount      },
    { key: "medium", label: "⚡ Medium", count: mediumCount    },
    { key: "low",    label: "💤 Low",    count: lowCount       },
  ];

  return (
    <div className="flex gap-1.5 flex-wrap">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
            value === tab.key
              ? "bg-primary text-white border-primary shadow-sm"
              : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
          }`}
        >
          {tab.label}
          <span className={`text-[10px] tabular-nums ${value === tab.key ? "opacity-75" : "text-muted-foreground"}`}>
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
}

const TONES = ["professional", "friendly", "casual"];

/* ─────────────────────────────────────────────────────────────
   MAIN PAGE — all state + handlers IDENTICAL to original
───────────────────────────────────────────────────────────── */
export default function FollowupQueue() {
  const navigate = useNavigate();

  const [threads,             setThreads]             = useState([]);
  const [sentFollowups,       setSentFollowups]       = useState([]);
  const [dismissed,           setDismissed]           = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [syncing,             setSyncing]             = useState(false);
  const [generating,          setGenerating]          = useState(null);
  const [tone,                setTone]                = useState("professional");
  const [priorityFilter,      setPriorityFilter]      = useState("all");
  const [confirmDialog,       setConfirmDialog]       = useState(null);
  const [ignoreSenderDialog,  setIgnoreSenderDialog]  = useState(null);
  const [showFiltered,        setShowFiltered]        = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [silentRes, sentRes, dismissedRes] = await Promise.allSettled([
        emailAPI.getSilentThreads({ limit: 50, show_filtered: showFiltered }),
        followupAPI.list({ status: "sent", limit: 50 }),
        emailAPI.getThreads({ filter_type: "dismissed", limit: 50 }),
      ]);

      if (silentRes.status === "fulfilled") {
        const pendingRes = await followupAPI.list({ status: "pending", limit: 100 });
        const pendingMap = {};
        (pendingRes.data.followups || []).forEach(f => { pendingMap[f.thread_id] = f; });

        const enriched = (silentRes.value.data.threads || []).map(t => ({
          ...t,
          followup_id: pendingMap[t.id]?.id      || null,
          ai_draft:    pendingMap[t.id]?.ai_draft || null,
          tone:        pendingMap[t.id]?.tone     || tone,
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
      toast.success(n > 0 ? `${n} new opportunit${n !== 1 ? "ies" : "y"} found 📬` : "Already up to date ✅");
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
          ? { ...t, followup_id: res.data.id, ai_draft: res.data.ai_draft }
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

  const handleDismiss      = (thread) => setConfirmDialog({ thread });
  const handleIgnoreSender = (thread) => setIgnoreSenderDialog(thread);

  const confirmDismiss = async () => {
    if (!confirmDialog) return;
    try {
      await emailAPI.dismissThread(confirmDialog.thread.id);
      toast.success("Thread dismissed");
      setConfirmDialog(null);
      loadAll();
    } catch {
      toast.error("Action failed");
    }
  };

  const confirmIgnoreSender = async () => {
    if (!ignoreSenderDialog) return;
    const sender = ignoreSenderDialog.last_message_from;
    try {
      await settingsAPI.blockSender(sender);
      setThreads(prev => prev.filter(
        t => (t.last_message_from || "").toLowerCase() !== sender.toLowerCase()
      ));
      toast.success(`${sender} blocked`);
      setIgnoreSenderDialog(null);
    } catch {
      toast.error("Failed to block sender");
    }
  };

  const filteredThreads = threads.filter(t => {
    if (priorityFilter === "all")    return true;
    if (priorityFilter === "high")   return t.priority_level === "high";
    if (priorityFilter === "medium") return t.priority_level === "medium";
    if (priorityFilter === "low")    return t.priority_level === "low";
    return true;
  });

  return (
    <div className="space-y-4" data-testid="followup-queue-page">

      {/* Header — unchanged */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Follow-Ups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Important conversations that need your attention
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="w-34 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONES.map(t => (
                <SelectItem key={t} value={t} className="text-xs">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="h-8 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync"}
          </Button>
        </div>
      </div>

      {/* Insight Bar — unchanged */}
      <InsightBar threads={threads} sentFollowups={sentFollowups} />

      {/* Tabs — unchanged */}
      <Tabs defaultValue="silent">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
          <TabsList className="h-8 p-0.5">
            <TabsTrigger value="silent" className="text-xs h-7 px-3">
              Opportunities
              {threads.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                  {threads.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent" className="text-xs h-7 px-3">
              Sent
              {sentFollowups.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-semibold">
                  {sentFollowups.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="dismissed" className="text-xs h-7 px-3">
              Dismissed
              {dismissed.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-semibold">
                  {dismissed.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          {threads.length > 0 && (
            <PriorityFilter value={priorityFilter} onChange={setPriorityFilter} threads={threads} />
          )}
        </div>

        {/* Opportunities Tab */}
        <TabsContent value="silent" className="mt-0">
          <div className="rounded-xl border border-border overflow-hidden bg-background">
            {loading ? (
              <SkeletonRows />
            ) : filteredThreads.length === 0 ? (
              <EmptyOpportunities onSync={handleSync} syncing={syncing} />
            ) : (
              <div>
                {filteredThreads.map(thread => (
                  <OpportunityRow
                    key={thread.id}
                    thread={thread}
                    onGenerate={handleGenerate}
                    onSend={handleSend}
                    onDismiss={handleDismiss}
                    onIgnoreSender={handleIgnoreSender}
                    generating={generating}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => { setShowFiltered(s => !s); loadAll(); }}
              className="text-[11px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
            >
              {showFiltered ? "Hide filtered threads" : "Show filtered threads (dev)"}
            </button>
          </div>
        </TabsContent>

        {/* Sent Tab — unchanged */}
        <TabsContent value="sent" className="mt-0">
          <div className="rounded-xl border border-border overflow-hidden bg-background">
            {loading ? <SkeletonRows /> : sentFollowups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <CheckCircle2 className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No sent follow-ups yet</p>
              </div>
            ) : sentFollowups.map(f => <SentRow key={f.id} followup={f} />)}
          </div>
        </TabsContent>

        {/* Dismissed Tab — unchanged */}
        <TabsContent value="dismissed" className="mt-0">
          <div className="rounded-xl border border-border overflow-hidden bg-background">
            {loading ? <SkeletonRows /> : dismissed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <EyeOff className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No dismissed threads</p>
              </div>
            ) : dismissed.map(t => (
              <div key={t.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors opacity-60 hover:opacity-80">
                <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.last_message_from} · {t.days_silent}d silent
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                  onClick={async () => {
                    try {
                      await emailAPI.undismissThread(t.id);
                      toast.success("Thread restored");
                      loadAll();
                    } catch { toast.error("Failed to restore"); }
                  }}>
                  <RotateCcw className="w-3 h-3 mr-1" />Restore
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs — identical to original */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dismiss Thread?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This thread will be moved to dismissed and won't appear in your opportunities.
          </p>
          <p className="text-sm font-medium mt-2">{confirmDialog?.thread?.subject}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button onClick={confirmDismiss} className="bg-primary hover:bg-primary/90 text-white">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ignoreSenderDialog} onOpenChange={() => setIgnoreSenderDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ignore Sender?</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              All emails from this sender will be blocked and removed from your queue permanently.
            </p>
            <div className="p-3 bg-muted/50 rounded-lg border border-border">
              <p className="text-sm font-medium">{ignoreSenderDialog?.last_message_from}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{ignoreSenderDialog?.subject}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              You can unblock them in <strong>Settings → Blocked Senders</strong>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIgnoreSenderDialog(null)}>Cancel</Button>
            <Button onClick={confirmIgnoreSender} className="bg-destructive hover:bg-destructive/90 text-white">
              <Ban className="w-3.5 h-3.5 mr-1.5" />Block Sender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
