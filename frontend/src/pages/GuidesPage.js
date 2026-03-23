import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail, ArrowRight, Clock, TrendingUp, Users,
  Zap, Target, MessageCircle, Filter, ChevronRight,
  BookOpen, Shield, Lock
} from "lucide-react";

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */
const CATEGORIES = ["All", "Engagement", "Conversion", "Automation", "Strategy"];

const GUIDES = [
  {
    id: 1,
    category: "Engagement",
    badge: "Popular",
    badgeColor: "bg-primary/10 text-primary border-primary/20",
    icon: TrendingUp,
    iconColor: "#6366f1",
    readTime: "6 min read",
    title: "Increase Engagement with AI Replies",
    excerpt: "Learn how to use Replyzen's AI-powered auto-replies to dramatically boost your comment engagement rate on Instagram — without spending hours manually responding.",
    tags: ["Instagram", "Auto Reply", "Engagement"],
    content: {
      intro: "Engagement is the lifeblood of Instagram growth. But manually responding to every comment is time-consuming and nearly impossible at scale. Replyzen's AI auto-reply lets you respond intelligently to every comment — in seconds.",
      sections: [
        {
          heading: "Why fast replies matter",
          body: "Instagram's algorithm rewards engagement velocity — accounts that respond to comments within the first 30 minutes see 3x higher reach on that post. With Replyzen, every comment gets a reply within minutes, automatically.",
        },
        {
          heading: "Setting up engagement-optimised replies",
          steps: [
            "Go to Settings → Auto Reply → Instagram",
            "Enable 'Comment Auto Reply'",
            "Select tone: Friendly or Conversational",
            "Add topic-specific context in the 'Brand Voice' field (e.g. 'We sell handmade jewellery, tone is warm and personal')",
            "Enable 'Ask a follow-up question' to drive further conversation",
          ],
        },
        {
          heading: "Pro tips for maximum engagement",
          bullets: [
            "Use the 'Personalise with name' option — using someone's name in a reply increases reply rates by 40%",
            "Enable emoji responses — adds a human touch to AI replies",
            "Set a 'Top comment pinning' trigger — pin the most engaging reply automatically",
            "Use keyword filters to give more detailed replies to questions vs generic compliments",
          ],
        },
        {
          heading: "Measuring your results",
          body: "Check your Analytics dashboard weekly. Track Comment Reply Rate and Engagement Depth (follow-up replies per post). Most users see a 2–3x improvement in overall engagement within 2 weeks.",
        },
      ],
    },
  },
  {
    id: 2,
    category: "Conversion",
    badge: "Must Read",
    badgeColor: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: Target,
    iconColor: "#10b981",
    readTime: "8 min read",
    title: "Convert Comments into Customers",
    excerpt: "Your comment section is a hidden sales channel. This guide shows you exactly how to use Replyzen to identify high-intent commenters and move them to DMs — automatically.",
    tags: ["Sales", "DM Automation", "Conversion"],
    content: {
      intro: "Most businesses treat comments as social proof. Smart businesses treat them as the top of a sales funnel. With Replyzen, you can identify buying signals in comments and automatically move conversations to DMs where conversions happen.",
      sections: [
        {
          heading: "Identifying high-intent comments",
          body: "High-intent comments contain signals like 'How much?', 'Where can I buy?', 'Do you ship to...?', 'DM me', or 'I need this'. Replyzen's keyword trigger system lets you flag these automatically.",
          steps: [
            "Go to Settings → Reply Triggers",
            "Add keyword triggers: 'price', 'buy', 'cost', 'order', 'available', 'ship'",
            "Set action: 'Reply + Send DM invitation'",
            "Write a DM template: 'Hey [name], thanks for your interest! I've sent you a DM with details 📩'",
          ],
        },
        {
          heading: "The comment-to-DM funnel",
          bullets: [
            "Comment detected with buying signal keyword",
            "Replyzen replies publicly to acknowledge and invite a DM",
            "Automated DM sent with product info or CTA link",
            "DM conversation tracked in your Replyzen dashboard",
            "If no DM reply after 24h, optional follow-up DM sent",
          ],
        },
        {
          heading: "Conversion rate benchmarks",
          body: "Replyzen users who implement the comment-to-DM funnel report a 15–25% comment-to-DM conversion rate and a 5–10% DM-to-sale conversion rate. That means for every 100 buying-signal comments, expect 5–10 sales.",
        },
      ],
    },
  },
  {
    id: 3,
    category: "Strategy",
    badge: "Strategy",
    badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    icon: MessageCircle,
    iconColor: "#8b5cf6",
    readTime: "7 min read",
    title: "Instagram Auto-Reply Strategies That Work in 2025",
    excerpt: "Not all auto-reply strategies are equal. This guide breaks down the proven frameworks top creators and brands use to make their AI replies feel genuinely human.",
    tags: ["Instagram", "Strategy", "Best Practices"],
    content: {
      intro: "The biggest mistake people make with auto-replies is making them feel robotic. Replyzen's AI is powerful, but it needs the right setup to produce replies that feel personal and on-brand. Here are the strategies that work.",
      sections: [
        {
          heading: "Strategy 1: The Human Handoff",
          body: "For simple comments (likes, compliments), use AI auto-replies. For complex questions or complaints, use Replyzen's 'Flag for human review' trigger. This keeps your AI fast on easy interactions while humans handle nuanced situations.",
        },
        {
          heading: "Strategy 2: The Context Layer",
          body: "The more context you give Replyzen about your brand, the better the replies. In Settings → AI Tone → Brand Voice, include:",
          bullets: [
            "What your product/service is",
            "Your target audience",
            "Words and phrases you commonly use",
            "Topics to avoid or handle sensitively",
            "Your CTA (e.g. 'always end with a link to our bio')",
          ],
        },
        {
          heading: "Strategy 3: Time-Based Tone Shifts",
          body: "Schedule different tones for different times. Casual and playful during evenings (when your audience is relaxed), professional during business hours. Use Settings → Auto Reply → Schedule to configure this.",
        },
        {
          heading: "Strategy 4: The Follow-Up Sequence",
          body: "If someone comments but doesn't reply to your auto-reply, set a second trigger: send a lighter follow-up 48 hours later. This doubles your engagement touch without being pushy.",
        },
      ],
    },
  },
  {
    id: 4,
    category: "Automation",
    badge: "Advanced",
    badgeColor: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    icon: Zap,
    iconColor: "#f59e0b",
    readTime: "10 min read",
    title: "DM Automation Funnels: The Complete Guide",
    excerpt: "Build a full DM automation funnel that nurtures leads from first contact to sale — entirely on autopilot. This advanced guide covers sequences, triggers, and measuring ROI.",
    tags: ["DM", "Automation", "Sales Funnel"],
    content: {
      intro: "DM funnels are one of the highest-ROI automation strategies available on Instagram. With Replyzen, you can build multi-step DM sequences that nurture leads, deliver value, and drive conversions — all automatically.",
      sections: [
        {
          heading: "The 4-step DM funnel structure",
          steps: [
            "Entry trigger — a comment, story reply, or profile DM starts the funnel",
            "Welcome message — immediate, warm intro + value statement",
            "Value nurture (Day 1–3) — 1–2 DMs delivering free value (tips, resources, case studies)",
            "Conversion DM (Day 4–5) — soft CTA with offer or booking link",
          ],
        },
        {
          heading: "Setting up your funnel in Replyzen",
          steps: [
            "Go to Settings → DM Sequences",
            "Click 'New Sequence'",
            "Define your entry trigger (keyword comment, story reply, or new follower)",
            "Add messages for each step with delay intervals",
            "Set exit conditions (if person replies, pause sequence)",
            "Activate and monitor from your dashboard",
          ],
        },
        {
          heading: "Funnel best practices",
          bullets: [
            "Always lead with value — the first DM should give, not ask",
            "Keep messages short — under 150 words per message",
            "Use personalisation tokens ([first_name], [post_topic])",
            "Set 'exit if replied' — never send automated messages to an active conversation",
            "A/B test your conversion DM — Replyzen supports 2-variant testing",
          ],
        },
        {
          heading: "Measuring funnel ROI",
          body: "Track Open Rate, Reply Rate, and Conversion Rate in your Analytics dashboard. A healthy funnel has 60%+ open rate, 20%+ reply rate, and 5%+ conversion rate. If conversion is low, the problem is usually the offer — not the funnel.",
        },
      ],
    },
  },
  {
    id: 5,
    category: "Engagement",
    badge: "New",
    badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    icon: Users,
    iconColor: "#06b6d4",
    readTime: "5 min read",
    title: "Build a Loyal Community with Smart Auto-Replies",
    excerpt: "Auto-replies aren't just for leads — they're one of the most powerful community-building tools available. Learn how to use Replyzen to make every follower feel seen and heard.",
    tags: ["Community", "Engagement", "Retention"],
    content: {
      intro: "The fastest-growing Instagram accounts have one thing in common: they make their audience feel like they're in a two-way conversation. Replyzen makes it possible to scale that feeling — even when you have thousands of comments.",
      sections: [
        {
          heading: "The psychology of being heard",
          body: "When someone comments and receives a thoughtful reply within minutes, they're 4x more likely to comment again on future posts. Replyzen's personalised AI replies create this loop at scale.",
        },
        {
          heading: "Community-building reply patterns",
          bullets: [
            "Acknowledge first — start with something specific to their comment",
            "Add value — share a tip, resource, or insight related to their comment",
            "Invite dialogue — end with an open question to keep the conversation going",
            "Use their name — always personalise when possible",
          ],
        },
        {
          heading: "Setting up community-mode replies",
          steps: [
            "Go to Settings → AI Tone",
            "Select 'Community Builder' preset tone",
            "Enable 'Include follow-up question' toggle",
            "Add 2–3 community-specific phrases in Brand Voice",
            "Set reply delay to 2–5 minutes for a more human feel",
          ],
        },
      ],
    },
  },
  {
    id: 6,
    category: "Strategy",
    badge: "Essential",
    badgeColor: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    icon: Filter,
    iconColor: "#f97316",
    readTime: "6 min read",
    title: "Using Replyzen for Email Follow-up: B2B Playbook",
    excerpt: "A step-by-step playbook for B2B sales teams using Replyzen to automate email follow-ups, reduce pipeline leakage, and close more deals consistently.",
    tags: ["B2B", "Email", "Sales"],
    content: {
      intro: "80% of sales require at least 5 follow-up touches, but most salespeople give up after 2. Replyzen solves this by automatically detecting when a prospect has gone quiet and generating a follow-up that sounds like you wrote it personally.",
      sections: [
        {
          heading: "The B2B follow-up stack",
          bullets: [
            "Day 0 — initial outreach (written by you)",
            "Day 3 — Replyzen detects silence, auto-generates follow-up #1",
            "Day 7 — follow-up #2 with a different value angle",
            "Day 14 — follow-up #3 with a low-commitment CTA ('just 15 minutes?')",
            "Day 21 — final 'break-up' email (high open rate)",
          ],
        },
        {
          heading: "Configuring your B2B tone",
          body: "In Settings → AI Tone, select 'Professional' and add to Brand Voice: 'We are a [your industry] company. Our prospects are [role, e.g. CTOs at Series B SaaS companies]. Our tone is direct, confident, and outcome-focused. We never use fluff.'",
        },
        {
          heading: "Personalisation at scale",
          bullets: [
            "Replyzen reads the last email in each thread for context",
            "It references specific details from the prospect's previous messages",
            "Use the 'Add context note' field per lead for extra personalisation hints",
            "Review drafts for your top 20% of pipeline — auto-send for the rest",
          ],
        },
      ],
    },
  },
];

