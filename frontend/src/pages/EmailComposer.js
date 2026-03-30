import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { composerAPI, inboxAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Mail,
  Send,
  Sparkles,
  Upload,
  FileText,
  Image,
  Copy,
  ExternalLink,
  RefreshCw,
  Save,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  BookTemplate,
  Star,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   EMAIL TYPE & TONE OPTIONS
═══════════════════════════════════════════════════════════════ */

const EMAIL_TYPES = [
  { value: "Outreach", label: "Outreach", description: "First contact with someone new" },
  { value: "Follow-up", label: "Follow-up", description: "Following up on previous communication" },
  { value: "Proposal", label: "Proposal", description: "Business proposal or pitch" },
  { value: "Support", label: "Support", description: "Customer support response" },
  { value: "General", label: "General", description: "General communication" },
];

const TONES = [
  { value: "professional", label: "Professional", emoji: "💼" },
  { value: "friendly", label: "Friendly", emoji: "😊" },
  { value: "formal", label: "Formal", emoji: "📜" },
  { value: "concise", label: "Concise", emoji: "⚡" },
];

/* ═══════════════════════════════════════════════════════════════
   QUALITY SCORE DISPLAY
═══════════════════════════════════════════════════════════════ */

function QualityScore({ score }) {
  if (!score) return null;

  const getColor = (val) => {
    if (val >= 8) return "text-green-600";
    if (val >= 6) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Email Quality Score</span>
      </div>
      
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center">
          <p className={`text-2xl font-bold ${getColor(score.overall)}`}>{score.overall}/10</p>
          <p className="text-[10px] text-muted-foreground uppercase">Overall</p>
        </div>
        <div className="text-center">
          <p className={`text-lg font-semibold ${getColor(score.clarity)}`}>{score.clarity}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Clarity</p>
        </div>
        <div className="text-center">
          <p className={`text-lg font-semibold ${getColor(score.tone)}`}>{score.tone}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Tone</p>
        </div>
        <div className="text-center">
          <p className={`text-lg font-semibold ${getColor(score.professionalism)}`}>{score.professionalism}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Prof.</p>
        </div>
      </div>

      {score.suggestions && score.suggestions.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-1">Suggestions:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {score.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-1">
                <Lightbulb className="w-3 h-3 mt-0.5 text-amber-500 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUBJECT SUGGESTIONS
═══════════════════════════════════════════════════════════════ */

function SubjectSuggestions({ suggestions, onSelect, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Generating subject suggestions...
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Suggestions:</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TEMPLATE SELECTOR DIALOG
═══════════════════════════════════════════════════════════════ */

function TemplateSelector({ open, onClose, onSelect }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await composerAPI.listTemplates();
      setTemplates(res.data.data.templates || []);
    } catch (err) {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookTemplate className="w-5 h-5" />
            Email Templates
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <BookTemplate className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No templates saved yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(template => (
                <div
                  key={template.id}
                  onClick={() => {
                    onSelect(template);
                    onClose();
                  }}
                  className="p-3 rounded-lg border border-border hover:border-primary/50 cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm">{template.name}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {template.email_type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {template.subject}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SAVE TEMPLATE DIALOG
═══════════════════════════════════════════════════════════════ */

function SaveTemplateDialog({ open, onClose, subject, body, emailType, tone }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    setSaving(true);
    try {
      await composerAPI.saveTemplate({
        name: name.trim(),
        subject,
        body,
        email_type: emailType,
        tone,
      });
      toast.success("Template saved!");
      onClose();
      setName("");
    } catch (err) {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label>Template Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Client Follow-up"
              autoFocus
            />
          </div>
          
          <div className="text-xs text-muted-foreground">
            <p><strong>Subject:</strong> {subject || "(No subject)"}</p>
            <p className="mt-1"><strong>Type:</strong> {emailType} · <strong>Tone:</strong> {tone}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FILE UPLOAD SECTION
═══════════════════════════════════════════════════════════════ */

function FileUploadSection({ onFileProcessed }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a PDF or image file");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("email_type", "General");
      formData.append("tone", "professional");

      const res = await composerAPI.generateFromFile(formData);
      
      if (res.data.success) {
        onFileProcessed({
          subject: res.data.data.subject,
          body: res.data.data.body,
          extractedText: res.data.data.extracted_text_preview,
          fileType: res.data.data.file_type,
        });
        toast.success(`Email generated from ${file.name}`);
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || "Failed to process file";
      toast.error(detail);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
        ${dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
        ${uploading ? "opacity-50 pointer-events-none" : ""}
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.gif"
        onChange={(e) => handleFile(e.target.files[0])}
        className="hidden"
      />
      
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Processing file...</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center gap-3 mb-2">
            <FileText className="w-8 h-8 text-muted-foreground" />
            <Image className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            Drop a PDF or image here, or click to upload
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            AI will extract content and generate an email draft
          </p>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN EMAIL COMPOSER PAGE
═══════════════════════════════════════════════════════════════ */

export default function EmailComposer() {
  const navigate = useNavigate();

  // Form state
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [topic, setTopic] = useState("");
  const [emailType, setEmailType] = useState("General");
  const [tone, setTone] = useState("professional");

  // UI state
  const [generating, setGenerating] = useState(false);
  const [subjectSuggestions, setSubjectSuggestions] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [qualityScore, setQualityScore] = useState(null);
  const [checkingQuality, setCheckingQuality] = useState(false);
  const [copying, setCopying] = useState(false);

  // Dialogs
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Generate email from topic
  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Please enter a topic or goal");
      return;
    }

    setGenerating(true);
    setQualityScore(null);
    try {
      const res = await composerAPI.generate({
        recipient: recipient || "Recipient",
        topic: topic.trim(),
        email_type: emailType,
        tone,
      });

      if (res.data.success) {
        setSubject(res.data.data.subject || "");
        setBody(res.data.data.body || "");
        toast.success("Email generated!");
        
        // Auto-check quality
        checkQuality(res.data.data.body);
      }
    } catch (err) {
      toast.error("Failed to generate email");
    } finally {
      setGenerating(false);
    }
  };

  // Generate subject suggestions
  const handleGetSubjectSuggestions = async () => {
    if (!topic.trim()) return;

    setLoadingSubjects(true);
    try {
      const res = await composerAPI.getSubjectSuggestions({
        topic: topic.trim(),
        email_type: emailType,
        tone,
      });
      setSubjectSuggestions(res.data.data.suggestions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSubjects(false);
    }
  };

  // Check email quality
  const checkQuality = async (text) => {
    if (!text.trim()) return;

    setCheckingQuality(true);
    try {
      const res = await composerAPI.checkQuality(text);
      setQualityScore(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingQuality(false);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopying(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopying(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  // Send via Gmail
  const handleSendViaGmail = async () => {
    if (!recipient.trim()) {
      toast.error("Please enter a recipient email");
      return;
    }

    try {
      const res = await inboxAPI.getGmailComposeUrl({
        to: recipient.trim(),
        subject: subject || "",
        body: body || "",
      });
      
      window.open(res.data.data.gmail_url, "_blank");
      toast.success("Opening Gmail...");
    } catch (err) {
      toast.error("Failed to open Gmail");
    }
  };

  // Handle file processed
  const handleFileProcessed = ({ subject: s, body: b }) => {
    setSubject(s || "");
    setBody(b || "");
    if (b) checkQuality(b);
  };

  // Handle template selected
  const handleTemplateSelect = (template) => {
    setSubject(template.subject || "");
    setBody(template.body || "");
    setEmailType(template.email_type || "General");
    setTone(template.tone || "professional");
    if (template.body) checkQuality(template.body);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/inbox")}
              className="h-8"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                Email Composer
              </h1>
              <p className="text-xs text-muted-foreground">
                AI-powered email drafting with quality analysis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplates(true)}
            >
              <BookTemplate className="w-4 h-4 mr-2" />
              Templates
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Input form */}
          <div className="space-y-6">
            {/* Generate from topic */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Generate Email
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Recipient */}
                <div className="space-y-2">
                  <Label>Recipient Email</Label>
                  <Input
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="recipient@example.com"
                    type="email"
                  />
                </div>

                {/* Topic / Goal */}
                <div className="space-y-2">
                  <Label>Topic / Goal</Label>
                  <Textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="What do you want to communicate? e.g., 'Follow up on project proposal, ask about timeline'"
                    className="min-h-[80px]"
                  />
                </div>

                {/* Email type & Tone */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email Type</Label>
                    <Select value={emailType} onValueChange={setEmailType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMAIL_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TONES.map(t => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.emoji} {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Generate button */}
                <Button
                  onClick={handleGenerate}
                  disabled={generating || !topic.trim()}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Email
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Upload file */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Generate from File
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FileUploadSection onFileProcessed={handleFileProcessed} />
              </CardContent>
            </Card>
          </div>

          {/* Right: Output / Editor */}
          <div className="space-y-6">
            {/* Subject */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Subject</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleGetSubjectSuggestions}
                      disabled={loadingSubjects || !topic.trim()}
                      className="h-6 text-xs"
                    >
                      <Lightbulb className="w-3 h-3 mr-1" />
                      Suggest
                    </Button>
                  </div>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject line"
                  />
                  <SubjectSuggestions
                    suggestions={subjectSuggestions}
                    onSelect={setSubject}
                    loading={loadingSubjects}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Email Body</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => checkQuality(body)}
                      disabled={checkingQuality || !body.trim()}
                      className="h-6 text-xs"
                    >
                      <Star className="w-3 h-3 mr-1" />
                      Check Quality
                    </Button>
                  </div>
                  <Textarea
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      setQualityScore(null);
                    }}
                    placeholder="Your email content..."
                    className="min-h-[250px]"
                  />
                </div>

                {/* Quality score */}
                {checkingQuality && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing quality...
                  </div>
                )}
                <QualityScore score={qualityScore} />

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    onClick={handleSendViaGmail}
                    disabled={!body.trim()}
                    className="flex-1 bg-primary hover:bg-primary/90"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Send via Gmail
                  </Button>
                  
                  <Button variant="outline" onClick={handleCopy} disabled={!body.trim()}>
                    {copying ? (
                      <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 mr-2" />
                    )}
                    {copying ? "Copied!" : "Copy"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setShowSaveTemplate(true)}
                    disabled={!body.trim()}
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                </div>

                {/* Compliance notice */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs text-blue-700">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    "Send via Gmail" opens Gmail with your email pre-filled. 
                    You control the final send from Gmail.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <TemplateSelector
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelect={handleTemplateSelect}
      />
      
      <SaveTemplateDialog
        open={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        subject={subject}
        body={body}
        emailType={emailType}
        tone={tone}
      />
    </div>
  );
}
