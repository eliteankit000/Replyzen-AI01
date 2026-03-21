import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, TrendingUp, Clock, Zap } from "lucide-react";
import SEOHead from "@/components/SEOHead";

export default function MissedFollowUpEmails() {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Missed Follow-Up Emails Costing You Deals? Fix It with AI"
        description="Missed follow-up emails are one of the top reasons deals are lost. ReplyZen AI automatically tracks every conversation that needs a follow-up and generates AI drafts so nothing slips through."
        keywords="missed follow-up emails, email follow-up automation, never miss a follow-up, follow-up email tracking, email follow-up reminder, lost deals from email"
        canonical="https://replyzenai.com/problems/missed-follow-up-emails"
        ogUrl="https://replyzenai.com/problems/missed-follow-up-emails"
      />

      <div className="min-h-screen bg-background">
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
              Missed Follow-Up Emails Are Costing You Deals — Here's How to Fix It
            </h1>
            <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
              Research consistently shows that 80% of sales require five or more follow-ups, yet 44% of salespeople give up after just one. Missed follow-up emails aren't a minor inconvenience — they're a direct revenue problem. ReplyZen AI is built to eliminate this entirely.
            </p>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">The Real Cost of Missed Follow-Ups</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Every missed follow-up email is a potential lost deal, delayed project, or unpaid invoice. Professionals managing dozens of email threads simultaneously can't realistically track every conversation manually. Important follow-ups fall through the cracks not because of negligence, but because there's no system to catch them.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                For freelancers, consultants, and sales teams, the compounding effect is significant: a single missed follow-up on a proposal could mean losing a project worth thousands. Multiply that across dozens of missed follow-ups per month and the revenue impact becomes impossible to ignore.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">Why Traditional Solutions Don't Work</h2>
              <div className="space-y-4">
                {[
                  { icon: Clock, title: "Manual reminders and to-do lists", desc: "Setting reminders for every email thread is unsustainable at scale. It requires constant manual maintenance and still relies on you to write the actual follow-up." },
                  { icon: TrendingUp, title: "CRM follow-up tracking", desc: "CRMs are powerful but overkill for email-level follow-up tracking. They require manual data entry and don't integrate directly with your Gmail inbox." },
                  { icon: Zap, title: "Generic email scheduling tools", desc: "Scheduling tools let you plan ahead, but they don't detect when conversations go silent or generate contextual follow-up content automatically." },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4 p-4 rounded-xl bg-card border border-border">
                    <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium mb-1">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">How ReplyZen AI Eliminates Missed Follow-Ups</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                ReplyZen AI connects directly to your Gmail inbox and continuously monitors every conversation. When you send an email and don't receive a reply within your configured threshold — 3 days by default — ReplyZen AI automatically surfaces that thread as a follow-up opportunity.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                It doesn't surface noise. Automated emails, newsletters, notification emails, and system alerts are filtered out automatically. Only real, human conversations that genuinely need your attention appear in your follow-up queue.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                For each thread, ReplyZen AI generates an AI follow-up draft using the actual context of the conversation — making it easy to review, approve, and send in seconds. With auto-send enabled, it can handle this entire process automatically within your defined send window.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">Who This Helps Most</h2>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {[
                  "Freelancers chasing proposals, feedback, and payments across multiple clients",
                  "Sales professionals managing large pipelines where every follow-up counts",
                  "Consultants waiting on sign-offs and approvals to unblock project delivery",
                  "Recruiters following up with candidates after interviews and offers",
                  "Agency owners keeping client communications on track across multiple accounts",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="p-8 rounded-2xl bg-card border border-border text-center">
              <h2 className="text-xl font-semibold mb-3">Stop Letting Follow-Ups Slip Through</h2>
              <p className="text-muted-foreground mb-6">
                Connect your Gmail and ReplyZen AI will track every conversation that needs a follow-up — automatically. Free plan includes 30 follow-ups per month.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => navigate("/login")} className="bg-primary hover:bg-primary/90 text-white px-8">
                  Get Started Free
                </Button>
                <Button variant="outline" onClick={() => navigate("/")}>
                  Learn More
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