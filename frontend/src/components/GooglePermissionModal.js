import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Shield, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * GooglePermissionModal
 * =====================
 * Shows Google OAuth permission details before login.
 * CRITICAL for Google OAuth verification compliance.
 * 
 * Features:
 *   - Clear explanation of permissions requested
 *   - Why each permission is needed
 *   - User consent checkbox
 *   - Transparent data usage policy
 */

export default function GooglePermissionModal({ open, onConfirm, onCancel }) {
  const [consentChecked, setConsentChecked] = useState(false);

  // Reset checkbox when modal opens
  useEffect(() => {
    if (open) {
      setConsentChecked(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onCancel()}>
      <DialogContent className="max-w-xl" data-testid="google-permission-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="w-6 h-6 text-primary" />
            Connect Your Google Account
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Permission Overview */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium text-foreground mb-3">
              Replyzen AI will request the following permissions:
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

          {/* Safety Guarantees */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Your control & safety:
            </p>
            <ul className="space-y-2 pl-6">
              {[
                "We ONLY read messages to suggest replies — we never modify or delete them",
                "We ONLY send emails after your explicit approval",
                "You can review and edit every AI-generated reply before sending",
                "You can disconnect your account at any time",
                "We never share your data with third parties",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Data Usage */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900/40 p-3 flex gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-400">
              <strong>How we use your data:</strong> We analyze message content to generate relevant replies. 
              Messages are processed securely and never stored permanently. You remain in full control of all sending actions.
            </p>
          </div>

          {/* Consent Checkbox */}
          <div className="flex items-start gap-2.5 pt-2">
            <Checkbox
              checked={consentChecked}
              onCheckedChange={(val) => setConsentChecked(Boolean(val))}
              id="google-consent-check"
              className="mt-0.5 cursor-pointer"
            />
            <Label
              htmlFor="google-consent-check"
              className="text-sm cursor-pointer leading-snug select-none"
            >
              I understand what permissions Replyzen AI is requesting and how my data will be used. 
              I consent to connecting my Google account.
            </Label>
          </div>

          {/* Privacy Links */}
          <p className="text-xs text-muted-foreground text-center">
            By continuing, you agree to our{" "}
            <a href="/terms-of-service" target="_blank" className="text-primary hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy-policy" target="_blank" className="text-primary hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onCancel} 
            data-testid="google-permission-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!consentChecked}
            className="bg-primary hover:bg-primary/90 text-white"
            data-testid="google-permission-confirm"
          >
            <Shield className="w-4 h-4 mr-2" />
            Continue with Google
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
