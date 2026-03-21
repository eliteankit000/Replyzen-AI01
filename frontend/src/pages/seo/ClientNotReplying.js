import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, AlertCircle, Clock, Zap } from "lucide-react";
import SEOHead from "@/components/SEOHead";

export default function ClientNotReplying() {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Client Not Replying to Your Email? Here's What to Do"
        description="When a client stops replying to emails, timing and tone matter. ReplyZen AI automatically detects silent conversations and generates the perfect follow-up email to re-engage clients."
        keywords="client not replying to email, client stopped responding, how to follow up when client doesn't reply, email follow-up after no response, client ghosting email"
        canonical="https://replyzenai.com/problems/client-not-replying"
        ogUrl="https://replyzenai.com/problems/client-not-replying"
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
              Client Not Replying to Your Email? Here's Exactly What to Do
            </h1>
            <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
              You sent a proposal, quoted a price, or asked a simple question — and then silence. A client not replying is one of the most frustrating problems in professional email communication. ReplyZen AI is built specifically to solve it.
            </p>

            {/* Why clients go silent */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">Why Clients Stop Replying</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                When a client doesn't reply to your email, it's rarely because they've decided against you. In most cases, the reason is much simpler: they got busy, your email slipped down their inbox, or they're waiting on something internally before responding.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Studies show that over 70% of unanswered emails are not intentional ignores — they're forgotten. A well-timed, non-pushy follow-up email is often all it takes to re-engage a client and move the conversation forward.
              </p>
            </section>

            {/* Common scenarios */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">Common Scenarios Where Clients Go Silent</h2>
              <div className="space-y-4">
                {[
                  {
                    icon: AlertCircle,
                    title: "After sending a proposal or quote",
                    desc: "You've put in the work, sent a detailed proposal, and now silence. This is one of the highest-stakes situations where a follow-up is critical.",
                  },
                  {
                    icon: Clock,
                    title: "After a discovery call or meeting",
                    desc: "The call went well, you sent a summary or next steps, and the client has gone quiet. Timing matters here — the longer you wait, the colder the lead.",
                  },
                  {
                    icon: Zap,
                    title: "While waiting for a decision or approval",
                    desc: "The project is on hold waiting for client sign-off. A gentle nudge at the right time can unblock weeks of delay.",
                  },
                  {
                    icon: Mail,
                    title: "After delivering work and awaiting feedback",
                    desc: "You've delivered the work, asked for feedback or approval, and the client has disappeared. A follow-up signals professionalism and keeps the project moving.",
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

            {/* Best practices */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">Best Practices for Following Up When a Client Doesn't Reply</h2>
              <ol className="space-y-5">
                {[
                  {
                    num: "1",
                    title: "Wait the right amount of time",
                    desc: "For proposals, 3–5 business days is the ideal window. For routine questions, 2–3 days is appropriate. Following up too soon can feel pushy; too late and the momentum is lost.",
                  },
                  {
                    num: "2",
                    title: "Reference the previous conversation specifically",
                    desc: "Generic follow-ups like 'Just checking in' rarely work. Reference the specific subject — the proposal you sent, the call you had, the deliverable you shared. This shows attentiveness and makes it easy for the client to pick up where you left off.",
                  },
                  {
                    num: "3",
                    title: "Keep it short and clear",
                    desc: "Your follow-up should be 3–5 lines maximum. Restate what you're waiting on, offer any help needed to move forward, and end with a clear call to action.",
                  },
                  {
                    num: "4",
                    title: "Match the original tone",
                    desc: "If your original email was formal, keep the follow-up formal. If you had a warm, casual relationship, match that energy. Tone mismatch can feel jarring and reduce the chance of a response.",
                  },
                  {
                    num: "5",
                    title: "Don't chase indefinitely",
                    desc: "Two to three follow-ups spread over 2–3 weeks is a reasonable limit. After that, a brief closing email ('I'll assume the timing isn't right, but feel free to reach out in future') is professional and often triggers a response.",
                  },
                ].map((item) => (
                  <li key={item.num} className="flex gap-4">
                    <span className="text-2xl font-bold text-primary/30 shrink-0 w-8 mt-0.5">{item.num}.</span>
                    <div>
                      <p className="font-semibold mb-1">{item.title}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* How ReplyZen helps */}
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-3">How ReplyZen AI Solves the Client Not Replying Problem</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                ReplyZen AI monitors your Gmail inbox and automatically detects every conversation where you sent the last message and haven't received a reply. It respects your configured silence threshold (e.g. 3 days) and only surfaces threads that genuinely need attention.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                For each silent thread, ReplyZen AI generates a personalized follow-up email draft using the actual conversation context — the subject, your last message, the recipient's name, and how long they've been silent. The result is a follow-up that feels human and relevant, not templated.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                You can review the draft, edit it if needed, and send it directly from ReplyZen AI — or enable auto-send to have it handled automatically within your defined send window. No more manually tracking who hasn't replied.
              </p>
            </section>

            {/* CTA */}
            <section className="p-8 rounded-2xl bg-card border border-border text-center">
              <h2 className="text-xl font-semibold mb-3">Never Let a Client Go Quiet Again</h2>
              <p className="text-muted-foreground mb-6">
                Connect your Gmail and ReplyZen AI will automatically detect every conversation that needs a follow-up. Free plan available — no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => navigate("/login")} className="bg-primary hover:bg-primary/90 text-white px-8">
                  Start for Free
                </Button>
                <Button variant="outline" onClick={() => navigate("/")}>
                  Learn How It Works
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Also see: <a href="/features/ai-follow-up-generator" className="text-primary hover:underline">AI Follow-Up Generator</a> · <a href="/features/email-automation-ai" className="text-primary hover:underline">Email Automation AI</a> · <a href="/problems/missed-follow-up-emails" className="text-primary hover:underline">Missed Follow-Up Emails</a>
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