import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { inboxAPI, emailAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Inbox,
  Mail,
  Send,
  Edit3,
  Copy,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Flame,
  Clock,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Users,
  DollarSign,
  Headphones,
  Handshake,
  Megaphone,
  User,
  Ban,
  Loader2,
  ChevronRight,
  Filter,
  Star,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   CATEGORY & PRIORITY CONFIGURATIONS
═══════════════════════════════════════════════════════════════ */

const CATEGORY_CONFIG = {
  Client:      { icon: Users,      color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
  Lead:        { icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  Payment:     { icon: DollarSign, color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200" },
  Support:     { icon: Headphones, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
  Partnership: { icon: Handshake,  color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  Marketing:   { icon: Megaphone,  color: "text-pink-600",   bg: "bg-pink-50",   border: "border-pink-200" },
  Personal:    { icon: User,       color: "text-gray-600",   bg: "bg-gray-50",   border: "border-gray-200" },
  Spam:        { icon: Ban,        color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200" },
};

const PRIORITY_CONFIG = {
  HOT:  { label: "HOT",  color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    icon: Flame },
  WARM: { label: "WARM", color: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200",  icon: TrendingUp },
  LOW:  { label: "LOW",  color: "text-gray-500",   bg: "bg-gray-50",   border: "border-gray-200",   icon: Clock },
};

const OPPORTUNITY_LABELS = {
  Client:      "Potential Client",
  Partnership: "Partnership Opportunity",
  Risk:        "Requires Attention",
  None:        null,
};

/* ═══════════════════════════════════════════════════════════════
   BADGE COMPONENTS
═══════════════════════════════════════════════════════════════ */

function CategoryBadge({ category }) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.Personal;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.bg} ${config.color} ${config.border} text-xs`}>
      <Icon className="w-3 h-3 mr-1" />
      {category}
    </Badge>
  );
}

function PriorityBadge({ priority }) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.LOW;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.bg} ${config.color} ${config.border} text-xs font-semibold`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}

function OpportunityIndicator({ type }) {
  const label = OPPORTUNITY_LABELS[type];
  if (!label) return null;
  
  const colors = {
    Client: "text-blue-600 bg-blue-50",
    Partnership: "text-purple-600 bg-purple-50",
    Risk: "text-red-600 bg-red-50",
  };
  
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[type] || ""}`}>
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DAILY SUMMARY SECTION
═══════════════════════════════════════════════════════════════ */

function DailySummary({ summary, loading, onEmailClick }) {
  if (loading) {
    return (
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary || !summary.top_emails || summary.top_emails.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Star className="w-5 h-5 text-primary" />
          Today's Summary
          <span className="text-xs font-normal text-muted-foreground ml-2">
            {summary.date}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {summary.top_emails.slice(0, 5).map((email, idx) => (
            <div
              key={email.id}
              onClick={() => onEmailClick(email)}
              className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border hover:border-primary/50 cursor-pointer transition-all group"
            >
              <span className="text-lg font-bold text-muted-foreground w-6">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium truncate">{email.subject || "(No subject)"}</p>
                  <PriorityBadge priority={email.priority_label} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {email.summary || email.snippet}
                </p>
              </div>
              <CategoryBadge category={email.category} />
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
          {Object.entries(summary.priority_counts || {}).map(([priority, count]) => {
            const config = PRIORITY_CONFIG[priority];
            if (!config || count === 0) return null;
            return (
              <div key={priority} className="flex items-center gap-1.5">
                <span className={`text-xs font-semibold ${config.color}`}>{count}</span>
                <span className="text-xs text-muted-foreground">{priority}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL LIST ITEM
═══════════════════════════════════════════════════════════════ */

function EmailListItem({ email, isSelected, onClick }) {
  return (
    <div
      onClick={() => onClick(email)}
      className={`
        flex items-start gap-3 p-4 border-b border-border cursor-pointer transition-all
        ${isSelected ? "bg-primary/5 border-l-4 border-l-primary" : "hover:bg-muted/50"}
      `}
    >
      {/* Priority indicator */}
      <div className="mt-1">
        {email.priority_label === "HOT" && <Flame className="w-4 h-4 text-red-500" />}
        {email.priority_label === "WARM" && <TrendingUp className="w-4 h-4 text-amber-500" />}
        {email.priority_label === "LOW" && <Clock className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className={`text-sm truncate ${isSelected ? "font-semibold" : "font-medium"}`}>
            {email.subject || "(No subject)"}
          </p>
        </div>
        
        <p className="text-xs text-muted-foreground mb-1.5">
          From: {email.sender}
        </p>
        
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {email.summary || email.snippet}
        </p>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryBadge category={email.category || "Personal"} />
          {email.opportunity_type && email.opportunity_type !== "None" && (
            <OpportunityIndicator type={email.opportunity_type} />
          )}
          {email.needs_followup && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600 border-amber-200">
              Follow-up Needed
            </Badge>
          )}
        </div>
      </div>

      {/* Days silent */}
      {email.days_silent > 0 && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
          email.days_silent >= 7 ? "bg-red-50 text-red-600" :
          email.days_silent >= 3 ? "bg-amber-50 text-amber-600" :
          "bg-gray-50 text-gray-500"
        }`}>
          {email.days_silent}d
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   REPLY PANEL (3 Options: Professional, Friendly, Concise)
═══════════════════════════════════════════════════════════════ */

function ReplyPanel({ email, onClose }) {
  const [loading, setLoading] = useState(false);
  const [replies, setReplies] = useState(null);
  const [selectedTone, setSelectedTone] = useState("professional");
  const [editedReply, setEditedReply] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [copying, setCopying] = useState(false);

  // Generate replies on email change
  useEffect(() => {
    if (email) {
      handleGenerateReplies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email?.id]);

  const handleGenerateReplies = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await inboxAPI.generateReplies({
        message_id: email.id,
        subject: email.subject || "",
        snippet: email.snippet || email.summary || "",
        sender: email.sender || "",
      });
      
      const data = res.data.data.replies;
      setReplies(data);
      setEditedReply(data.professional || "");
      setSelectedTone("professional");
    } catch (err) {
      toast.error("Failed to generate replies");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToneSelect = (tone) => {
    setSelectedTone(tone);
    if (replies && replies[tone]) {
      setEditedReply(replies[tone]);
      setIsEditing(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedReply);
      setCopying(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopying(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleSendViaGmail = async () => {
    try {
      const res = await inboxAPI.getGmailComposeUrl({
        to: email.sender || "",
        subject: `Re: ${email.subject || ""}`,
        body: editedReply,
      });
      
      const gmailUrl = res.data.data.gmail_url;
      window.open(gmailUrl, "_blank");
      toast.success("Opening Gmail...");
    } catch (err) {
      toast.error("Failed to open Gmail");
      console.error(err);
    }
  };

  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center">
        <Inbox className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground">Select an email to generate AI replies</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm truncate flex-1 mr-2">
            {email.subject || "(No subject)"}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7">
            Close
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">To: {email.sender}</p>
      </div>

      {/* Original message preview */}
      <div className="p-4 bg-muted/30 border-b border-border">
        <p className="text-xs text-muted-foreground mb-1">Original message:</p>
        <p className="text-sm line-clamp-3">{email.snippet || email.summary}</p>
      </div>

      {/* Reply options */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Generating AI replies...</p>
          </div>
        ) : replies ? (
          <div className="space-y-4">
            {/* Tone selector */}
            <div className="flex gap-2">
              {[
                { key: "professional", label: "Professional", emoji: "💼" },
                { key: "friendly", label: "Friendly", emoji: "😊" },
                { key: "concise", label: "Concise", emoji: "⚡" },
              ].map(({ key, label, emoji }) => (
                <button
                  key={key}
                  onClick={() => handleToneSelect(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                    selectedTone === key
                      ? "bg-primary text-white border-primary"
                      : "bg-background border-border hover:border-primary/50"
                  }`}
                >
                  <span>{emoji}</span>
                  {label}
                </button>
              ))}
            </div>

            {/* Reply editor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  AI Generated Reply
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateReplies}
                  className="h-6 text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Regenerate
                </Button>
              </div>
              
              <Textarea
                value={editedReply}
                onChange={(e) => {
                  setEditedReply(e.target.value);
                  setIsEditing(true);
                }}
                className="min-h-[200px] text-sm"
                placeholder="AI reply will appear here..."
              />

              {isEditing && editedReply !== replies[selectedTone] && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <Edit3 className="w-3 h-3" />
                  You've edited this reply
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSendViaGmail}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Send via Gmail
              </Button>
              
              <Button variant="outline" onClick={handleCopy}>
                {copying ? (
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {copying ? "Copied!" : "Copy"}
              </Button>
            </div>

            {/* Compliance notice */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs text-blue-700">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                Clicking "Send via Gmail" opens Gmail in a new tab with your reply pre-filled. 
                You maintain full control - review and click Send in Gmail to deliver.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10">
            <Button onClick={handleGenerateReplies}>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Replies
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FILTER TABS
═══════════════════════════════════════════════════════════════ */

function FilterTabs({ activeTab, onTabChange, counts }) {
  const tabs = [
    { key: "all", label: "All", count: counts.all },
    { key: "priority", label: "Priority", count: counts.hot + counts.warm },
    { key: "opportunities", label: "Opportunities", count: counts.opportunities },
    { key: "followups", label: "Follow-ups", count: counts.followups },
  ];

  return (
    <div className="flex gap-1 p-1 bg-muted rounded-lg">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === tab.key
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === tab.key ? "bg-primary/15 text-primary" : "bg-muted-foreground/20"
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN UNIFIED INBOX DASHBOARD
═══════════════════════════════════════════════════════════════ */

export default function UnifiedInbox() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [emails, setEmails] = useState([]);
  const [dailySummary, setDailySummary] = useState(null);
  const [stats, setStats] = useState(null);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [messagesRes, summaryRes, statsRes] = await Promise.allSettled([
        inboxAPI.getMessages(100),
        inboxAPI.getDailySummary(),
        inboxAPI.getStats(),
      ]);

      if (messagesRes.status === "fulfilled") {
        setEmails(messagesRes.value.data.data || []);
      }
      if (summaryRes.status === "fulfilled") {
        setDailySummary(summaryRes.value.data.data);
      }
      if (statsRes.status === "fulfilled") {
        setStats(statsRes.value.data.data);
      }
    } catch (err) {
      toast.error("Failed to load inbox data");
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

  // Filter emails based on active tab
  const filteredEmails = useMemo(() => {
    switch (activeTab) {
      case "priority":
        return emails.filter(e => e.priority_label === "HOT" || e.priority_label === "WARM");
      case "opportunities":
        return emails.filter(e => e.opportunity_type && e.opportunity_type !== "None");
      case "followups":
        return emails.filter(e => e.needs_followup);
      default:
        return emails;
    }
  }, [emails, activeTab]);

  // Count for tabs
  const counts = useMemo(() => ({
    all: emails.length,
    hot: emails.filter(e => e.priority_label === "HOT").length,
    warm: emails.filter(e => e.priority_label === "WARM").length,
    opportunities: emails.filter(e => e.opportunity_type && e.opportunity_type !== "None").length,
    followups: emails.filter(e => e.needs_followup).length,
  }), [emails]);

  const firstName = user?.full_name?.split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Inbox className="w-6 h-6 text-primary" />
              AI Inbox
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Welcome back, {firstName}. Here's your prioritized inbox.
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
            <Button
              size="sm"
              onClick={() => navigate("/compose")}
              className="bg-primary hover:bg-primary/90"
            >
              <Mail className="w-4 h-4 mr-2" />
              Compose
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-red-500" />
              <span className="font-semibold">{stats.hot_priority || 0}</span>
              <span className="text-muted-foreground">HOT</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              <span className="font-semibold">{stats.warm_priority || 0}</span>
              <span className="text-muted-foreground">WARM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <span className="font-semibold">{stats.needs_followup || 0}</span>
              <span className="text-muted-foreground">Need Follow-up</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold">{stats.total_messages || 0}</span>
              <span className="text-muted-foreground">Total</span>
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="p-6">
        {/* Daily Summary */}
        <DailySummary
          summary={dailySummary}
          loading={loading}
          onEmailClick={(email) => setSelectedEmail(email)}
        />

        {/* Filter tabs */}
        <div className="flex items-center justify-between mb-4">
          <FilterTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={counts}
          />
        </div>

        {/* Split view: Email list + Reply panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email list */}
          <Card className="overflow-hidden">
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Inbox ({filteredEmails.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <Inbox className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No emails found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeTab !== "all" ? "Try a different filter" : "Connect Gmail in Settings"}
                  </p>
                </div>
              ) : (
                filteredEmails.map(email => (
                  <EmailListItem
                    key={email.id}
                    email={email}
                    isSelected={selectedEmail?.id === email.id}
                    onClick={setSelectedEmail}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Reply panel */}
          <Card className="overflow-hidden">
            <ReplyPanel
              email={selectedEmail}
              onClose={() => setSelectedEmail(null)}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