/* ─────────────────────────────────────────────
   FADE IN HOOK
───────────────────────────────────────────── */
function useFadeIn(threshold = 0.1) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ─────────────────────────────────────────────
   GUIDE DETAIL MODAL
───────────────────────────────────────────── */
function GuideModal({ guide, onClose }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-7 py-5 flex items-start justify-between gap-4 z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-semibold border rounded-full px-2.5 py-0.5 ${guide.badgeColor}`}>{guide.badge}</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {guide.readTime}
              </span>
            </div>
            <h2 className="text-xl font-bold">{guide.title}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors mt-1 shrink-0 text-xl leading-none">✕</button>
        </div>

        {/* Content */}
        <div className="px-7 py-6 space-y-6">
          <p className="text-sm text-muted-foreground leading-relaxed">{guide.content.intro}</p>

          {guide.content.sections.map((section, i) => (
            <div key={i} className="space-y-3">
              <h3 className="text-base font-bold">{section.heading}</h3>
              {section.body && <p className="text-sm text-muted-foreground leading-relaxed">{section.body}</p>}
              {section.steps && (
                <ol className="space-y-2.5">
                  {section.steps.map((step, j) => (
                    <li key={j} className="flex gap-3 items-start text-sm text-muted-foreground">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{j + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
              {section.bullets && (
                <ul className="space-y-2">
                  {section.bullets.map((b, j) => (
                    <li key={j} className="flex gap-2.5 items-start text-sm text-muted-foreground">
                      <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-1" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {/* CTA */}
          <div className="mt-4 pt-5 border-t border-border flex flex-col sm:flex-row gap-3">
            <Button className="bg-primary hover:bg-primary/90 text-white font-semibold" onClick={() => {}}>
              Try This in Replyzen <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   GUIDE CARD
───────────────────────────────────────────── */
function GuideCard({ guide, onClick, delay }) {
  const [ref, visible] = useFadeIn();
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      }}
      className="group rounded-2xl border border-border bg-card p-7 cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:border-primary/20 transition-all duration-300"
      onClick={() => onClick(guide)}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${guide.iconColor}18` }}>
          <guide.icon className="w-5 h-5" style={{ color: guide.iconColor }} />
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold border rounded-full px-2.5 py-0.5 ${guide.badgeColor}`}>{guide.badge}</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3" />{guide.readTime}
          </span>
        </div>
      </div>
      <h3 className="text-base font-bold mb-2 group-hover:text-primary transition-colors">{guide.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-5 line-clamp-3">{guide.excerpt}</p>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {guide.tags.map(tag => (
            <span key={tag} className="text-xs bg-muted/60 text-muted-foreground rounded-full px-2.5 py-1">{tag}</span>
          ))}
        </div>
        <span className="text-xs text-primary font-semibold flex items-center gap-1 shrink-0">
          Read <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────── */
export default function GuidesPage() {
  const navigate    = useNavigate();
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedGuide,  setSelectedGuide]  = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const filtered = activeCategory === "All"
    ? GUIDES
    : GUIDES.filter(g => g.category === activeCategory);

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        body{font-family:'Instrument Sans',system-ui,sans-serif}
        .rz-nav-blur{backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);background:rgba(var(--background-rgb,0,0,0),.82);border-bottom:1px solid transparent;transition:border-color .3s,box-shadow .3s}
        .rz-nav-blur.scrolled{border-color:var(--border);box-shadow:0 2px 20px rgba(0,0,0,.12)}
        .rz-hero-bg{background:radial-gradient(ellipse 80% 60% at 50% -10%,color-mix(in srgb,var(--primary) 12%,transparent),transparent 70%)}
        .line-clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      `}</style>

      {/* ── NAVBAR ── */}
      <nav className={`rz-nav-blur fixed top-0 left-0 right-0 z-50 ${scrolled ? "scrolled" : ""}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Replyzen AI</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="/docs"   className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">Docs</a>
            <a href="/guides" className="text-sm text-foreground font-semibold">Guides</a>
            <a href="/blog"   className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">Blog</a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="font-medium hidden md:flex">Log in</Button>
            <Button size="sm" onClick={() => navigate("/login")} className="bg-primary hover:bg-primary/90 text-white font-semibold">
              Get Started <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="rz-hero-bg pt-32 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <Badge variant="secondary" className="mb-5 font-semibold px-3 py-1 inline-flex items-center gap-1.5">
            <BookOpen className="w-3 h-3 text-primary" /> Growth Playbooks
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
            Guides to grow with<br /><span className="text-primary">Replyzen AI</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Practical, step-by-step playbooks to help you convert more leads, build a loyal audience, and automate your engagement — all with Replyzen.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-primary" /> Practical steps only</span>
            <span className="w-px h-4 bg-border" />
            <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-primary" /> Real results</span>
            <span className="w-px h-4 bg-border" />
            <span className="flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-primary" /> Updated monthly</span>
          </div>
        </div>
      </section>

      {/* ── FILTER TABS ── */}
      <div className="sticky top-16 z-30 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                activeCategory === cat
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── GUIDES GRID ── */}
      <main className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-lg font-bold">
              {activeCategory === "All" ? "All Guides" : activeCategory}
              <span className="ml-2 text-sm font-normal text-muted-foreground">({filtered.length})</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((guide, i) => (
              <GuideCard key={guide.id} guide={guide} onClick={setSelectedGuide} delay={i * 80} />
            ))}
          </div>
        </div>
      </main>

      {/* ── CTA STRIP ── */}
      <section className="py-16 px-6 bg-card border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-3">Ready to put these guides into action?</h2>
          <p className="text-sm text-muted-foreground mb-7">Start your free Replyzen account and implement any of these strategies today.</p>
          <Button size="lg" onClick={() => navigate("/login")} className="bg-primary hover:bg-primary/90 text-white px-10 font-bold">
            Start for Free <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <p className="mt-3 text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" /> No credit card required
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-10 px-6 border-t border-border bg-card">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold">Replyzen AI</span>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Replyzen AI. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <a href="/docs"             className="text-xs text-muted-foreground hover:text-foreground transition-colors">Docs</a>
            <a href="/privacy-policy"   className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
            <a href="/terms-of-service" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
          </div>
        </div>
      </footer>

      {/* ── GUIDE MODAL ── */}
      {selectedGuide && <GuideModal guide={selectedGuide} onClose={() => setSelectedGuide(null)} />}
    </div>
  );
}
