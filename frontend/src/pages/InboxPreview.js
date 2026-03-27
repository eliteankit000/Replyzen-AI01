import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Inbox,
  Send,
  Edit3,
  X,
  CheckCircle2,
  Loader2,
  Shield,
  Clock,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { inboxAPI } from "@/lib/api";

/**
 * InboxPreview Page
 * ==================
 * Google-reviewer-friendly inbox preview system.
 * 
 * Features:
 *   - Read-only message list
 *   - AI reply suggestions
 *   - Manual approval required for all sends
 *   - Clear safety messaging
 *   - Audit logging
 * 
 * Layout:
 *   LEFT:  Message list
 *   RIGHT: Selected message + AI reply panel
 */

export default function InboxPreview() {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [aiReply, setAiReply] = useState("");
  const [editedReply, setEditedReply] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [tone, setTone] = useState("professional");
  const [stats, setStats] = useState(null);
  
  const [generatingReply, setGeneratingReply] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // Load inbox messages on mount
  useEffect(() => {
    loadMessages();
    loadStats();
  }, []);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await inboxAPI.getMessages();
      setMessages(response.data.data || []);
    } catch (error) {
      console.error("Failed to load messages:", error);
      toast.error("Failed to load inbox messages");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await inboxAPI.getStats();
      setStats(response.data.data);
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  const handleSelectMessage = async (message) => {
    setSelectedMessage(message);
    setAiReply("");
    setEditedReply("");
    setIsEditing(false);

    // Auto-generate reply suggestion
    if (message.status === "pending") {
      await generateReply(message);
    }
  };

  const generateReply = async (message) => {
    try {
      setGeneratingReply(true);
      const response = await inboxAPI.generateReply({
        message_id: message.id,
        message: message.snippet || message.subject,
        platform: "gmail",
        tone: tone,
      });
      
      const reply = response.data.data.reply;
      setAiReply(reply);
      setEditedReply(reply);
      toast.success("AI reply generated! Review before sending.");
    } catch (error) {
      console.error("Failed to generate reply:", error);
      toast.error("Failed to generate reply suggestion");
    } finally {
      setGeneratingReply(false);
    }
  };

  const handleEditReply = () => {
    setIsEditing(true);
  };

  const handleDiscardReply = () => {
    setAiReply("");
    setEditedReply("");
    setIsEditing(false);
    toast.info("Reply discarded");
  };

  const handleSendReply = async () => {
    if (!editedReply.trim()) {
      toast.error("Reply cannot be empty");
      return;
    }

    try {
      setSendingReply(true);
      await inboxAPI.sendReply({
        message_id: selectedMessage.id,
        reply: editedReply,
        approved: true,
        edited: editedReply !== aiReply,
      });

      toast.success("Reply sent successfully! ✅");
      
      // Update message status
      setMessages(prev =>
        prev.map(msg =>
          msg.id === selectedMessage.id
            ? { ...msg, status: "replied" }
            : msg
        )
      );
      
      // Clear selection
      setSelectedMessage(null);
      setAiReply("");
      setEditedReply("");
      setIsEditing(false);
      
      // Reload stats
      loadStats();
    } catch (error) {
      console.error("Failed to send reply:", error);
      toast.error("Failed to send reply. Please try again.");
    } finally {
      setSendingReply(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: <Badge variant="outline" className="text-amber-600 border-amber-300">Needs Reply</Badge>,
      replied: <Badge variant="outline" className="text-emerald-600 border-emerald-300">Replied</Badge>,
      dismissed: <Badge variant="outline" className="text-muted-foreground border-muted">Dismissed</Badge>,
      generated: <Badge variant="outline" className="text-blue-600 border-blue-300">Draft Ready</Badge>,
    };
    return badges[status] || null;
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Inbox className="w-8 h-8 text-primary" />
              Inbox Preview
            </h1>
            <p className="text-muted-foreground mt-1">
              Review messages and approve AI-generated replies before sending
            </p>
          </div>
          
          {stats && (
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{stats.pending_replies}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">{stats.sent_today}</div>
                <div className="text-xs text-muted-foreground">Sent Today</div>
              </div>
            </div>
          )}
        </div>

        {/* Safety Banner */}
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              <CheckCircle2 className="w-4 h-4 inline text-emerald-500 mr-1" />
              Manual Approval Mode Active
            </p>
            <p className="text-xs text-muted-foreground">
              Replyzen only suggests replies. Messages are sent <strong>ONLY after your approval</strong>. 
              You have full control over every message.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT SIDE - Message List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="w-5 h-5" />
              Inbox Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12">
                <Inbox className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No messages found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect your Gmail account in Settings to see messages
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    onClick={() => handleSelectMessage(message)}
                    className={`
                      p-4 rounded-lg border cursor-pointer transition-all
                      ${selectedMessage?.id === message.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }
                    `}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-sm truncate flex-1">
                        {message.subject || "(No Subject)"}
                      </p>
                      {getStatusBadge(message.status)}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-2">
                      From: {message.sender}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {message.snippet}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(message.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT SIDE - AI Reply Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Reply Assistant
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedMessage ? (
              <div className="text-center py-12">
                <AlertCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Select a message to view AI reply suggestion</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Message Content */}
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground mb-2">Original Message:</p>
                  <p className="text-sm font-medium mb-1">{selectedMessage.subject}</p>
                  <p className="text-sm text-foreground">{selectedMessage.snippet}</p>
                </div>

                {/* Tone Selector */}
                <div className="space-y-2">
                  <Label htmlFor="tone">Reply Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger id="tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* AI Reply */}
                {generatingReply ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="ml-3 text-muted-foreground">Generating AI reply...</span>
                  </div>
                ) : aiReply ? (
                  <div className="space-y-3">
                    <Label>AI Generated Reply</Label>
                    <Textarea
                      value={editedReply}
                      onChange={(e) => {
                        setEditedReply(e.target.value);
                        setIsEditing(true);
                      }}
                      className="min-h-[200px]"
                      placeholder="AI reply will appear here..."
                    />
                    
                    {isEditing && editedReply !== aiReply && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <Edit3 className="w-3 h-3" />
                        You've edited this reply
                      </p>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        onClick={handleSendReply}
                        disabled={sendingReply || !editedReply.trim()}
                        className="flex-1 bg-primary hover:bg-primary/90"
                      >
                        {sendingReply ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Approve & Send
                          </>
                        )}
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={handleEditReply}
                        disabled={sendingReply}
                      >
                        <Edit3 className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={handleDiscardReply}
                        disabled={sendingReply}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Discard
                      </Button>
                    </div>

                    {/* Safety Notice */}
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900/40 p-3 flex gap-2">
                      <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700 dark:text-blue-400">
                        This reply will be sent from your Gmail account only after you click "Approve & Send". 
                        You can edit it before sending.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Button onClick={() => generateReply(selectedMessage)}>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate AI Reply
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
