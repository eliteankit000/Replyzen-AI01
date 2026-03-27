import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, FileText, Scale, Ban, CreditCard, RefreshCw, AlertTriangle } from "lucide-react";

export default function TermsOfService() {
  const navigate = useNavigate();
  const lastUpdated = "March 15, 2025";

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Replyzen AI</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </div>
      </nav>

      {/* Content */}
      <main className="pt-24 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: {lastUpdated}</p>

          {/* Introduction */}
          <section className="mb-10">
            <p className="text-muted-foreground leading-relaxed">
              Welcome to Replyzen AI. By accessing or using our service, you agree to be bound by these 
              Terms of Service. Please read them carefully before using our platform.
            </p>
          </section>

          {/* Service Description */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Service Description</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Replyzen AI is an AI-powered email follow-up automation service that:</p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>Connects to your Gmail account to detect silent email conversations</li>
                <li>Uses artificial intelligence to generate follow-up draft suggestions</li>
                <li>Enables you to review, edit, and send follow-up emails</li>
                <li>Provides analytics on your follow-up performance</li>
              </ul>
              <p>
                The service requires access to your Gmail account through Google OAuth. 
                You maintain full control over which emails are sent and can revoke access at any time.
              </p>
            </div>
          </section>

          {/* Acceptable Use */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <Scale className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Acceptable Use Policy</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>You agree to use Replyzen AI only for lawful purposes. You must NOT:</p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>Send spam, unsolicited emails, or bulk marketing messages</li>
                <li>Use the service for phishing, fraud, or any deceptive practices</li>
                <li>Violate any applicable laws, regulations, or third-party rights</li>
                <li>Attempt to bypass rate limits or abuse the service</li>
                <li>Reverse engineer, decompile, or disassemble the service</li>
                <li>Share your account credentials with others</li>
                <li>Use automated scripts to access the service (except through our official API)</li>
              </ul>
              <p className="bg-destructive/10 p-4 rounded-lg border border-destructive/20">
                <strong className="text-foreground">Warning:</strong> Violation of these terms may result in 
                immediate account termination without refund.
              </p>
            </div>
          </section>

          {/* Prohibited Activities */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <Ban className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Prohibited Activities</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>The following activities are strictly prohibited:</p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>Sending emails that violate CAN-SPAM, GDPR, or other email regulations</li>
                <li>Harassment, threats, or abusive communications</li>
                <li>Distribution of malware, viruses, or harmful content</li>
                <li>Impersonation of individuals or organizations</li>
                <li>Collection of personal data without consent</li>
                <li>Any activity that disrupts or interferes with the service</li>
              </ul>
            </div>
          </section>

          {/* Subscription and Billing */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Subscription & Billing</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p><strong className="text-foreground">Free Plan:</strong> Available with limited features at no cost. No credit card required.</p>
              <p><strong className="text-foreground">Paid Plans:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>Pro and Business plans are billed monthly or annually</li>
                <li>Prices are displayed in your local currency (USD or INR)</li>
                <li>Payment is processed by Paddle (international) or Razorpay (India)</li>
                <li>Subscriptions auto-renew unless cancelled before the renewal date</li>
              </ul>
              <p><strong className="text-foreground">Price Changes:</strong> We reserve the right to modify prices with 30 days notice. Existing subscriptions will be honored until renewal.</p>
            </div>
          </section>

          {/* Cancellation and Refunds */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Cancellation & Refunds</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p><strong className="text-foreground">Cancellation:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>You may cancel your subscription at any time from your Billing settings</li>
                <li>Access continues until the end of your current billing period</li>
                <li>No partial refunds for unused time within a billing period</li>
              </ul>
              <p><strong className="text-foreground">Refund Policy:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>Annual subscriptions: Pro-rated refund available within 14 days of purchase</li>
                <li>Monthly subscriptions: No refunds (cancel before renewal to avoid charges)</li>
                <li>Refund requests should be sent to hello@replyzenai.com</li>
              </ul>
              <p><strong className="text-foreground">Account Termination:</strong> We may terminate accounts that violate these terms. In cases of serious violations, refunds will not be provided.</p>
            </div>
          </section>

          {/* Liability Limitations */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Liability Limitations</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p><strong className="text-foreground">Service Availability:</strong> We strive for 99.9% uptime but do not guarantee uninterrupted service. Scheduled maintenance will be announced in advance.</p>
              <p><strong className="text-foreground">AI-Generated Content:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>AI-generated follow-up drafts are suggestions only</li>
                <li>You are responsible for reviewing and approving all emails before sending</li>
                <li>We are not liable for any consequences of emails you choose to send</li>
              </ul>
              <p><strong className="text-foreground">Limitation of Liability:</strong></p>
              <div className="bg-accent/50 p-4 rounded-lg border border-border">
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, REPLYZEN AI SHALL NOT BE LIABLE FOR ANY INDIRECT, 
                  INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, 
                  WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER 
                  INTANGIBLE LOSSES.
                </p>
              </div>
              <p>Our total liability shall not exceed the amount paid by you for the service in the 12 months preceding the claim.</p>
            </div>
          </section>

          {/* Intellectual Property */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-4">Intellectual Property</h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                All content, features, and functionality of Replyzen AI are owned by us and protected by 
                international copyright, trademark, and other intellectual property laws.
              </p>
              <p>
                You retain ownership of your email content. We do not claim any rights to your emails or 
                the content of follow-ups you send.
              </p>
            </div>
          </section>

          {/* Changes to Terms */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-4">Changes to These Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms of Service at any time. We will provide notice 
              of material changes by posting the updated terms on our website and updating the "Last updated" 
              date. Your continued use of the service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          {/* Contact */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
            <div className="bg-accent/50 p-4 rounded-lg border border-border text-muted-foreground">
              <p><strong className="text-foreground">General Inquiries:</strong> hello@replyzenai.com</p>
              <p><strong className="text-foreground">Billing Questions:</strong> hello@replyzenai.com</p>
              <p><strong className="text-foreground">Legal:</strong> hello@replyzenai.com</p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Mail className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold">Replyzen AI</span>
          </div>
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Replyzen AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
