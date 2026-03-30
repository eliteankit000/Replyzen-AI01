import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { inboxAPI, emailAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  AlertTriangle,
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
  Target,
  ArrowRight,
  X,
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

/* ═══════════════════════════════════════════════════════════════
   OPPORTUNITY TAGS
═══════════════════════════════════════════════════════════════ */

function OpportunityTags({ email }) {
  const tags = [];
  
  if (email.opportunity_type === "Client" || email.category === "Client" || email.category === "Lead") {
    tags.push({ label: "Potential Client", color: "text-blue-600 bg-blue-50" });
  }
  if (email.opportunity_type === "Partnership" || email.category === "Partnership") {
    tags.push({ label: "Partnership", color: "text-purple-600 bg-purple-50" });
  }
  if (email.category === "Payment") {
    tags.push({ label: "Payment Related", color: "text-green-600 bg-green-50" });
  }
  if (email.opportunity_type === "Risk" || email.priority_label === "HOT") {
    tags.push({ label: "Requires Attention", color: "text-red-600 bg-red-50" });
  }

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {tags.map((tag, idx) => (
        <span key={idx} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${tag.color}`}>
          {tag.label}
        </span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TODAY'S FOCUS (COMPACT)
═══════════════════════════════════════════════════════════════ */

function TodaysFocus({ stats }) {
  return (
    <div className="flex items-center gap-6 mb-4 px-4 py-3 bg-muted/30 rounded-lg border border-border">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Today's Focus:</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5 text-blue-600" />
          <strong className="text-blue-600">{stats.opportunities}</strong>
          <span className="text-muted-foreground">opportunities</span>
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
          <strong className="text-red-600">{stats.requiresAttention}</strong>
          <span className="text-muted-foreground">need attention</span>
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <strong className="text-amber-600">{stats.followups}</strong>
          <span className="text-muted-foreground">follow-ups</span>
        </span>
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
    { key: "priority", label: "Priority", count: counts.priority },
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
   EMAIL LIST ITEM
═══════════════════════════════════════════════════════════════ */

function EmailListItem({ email, isSelected, onClick }) {
  return (
    <div
      onClick={() => onClick(email)}
      className={`
        p-4 border-b border-border cursor-pointer transition-all
        ${isSelected ? "bg-primary/5 border-l-4 border-l-primary" : "hover:bg-muted/50"}
      `}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Priority icon */}
          {email.priority_label === "HOT" && <Flame className="w-4 h-4 text-red-500 shrink-0" />}
          {email.priority_label === "WARM" && <TrendingUp className="w-4 h-4 text-amber-500 shrink-0" />}
          
          <p className={`text-sm truncate ${isSelected ? "font-semibold" : "font-medium"}`}>
            {email.subject || "(No subject)"}
          </p>
        </div>
        <PriorityBadge priority={email.priority_label || "LOW"} />
      </div>

      {/* Sender */}
      <p className="text-xs text-muted-foreground mb-1">
        From: {email.sender || email.last_message_from}
      </p>

      {/* AI Summary */}
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
        {email.summary || email.snippet}
      </p>

      {/* Category badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <CategoryBadge category={email.category || "Personal"} />
        {email.needs_followup && (
          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600 border-amber-200">
            Follow-up Needed
          </Badge>
        )}
      </div>

      {/* Opportunity tags */}
      <OpportunityTags email={email} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   REPLY PANEL
═══════════════════════════════════════════════════════════════ */

function ReplyPanel({ email, onClose }) {
  const [loading, setLoading] = useState(false);
  const [replies, setReplies] = useState(null);
  const [selectedTone, setSelectedTone] = useState("professional");
  const [editedReply, setEditedReply] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [generatingFollowup, setGeneratingFollowup] = useState(false);

  // Reset state when email changes
  useEffect(() => {
    setReplies(null);
    setEditedReply("");
    setIsEditing(false);
  }, [email?.id]);

  const handleGenerateReply = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await inboxAPI.generateReplies({
        message_id: email.id,
        subject: email.subject || "",
        snippet: email.snippet || email.summary || "",
        sender: email.sender || email.last_message_from || "",
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

  const handleGenerateFollowup = async () => {
    if (!email) return;
    setGeneratingFollowup(true);
    try {
      const res = await inboxAPI.generateReply({
        message_id: email.id,
        message: `Follow-up for: ${email.snippet || email.summary || ""}`,
        tone: "professional",
      });
      
      if (res.data.success) {
        setEditedReply(res.data.data.reply || "");
        setReplies({ professional: res.data.data.reply, friendly: "", concise: "" });
        toast.success("Follow-up generated!");
      }
    } catch (err) {
      toast.error("Failed to generate follow-up");
    } finally {
      setGeneratingFollowup(false);
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
        to: email.sender || email.last_message_from || "",
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
        <p className="text-muted-foreground">Select an email to view details</p>
        <p className="text-xs text-muted-foreground mt-1">Click on any email to generate AI replies</p>
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
            <X className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">To: {email.sender || email.last_message_from}</p>
        
        {/* AI Summary */}
        {email.summary && (
          <div className="mt-3 p-2 rounded-md bg-primary/5 border border-primary/20">
            <p className="text-xs font-medium text-primary mb-0.5">AI Summary</p>
            <p className="text-xs text-muted-foreground">{email.summary}</p>
          </div>
        )}
      </div>

      {/* Original message preview */}
      <div className="p-4 bg-muted/30 border-b border-border">
        <p className="text-xs text-muted-foreground mb-1">Original message:</p>
        <p className="text-sm line-clamp-4">{email.snippet}</p>
      </div>

      {/* Action buttons */}
      <div className="p-4 border-b border-border flex gap-2">
        <Button
          onClick={handleGenerateReply}
          disabled={loading}
          className="flex-1"
          variant={replies ? "outline" : "default"}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Reply
            </>
          )}
        </Button>
        
        {email.needs_followup && (
          <Button
            onClick={handleGenerateFollowup}
            disabled={generatingFollowup}
            variant="outline"
          >
            {generatingFollowup ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Clock className="w-4 h-4 mr-2" />
                Follow-up
              </>
            )}
          </Button>
        )}
      </div>

      {/* Reply editor */}
      <div className="flex-1 overflow-y-auto p-4">
        {replies ? (
          <div className="space-y-4">
            {/* Tone selector */}
            <div className="flex gap-2">
              {[
                { key: "professional", label: "Professional" },
                { key: "friendly", label: "Friendly" },
                { key: "concise", label: "Concise" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleToneSelect(key)}
                  disabled={!replies[key]}
                  className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                    selectedTone === key
                      ? "bg-primary text-white border-primary"
                      : "bg-background border-border hover:border-primary/50"
                  } ${!replies[key] ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Reply textarea */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  AI Generated Reply
                </p>
                {isEditing && (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <Edit3 className="w-3 h-3" />
                    Edited
                  </span>
                )}
              </div>
              
              <Textarea
                value={editedReply}
                onChange={(e) => {
                  setEditedReply(e.target.value);
                  setIsEditing(true);
                }}
                className="min-h-[180px] text-sm"
                placeholder="AI reply will appear here..."
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSendViaGmail}
                disabled={!editedReply.trim()}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Send via Gmail
              </Button>
              
              <Button variant="outline" onClick={handleCopy} disabled={!editedReply.trim()}>
                {copying ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Compliance notice */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs text-blue-700">
                "Send via Gmail" opens Gmail with your reply pre-filled. 
                You review and send from Gmail - maintaining full control.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10">
            <p className="text-sm text-muted-foreground mb-4">
              Click "Generate Reply" to create AI-powered responses
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN AI INBOX
═══════════════════════════════════════════════════════════════ */

export default function AIInbox() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [activeTab, setActiveTab] = useState(searchParams.get("filter") || "all");

  useEffect(() => {
    loadData();
  }, []);

  // Handle URL params for pre-selecting email
  useEffect(() => {
    const selectedId = searchParams.get("selected");
    if (selectedId && emails.length > 0) {
      const email = emails.find(e => e.id === selectedId);
      if (email) setSelectedEmail(email);
    }
    
    const filter = searchParams.get("filter");
    if (filter && ["all", "priority", "opportunities", "followups"].includes(filter)) {
      setActiveTab(filter);
    }
  }, [searchParams, emails]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await inboxAPI.getMessages(200);
      setEmails(res.data.data || []);
    } catch (err) {
      toast.error("Failed to load inbox");
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

  // Default filter: priority_score > 50 OR opportunity_type != None OR needs_followup
  const defaultFilteredEmails = useMemo(() => {
    return emails.filter(e => 
      (e.priority_score && e.priority_score > 50) ||
      (e.opportunity_type && e.opportunity_type !== "None") ||
      e.needs_followup
    );
  }, [emails]);

  // Filter emails based on active tab
  const filteredEmails = useMemo(() => {
    switch (activeTab) {
      case "priority":
        return emails.filter(e => e.priority_label === "HOT" || e.priority_label === "WARM");
      case "opportunities":
        return emails.filter(e => 
          e.opportunity_type === "Client" || 
          e.opportunity_type === "Partnership" ||
          e.category === "Lead" ||
          e.category === "Client"
        );
      case "followups":
        return emails.filter(e => e.needs_followup);
      case "all":
      default:
        // Use default filter for "all" tab to show only relevant emails
        return defaultFilteredEmails;
    }
  }, [emails, activeTab, defaultFilteredEmails]);

  // Counts for filter tabs
  const counts = useMemo(() => ({
    all: defaultFilteredEmails.length,
    priority: emails.filter(e => e.priority_label === "HOT" || e.priority_label === "WARM").length,
    opportunities: emails.filter(e => 
      e.opportunity_type === "Client" || 
      e.opportunity_type === "Partnership" ||
      e.category === "Lead" ||
      e.category === "Client"
    ).length,
    followups: emails.filter(e => e.needs_followup).length,
  }), [emails, defaultFilteredEmails]);

  // Stats for Today's Focus
  const focusStats = useMemo(() => ({
    opportunities: counts.opportunities,
    requiresAttention: emails.filter(e => e.priority_label === "HOT" || e.opportunity_type === "Risk").length,
    followups: counts.followups,
  }), [emails, counts]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ filter: tab });
  };

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
              Your intelligent email workspace
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
      </div>

      {/* Main content */}
      <div className="p-6">
        {/* Today's Focus */}
        <TodaysFocus stats={focusStats} />

        {/* Filter tabs */}
        <div className="flex items-center justify-between mb-4">
          <FilterTabs
            activeTab={activeTab}
            onTabChange={handleTabChange}
            counts={counts}
          />
        </div>

        {/* Split view */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Email list */}
          <Card className="overflow-hidden">
            <CardHeader className="py-3 px-4 border-b border-border">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Emails ({filteredEmails.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[650px] overflow-y-auto">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-28 w-full" />
                  ))}
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <Inbox className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No emails found</p>
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    {activeTab !== "all" 
                      ? "Try a different filter" 
                      : "Connect Gmail in Settings to get started"
                    }
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
