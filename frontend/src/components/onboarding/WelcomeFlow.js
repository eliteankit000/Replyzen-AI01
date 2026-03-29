import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  Shield, CheckCircle2, AlertCircle, Sparkles, ArrowRight, ArrowLeft,
  Mail, Send, User, Lock, Database, Zap, X, Loader2
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

const API_URL = process.env.REACT_APP_BACKEND_URL ||
  (process.env.REACT_APP_REPLIT_DEV_DOMAIN
    ? `https://${process.env.REACT_APP_REPLIT_DEV_DOMAIN}:8000`
    : "https://replyzen-ai01-production.up.railway.app");

/**
 * WelcomeFlow - Multi-step onboarding popup
 * ===========================================
 * Shown ONLY to new users after successful Google login
 * 
 * Steps:
 * 1. Welcome
 * 2. What We Do
 * 3. Permissions Explained
 * 4. Control & Safety
 * 5. Data Usage
 * 6. Consent
 * 7. Complete
 */

const STEPS = [
  {
    id: 1,
    title: "Welcome to Replyzen AI! 🎉",
    subtitle: "Your AI-powered email reply assistant",
    icon: Sparkles,
    content: (
      <div className="text-center space-y-4 py-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>
        <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
          We'll help you manage your email conversations with AI-powered smart replies. 
          Let's take a quick tour to show you how it works.
        </p>
      </div>
    ),
  },
  {
    id: 2,
    title: "What We Do",
    subtitle: "Intelligent email assistance",
    icon: Zap,
    content: (
      <div className="space-y-4 py-4">
        {[
          {
            icon: Mail,
            title: "Analyze Messages",
            desc: "We read your Gmail messages to understand which ones need replies",
          },
          {
            icon: Sparkles,
            title: "Generate Smart Replies",
            desc: "AI creates contextual, professional reply suggestions",
          },
          {
            icon: CheckCircle2,
            title: "You Stay in Control",
            desc: "Review, edit, and approve every reply before it's sent",
          },
        ].map((item, i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <item.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 3,
    title: "Permissions We Request",
    subtitle: "Transparency first",
    icon: Shield,
    content: (
      <div className="space-y-3 py-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-medium text-foreground mb-3">
            Replyzen AI will request these Google permissions:
          </p>
          <div className="space-y-3">
            {[
              {
                permission: "Read your Gmail messages",
                reason: "To analyze messages that need replies and detect follow-ups",
                icon: "📧",
              },
              {
                permission: "Send emails on your behalf",
                reason: "To send AI-generated replies ONLY after your approval",
                icon: "✉️",
              },
              {
                permission: "Access your basic profile",
                reason: "To create your account and personalize your experience",
                icon: "👤",
              },
            ].map((item, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="text-xl shrink-0">{item.icon}</span>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{item.permission}</p>
                  <p className="text-xs text-muted-foreground">{item.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 4,
    title: "Your Control & Safety",
    subtitle: "You're always in the driver's seat",
    icon: Lock,
    content: (
      <div className="space-y-3 py-4">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          Safety guarantees:
        </p>
        <ul className="space-y-2 pl-6">
          {[
            "We ONLY read messages to suggest replies — we never modify or delete them",
            "We ONLY send emails after your explicit approval",
            "You can review and edit every AI-generated reply before sending",
            "You can disconnect your account at any time from Settings",
            "We never share your data with third parties",
            "All data is encrypted and stored securely",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    id: 5,
    title: "How We Use Your Data",
    subtitle: "Privacy matters",
    icon: Database,
    content: (
      <div className="space-y-3 py-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900/40 p-4">
          <div className="flex gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
                Your data, your control
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                We analyze message content to generate relevant replies. Messages are processed 
                securely and are not stored permanently. We use industry-standard encryption and 
                comply with data protection regulations.
              </p>
            </div>
          </div>
        </div>
        
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-foreground">What we DON'T do:</p>
          <ul className="space-y-1 pl-6">
            {[
              "Sell your data to advertisers",
              "Share your emails with third parties",
              "Send messages without your approval",
              "Store your emails permanently",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <X className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: 6,
    title: "Your Consent",
    subtitle: "Please confirm you understand",
    icon: CheckCircle2,
    requiresConsent: true,
    content: null, // Will be handled specially
  },
  {
    id: 7,
    title: "Connect Your Gmail",
    subtitle: "Final step - enable smart replies",
    icon: Mail,
    requiresGmailConnection: true,
    content: null, // Will be handled specially
  },
];

export default function WelcomeFlow({ open, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setConsentChecked(false);
      setCompleting(false);
    }
  }, [open]);

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;
  const isConsentStep = step?.requiresConsent;
  const isGmailConnectionStep = step?.requiresGmailConnection;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    if (!consentChecked && isConsentStep) {
      toast.error("Please confirm that you understand and consent");
      return;
    }

    setCompleting(true);

    try {
      // Mark user as onboarded
      await axios.post(
        `${API_URL}/api/auth/complete-onboarding`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("replyzen_token")}`,
          },
        }
      );

      toast.success("Welcome aboard! 🎉");
      
      // If not on Gmail connection step, complete onboarding
      if (!isGmailConnectionStep) {
        onComplete();
      } else {
        // Move to Gmail connection step
        handleNext();
      }
    } catch (error) {
      console.error("Onboarding completion error:", error);
      toast.error("Failed to complete onboarding. Please try again.");
    } finally {
      setCompleting(false);
    }
  };

  const handleConnectGmail = () => {
    // Redirect to Gmail connection OAuth flow
    window.location.href = `${API_URL}/api/auth/google/connect-gmail`;
  };

  const handleSkipGmail = () => {
    toast.info("You can connect Gmail later from Settings");
    onComplete();
  };

  if (!step) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-xl"
        hideClose={true}
        data-testid="welcome-onboarding-modal"
      >
        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? "w-8 bg-primary"
                  : i < currentStep
                  ? "w-1.5 bg-primary/50"
                  : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step Counter */}
        <div className="text-center mb-2">
          <span className="text-xs text-muted-foreground">
            Step {currentStep + 1} of {STEPS.length}
          </span>
        </div>

        {/* Step Icon & Title */}
        <div className="text-center space-y-2 mb-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <step.icon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{step.title}</h2>
            <p className="text-sm text-muted-foreground">{step.subtitle}</p>
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[250px] max-h-[400px] overflow-y-auto px-2">
          {isGmailConnectionStep ? (
            <div className="space-y-6 py-6 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Connect Your Gmail</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  To enable smart reply features, we need access to your Gmail account. 
                  Click the button below to securely connect your Gmail.
                </p>
              </div>
              
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900/40 p-4">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-left">
                    <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                      <strong>Why do we need this?</strong><br />
                      Gmail access allows us to read your messages, detect which ones need replies, 
                      and send AI-generated responses on your behalf (only after your approval).
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  You can skip this step and connect later from Settings
                </p>
              </div>
            </div>
          ) : isConsentStep ? (
            <div className="space-y-6 py-6">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-foreground leading-relaxed mb-4">
                  By proceeding, you acknowledge that:
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    You understand what permissions Replyzen AI is requesting
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    You consent to Replyzen accessing your Gmail to analyze and suggest replies
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    Replyzen will only send emails after your explicit approval
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    You've read our Privacy Policy and Terms of Service
                  </li>
                </ul>
              </div>

              <div className="flex items-start gap-2.5">
                <Checkbox
                  checked={consentChecked}
                  onCheckedChange={(val) => setConsentChecked(Boolean(val))}
                  id="onboarding-consent"
                  className="mt-0.5 cursor-pointer"
                />
                <Label
                  htmlFor="onboarding-consent"
                  className="text-sm cursor-pointer leading-snug select-none"
                >
                  I understand and consent to connecting my Google account with Replyzen AI. 
                  I agree to the{" "}
                  <a href="/terms-of-service" target="_blank" className="text-primary hover:underline">
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a href="/privacy-policy" target="_blank" className="text-primary hover:underline">
                    Privacy Policy
                  </a>.
                </Label>
              </div>
            </div>
          ) : (
            step.content
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={isGmailConnectionStep ? handleSkipGmail : handleBack}
            disabled={currentStep === 0 || completing}
          >
            {isGmailConnectionStep ? (
              <>Skip for Now</>
            ) : (
              <>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </>
            )}
          </Button>

          {isGmailConnectionStep ? (
            <Button
              onClick={handleConnectGmail}
              className="bg-primary hover:bg-primary/90"
            >
              <Mail className="w-4 h-4 mr-2" />
              Connect Gmail
            </Button>
          ) : isLastStep ? (
            <Button
              onClick={handleComplete}
              disabled={!consentChecked || completing}
              className="bg-primary hover:bg-primary/90"
            >
              {completing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleNext} className="bg-primary hover:bg-primary/90">
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
