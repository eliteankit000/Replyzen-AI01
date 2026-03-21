import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, Bot, Shield, TrendingUp, Clock } from "lucide-react";
import SEOHead from "@/components/SEOHead";

export default function EmailAutomationAI() {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Email Automation AI – Automate Your Gmail Follow-Ups"
        description="ReplyZen AI automates Gmail follow-up emails using artificial intelligence. Detect silent conversations, generate AI drafts, and auto-send — all without lifting a finger."
        keywords="email automation AI, AI email automation, Gmail automation tool, automated email follow-up, email AI assistant, AI email sender"
        canonical="https://replyzenai.com/features/email-automation-ai"
        ogUrl="https://replyzenai.com/features/email-automation-ai"
      />

      <div className="min-h-screen bg-background">
        {/* Nav */}
        <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Mail className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">ReplyZen AI</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </div>
        </nav>

        <main className="pt-24 pb-16 px-6">
          <div className="max-w-3xl mx-auto">

            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              Email Automation AI — Put Your Gmail Follow-Ups on Autopilot
            </h1>
            <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
              ReplyZen AI is an email automation tool powered by artificial intelligence. It monitors your Gmail inbox, identifies conversations that need follow-up, and can automatically send follow-up emails on your behalf — within a send window you control.
            </p>

            {/* What is it */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">What is Email Automation AI?</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Email automation AI refers to systems that use machine learning and natural language processing to handle repetitive email tasks automatically. ReplyZen AI applies this to the most time-consuming task in professional communication: writing and sending follow-up emails.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Instead of manually tracking which clients haven't replied, copying templates, and sending emails one by one, ReplyZen AI does all of this automatically. It reads your email threads, determines which ones need attention, generates a follow-up draft, and — if you enable auto-send — sends it during your specified send window.
              </p>
            </section>

            {/* Key features */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">Key Features of ReplyZen AI Email Automation</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  {
                    icon: Bot,
                    title: "AI-Powered Draft Generation",
                    desc: "GPT-4o generates context-aware follow-up drafts that match the tone and content of your original conversation.",
                  },
                  {
                    icon: Clock,
                    title: "Silence Detection Engine",
                    desc: "Automatically identifies email threads where you're waiting for a reply — configurable from 1 to 10 days.",
                  },
                  {
                    icon: Shield,
                    title: "Auto-Send with Safety Controls",
                    desc: "Set a daily send limit, send window, and priority threshold. ReplyZen AI never sends unless conditions are met.",
                  },
                  {
                    icon: TrendingUp,
                    title: "Priority Scoring",
                    desc: "Not all emails are equal. ReplyZen AI scores each thread by type (proposal, payment, lead) and urgency.",
                  },
                ].map((item) => (
                  <div key={item.title} className="p-5 rounded-xl bg-card border border-border">
                    <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-3">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <p className="font-semibold mb-1">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* How auto-send works */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">How Auto-Send Works</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                ReplyZen AI's auto-send feature is designed with safety first. Before any email is sent automatically, the system checks:
              </p>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {[
                  "The thread is still silent — no new reply has arrived since the draft was generated",
                  "The email is within the priority threshold you've configured (high or medium priority only)",
                  "The current time is within your defined send window (e.g. 9:00 AM – 6:00 PM)",
                  "The daily send limit has not been exceeded",
                  "The recipient is not on your blocked senders list",
                ].map((check) => (
                  <li key={check} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>{check}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                If any check fails, the email is not sent and you're notified to review it manually. This ensures ReplyZen AI never sends a follow-up at the wrong time or to the wrong person.
              </p>
            </section>

            {/* Privacy */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">Privacy and Security</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                ReplyZen AI uses Google OAuth 2.0 for Gmail access. Your email content is never stored on our servers permanently — threads are processed to generate drafts and then discarded. OAuth tokens are encrypted using AES-256 before storage.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                You can revoke Gmail access at any time from your Google Account settings or from within ReplyZen AI's settings page.
              </p>
            </section>

            {/* CTA */}
            <section className="p-8 rounded-2xl bg-card border border-border text-center">
              <h2 className="text-xl font-semibold mb-3">Automate Your Follow-Ups Today</h2>
              <p className="text-muted-foreground mb-6">
                Start with the free plan — 30 follow-ups per month, no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => navigate("/login")} className="bg-primary hover:bg-primary/90 text-white px-8">
                  Get Started Free
                </Button>
                <Button variant="outline" onClick={() => navigate("/")}>
                  See All Features
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Also see: <a href="/features/ai-follow-up-generator" className="text-primary hover:underline">AI Follow-Up Generator</a> · <a href="/problems/client-not-replying" className="text-primary hover:underline">Client Not Replying?</a>
              </p>
            </section>

          </div>
        </main>

        <footer className="py-8 px-6 border-t border-border">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                <Mail className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-semibold">ReplyZen AI</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <a href="/" className="hover:text-foreground transition-colors">Home</a>
              <a href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</a>
              <a href="/terms-of-service" className="hover:text-foreground transition-colors">Terms of Service</a>
            </div>
            <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} ReplyZen AI. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}