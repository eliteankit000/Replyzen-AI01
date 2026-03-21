import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, Zap, Clock, Send, BarChart3 } from "lucide-react";
import SEOHead from "@/components/SEOHead";

export default function AIFollowUpGenerator() {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="AI Follow-Up Generator – Auto-Generate Follow-Up Emails"
        description="ReplyZen AI's follow-up generator automatically writes personalized follow-up emails for silent Gmail conversations. Save hours every week and close more deals."
        keywords="AI follow-up generator, automated follow-up emails, email follow-up tool, AI email writer, follow-up email automation, Gmail follow-up"
        canonical="https://replyzenai.com/features/ai-follow-up-generator"
        ogUrl="https://replyzenai.com/features/ai-follow-up-generator"
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

            {/* H1 — only one on the page */}
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              AI Follow-Up Generator — Write Better Follow-Ups in Seconds
            </h1>
            <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
              ReplyZen AI's follow-up generator automatically detects silent email conversations in your Gmail and writes personalized, context-aware follow-up emails — so you never lose a deal to silence again.
            </p>

            {/* What is it */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">What is the ReplyZen AI Follow-Up Generator?</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                The ReplyZen AI follow-up generator is an intelligent email automation tool that scans your Gmail inbox, identifies conversations that have gone silent, and generates professional follow-up email drafts matched to the tone and context of each conversation.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Unlike generic email templates, ReplyZen AI reads the actual thread context — the subject, your last message, how long ago it was sent — and generates a follow-up that sounds like you wrote it yourself. You review it, edit if needed, and send with one click.
              </p>
            </section>

            {/* Problems it solves */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">Problems It Solves</h2>
              <div className="space-y-4">
                {[
                  {
                    icon: Clock,
                    title: "Hours lost writing follow-ups manually",
                    desc: "Sales reps and freelancers spend hours each week manually writing follow-up emails. ReplyZen AI reduces this to seconds per email.",
                  },
                  {
                    icon: Zap,
                    title: "Opportunities lost to inbox silence",
                    desc: "When a client goes quiet after a proposal, the window for recovery is short. ReplyZen AI flags these threads immediately so you act before it's too late.",
                  },
                  {
                    icon: Send,
                    title: "Generic templates that feel impersonal",
                    desc: "Copy-paste follow-up templates lower response rates. AI-generated follow-ups reference actual conversation context, improving your chances of a reply.",
                  },
                  {
                    icon: BarChart3,
                    title: "No visibility into which threads need attention",
                    desc: "Without a system, important emails get buried. ReplyZen AI surfaces only the conversations that actually need your follow-up — ranked by priority.",
                  },
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

            {/* How it works */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">How the AI Follow-Up Generator Works</h2>
              <ol className="space-y-4">
                {[
                  { step: "01", title: "Connect Gmail", desc: "Securely link your Gmail account using Google OAuth. ReplyZen AI never stores your email content." },
                  { step: "02", title: "Detect Silent Conversations", desc: "ReplyZen AI scans your inbox and identifies threads where you sent the last message and haven't received a reply." },
                  { step: "03", title: "Generate AI Draft", desc: "With one click, get a personalized follow-up email draft that matches the tone and context of the original conversation." },
                  { step: "04", title: "Review and Send", desc: "Edit the draft if needed, then send directly via Gmail. The email appears in your Sent folder as if you wrote it yourself." },
                ].map((item) => (
                  <li key={item.step} className="flex gap-4 py-4 border-b border-border last:border-0">
                    <span className="text-3xl font-bold text-primary/20 shrink-0 w-12">{item.step}</span>
                    <div>
                      <p className="font-semibold mb-1">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Who benefits */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">Who Benefits Most from ReplyZen AI?</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                ReplyZen AI's follow-up generator is built for professionals who send emails and need replies — sales representatives, freelancers, consultants, recruiters, and agency owners. If your revenue depends on email conversations, ReplyZen AI is designed for you.
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground text-sm ml-2">
                <li>Sales teams following up on proposals and demos</li>
                <li>Freelancers chasing client approvals and payments</li>
                <li>Recruiters following up with candidates</li>
                <li>Consultants tracking project sign-offs</li>
                <li>Agency owners managing client communications</li>
              </ul>
            </section>

            {/* CTA */}
            <section className="p-8 rounded-2xl bg-card border border-border text-center">
              <h2 className="text-xl font-semibold mb-3">Start Generating Follow-Ups for Free</h2>
              <p className="text-muted-foreground mb-6">
                Connect your Gmail and get your first AI-generated follow-up draft in under 2 minutes. No credit card required.
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
                Also see: <a href="/features/email-automation-ai" className="text-primary hover:underline">Email Automation AI</a> · <a href="/problems/client-not-replying" className="text-primary hover:underline">Client Not Replying?</a>
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