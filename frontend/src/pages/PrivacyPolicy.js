import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, Shield, Lock, Database, Globe, UserCheck, Mail as MailIcon } from "lucide-react";

export default function PrivacyPolicy() {
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
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: {lastUpdated}</p>

          {/* Introduction */}
          <section className="mb-10">
            <p className="text-muted-foreground leading-relaxed">
              At Replyzen AI, we take your privacy seriously. This Privacy Policy explains how we collect, 
              use, disclose, and safeguard your information when you use our AI-powered email follow-up 
              service. Please read this policy carefully to understand our practices regarding your data.
            </p>
          </section>

          {/* Data Collection */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Data We Collect</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p><strong className="text-foreground">Account Information:</strong> When you create an account, we collect your name, email address, and authentication credentials through Google OAuth.</p>
              <p><strong className="text-foreground">Email Data:</strong> With your explicit permission, we access your Gmail account to:</p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>Read email thread metadata (subject lines, sender/recipient information, timestamps)</li>
                <li>Identify silent conversations that may need follow-up</li>
                <li>Generate AI-powered follow-up drafts based on conversation context</li>
                <li>Send emails on your behalf when you approve a follow-up</li>
              </ul>
              <p><strong className="text-foreground">Usage Data:</strong> We collect information about how you interact with our service, including features used, follow-ups generated, and response rates.</p>
              <p><strong className="text-foreground">Payment Information:</strong> Payment processing is handled by our third-party providers (Razorpay for India, Paddle for international users). We do not store your credit card details.</p>
            </div>
          </section>

          {/* Gmail Access */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <MailIcon className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Gmail API Access</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>Replyzen AI uses Google OAuth 2.0 for secure authentication and Gmail API access. We request the following permissions:</p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li><strong className="text-foreground">Read emails:</strong> To identify conversations needing follow-up</li>
                <li><strong className="text-foreground">Send emails:</strong> To send follow-ups you approve</li>
                <li><strong className="text-foreground">Modify emails:</strong> To mark conversations as handled</li>
              </ul>
              <p className="bg-accent/50 p-4 rounded-lg border border-border">
                <strong className="text-foreground">Important:</strong> We never share your email content with third parties. 
                Your emails are only processed to generate follow-up suggestions and are not used for advertising or any other purpose.
              </p>
            </div>
          </section>

          {/* Data Storage */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Data Storage & Security</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p><strong className="text-foreground">Where We Store Your Data:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>User account data is stored in Supabase (PostgreSQL) with encryption at rest</li>
                <li>OAuth tokens are encrypted using AES-256 encryption before storage</li>
                <li>Email metadata is cached temporarily for performance and deleted after processing</li>
              </ul>
              <p><strong className="text-foreground">Security Measures:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li>All data transfers use TLS 1.3 encryption</li>
                <li>OAuth tokens are encrypted and never stored in plain text</li>
                <li>Regular security audits and penetration testing</li>
                <li>Access controls and authentication for all internal systems</li>
              </ul>
            </div>
          </section>

          {/* Third-Party Services */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Third-Party Services</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>We use the following third-party services to provide our platform:</p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li><strong className="text-foreground">Google (Gmail API):</strong> Email access and authentication</li>
                <li><strong className="text-foreground">OpenAI:</strong> AI-powered follow-up generation</li>
                <li><strong className="text-foreground">Supabase:</strong> Database and authentication infrastructure</li>
                <li><strong className="text-foreground">Paddle/Razorpay:</strong> Payment processing</li>
                <li><strong className="text-foreground">Vercel:</strong> Frontend hosting</li>
                <li><strong className="text-foreground">Railway:</strong> Backend hosting</li>
              </ul>
              <p>Each service has its own privacy policy. We encourage you to review them.</p>
            </div>
          </section>

          {/* User Rights */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Your Rights</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>You have the following rights regarding your data:</p>
              <ul className="list-disc list-inside ml-4 space-y-2">
                <li><strong className="text-foreground">Access:</strong> Request a copy of your personal data</li>
                <li><strong className="text-foreground">Correction:</strong> Update or correct inaccurate information</li>
                <li><strong className="text-foreground">Deletion:</strong> Request deletion of your account and associated data</li>
                <li><strong className="text-foreground">Revocation:</strong> Revoke Gmail access at any time through Google Account settings</li>
                <li><strong className="text-foreground">Export:</strong> Request an export of your data in a portable format</li>
              </ul>
              <p>To exercise any of these rights, please contact us at privacy@replyzen.ai</p>
            </div>
          </section>

          {/* Contact */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Contact Us</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>If you have any questions or concerns about this Privacy Policy, please contact us:</p>
              <div className="bg-accent/50 p-4 rounded-lg border border-border">
                <p><strong className="text-foreground">Email:</strong> privacy@replyzen.ai</p>
                <p><strong className="text-foreground">Support:</strong> support@replyzen.ai</p>
              </div>
            </div>
          </section>

          {/* Changes */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-4">Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by 
              posting the new Privacy Policy on this page and updating the "Last updated" date. 
              You are advised to review this Privacy Policy periodically for any changes.
            </p>
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
