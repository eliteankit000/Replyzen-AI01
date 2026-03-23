import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail, ArrowRight, Clock, TrendingUp, Zap,
  MessageSquare, BarChart3, ChevronRight,
  Search, Lock, Shield, Rss
} from "lucide-react";

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */
const CATEGORIES = ["All", "AI Tools", "Automation", "Instagram", "Sales", "Trends"];

const POSTS = [
  {
    id: 1,
    category: "AI Tools",
    featured: true,
    readTime: "7 min read",
    date: "June 12, 2025",
    author: { name: "Arjun Mehta", initials: "AM", color: "#6366f1" },
    icon: Zap,
    iconColor: "#6366f1",
    title: "AI Tools for Social Media Automation: The 2025 Complete Guide",
    excerpt: "Social media automation has evolved beyond scheduling posts. In 2025, AI tools can reply to comments, send DMs, qualify leads, and even close sales — completely on autopilot. Here's the full landscape.",
    tags: ["AI", "Automation", "Social Media"],
    content: {
      intro: "Five years ago, social media automation meant scheduling posts with Buffer. Today, AI has fundamentally changed what's possible — and the gap between teams using AI automation and those who aren't is becoming impossible to ignore.",
      sections: [
        {
          heading: "The automation stack in 2025",
          body: "Modern social media teams are running a layered automation stack: content creation tools (Jasper, Copy.ai), scheduling platforms (Later, Hootsuite), engagement automation (Replyzen AI), and analytics layers (Sprout Social). The biggest ROI gains are in engagement automation — historically the most time-consuming layer.",
        },
        {
          heading: "What AI can (and can't) automate",
          bullets: [
            "✅ Comment replies — AI handles 80%+ of comments reliably",
            "✅ DM follow-up sequences — excellent for lead nurturing",
            "✅ Silence detection in email — Replyzen's core strength",
            "✅ Lead qualification via keyword detection",
            "❌ Sensitive customer complaints — still needs human review",
            "❌ Brand crisis management — always requires human judgment",
            "❌ Complex multi-turn negotiations — AI assists, human closes",
          ],
        },
        {
          heading: "Replyzen's place in the stack",
          body: "Replyzen AI fills the engagement automation layer for both email and Instagram. It detects when conversations have gone cold and generates context-aware responses that sound like the person who set them up — not a bot. For sales teams and creators, this is the highest-leverage automation available.",
        },
        {
          heading: "The ROI case",
          body: "The average salesperson spends 21% of their day on follow-up emails. For a 10-person team at $80k average salary, that's $168k/year in salary costs for a task that AI can handle at a fraction of the cost — and with higher consistency.",
        },
      ],
    },
  },
  {
    id: 2,
    category: "Sales",
    featured: false,
    readTime: "6 min read",
    date: "June 5, 2025",
    author: { name: "Sarah Lin", initials: "SL", color: "#8b5cf6" },
    icon: TrendingUp,
    iconColor: "#10b981",
    title: "Auto-Reply Strategies That Actually Close Deals in 2025",
    excerpt: "Most auto-replies fail because they're transactional, not relational. This post covers the proven reply strategies that top-performing sales teams use to turn automated touchpoints into genuine conversions.",
    tags: ["Sales", "Auto Reply", "Strategy"],
    content: {
      intro: "Auto-replies get a bad reputation because most of them are bad. They're generic, impersonal, and obvious. But when done right — with the right context, tone, and timing — auto-replies are indistinguishable from personal outreach and far more scalable.",
      sections: [
        {
          heading: "The human-feel framework",
          body: "The best auto-replies follow a simple formula: Acknowledge (reference something specific to their message) → Add value (give something useful, not just a CTA) → Invite (end with an open question or low-friction next step).",
        },
        {
          heading: "Timing is everything",
          body: "Research consistently shows that following up within 5 minutes of a prospect's action converts 8x better than following up after 30 minutes. Replyzen's instant trigger capability makes this possible even when you're asleep.",
        },
        {
          heading: "The 3-touch follow-up sequence",
          bullets: [
            "Touch 1 (Day 3) — reference-based follow-up: refer back to the original conversation",
            "Touch 2 (Day 7) — value-add follow-up: share a relevant resource, case study, or insight",
            "Touch 3 (Day 14) — permission-based follow-up: ask if they'd like to continue or close the loop",
          ],
        },
        {
          heading: "What makes Replyzen different",
          body: "Unlike generic email automation tools, Replyzen reads the actual thread context before generating a reply. It references the specific things the prospect said, adjusts tone based on their communication style, and adapts the follow-up angle based on where in the sales cycle the conversation is.",
        },
      ],
    },
  },
  {
    id: 3,
    category: "AI Tools",
    featured: false,
    readTime: "8 min read",
    date: "May 28, 2025",
    author: { name: "Marcus Okafor", initials: "MO", color: "#06b6d4" },
    icon: MessageSquare,
    iconColor: "#8b5cf6",
    title: "Chatbot vs AI Reply Tool: What's the Difference and Which Do You Need?",
    excerpt: "Chatbots and AI reply tools both automate conversations — but they're built for completely different use cases. Understanding the distinction could save you months of setup and wasted budget.",
    tags: ["AI", "Chatbot", "Comparison"],
    content: {
      intro: "The terms 'chatbot' and 'AI reply tool' are often used interchangeably, but they solve fundamentally different problems. Choosing the wrong one leads to over-engineered solutions for simple problems — or under-powered tools for complex ones.",
      sections: [
        {
          heading: "Chatbots: designed for structured workflows",
          body: "Chatbots are built around decision trees and structured flows. They excel at: FAQ answering (same question, same answer every time), lead qualification forms (collect name/email/company), customer support ticket routing, and e-commerce order tracking. They struggle with anything that requires context, nuance, or an understanding of an ongoing relationship.",
        },
        {
          heading: "AI reply tools: designed for relationship continuity",
          body: "AI reply tools like Replyzen are built to understand the history and context of an ongoing conversation. They don't just pattern-match questions — they read the thread, understand the relationship stage, and generate a reply that moves the conversation forward. This is fundamentally different from a chatbot.",
        },
        {
          heading: "When to use each",
          bullets: [
            "Chatbot — website live chat for new visitors with no history",
            "Chatbot — FAQ section or help centre automation",
            "Chatbot — structured onboarding flows with yes/no decisions",
            "AI Reply Tool — follow-up on existing email threads",
            "AI Reply Tool — Instagram comment and DM responses with context",
            "AI Reply Tool — relationship-stage-aware outreach sequences",
          ],
        },
        {
          heading: "Can you use both?",
          body: "Absolutely. The best setups use a chatbot on the website for cold traffic and first-touch interactions, and an AI reply tool like Replyzen for warm follow-up once a relationship has started. They complement each other rather than compete.",
        },
      ],
    },
  },
  {
    id: 4,
    category: "Instagram",
    featured: false,
    readTime: "5 min read",
    date: "May 20, 2025",
    author: { name: "Priya Sharma", initials: "PS", color: "#f59e0b" },
    icon: BarChart3,
    iconColor: "#f59e0b",
    title: "Instagram Algorithm in 2025: What the Data Says About Reply Velocity",
    excerpt: "We analysed 50,000 Instagram posts and found a clear pattern: accounts that reply to comments within 30 minutes see dramatically higher reach. Here's what the data shows and how to act on it.",
    tags: ["Instagram", "Algorithm", "Data"],
    content: {
      intro: "Instagram has never officially confirmed how comment responses affect reach, but our analysis of 50,000 posts across 200 accounts tells a clear story. Reply velocity — how quickly you respond to comments — is one of the strongest signals for post amplification.",
      sections: [
        {
          heading: "The data breakdown",
          bullets: [
            "Posts with replies within 5 min: average 3.8x higher reach",
            "Posts with replies within 30 min: average 2.1x higher reach",
            "Posts with replies within 24 hours: average 1.2x higher reach",
            "Posts with no replies: baseline reach",
          ],
        },
        {
          heading: "Why reply velocity matters",
          body: "When you reply to a comment, Instagram sends a notification to the commenter — bringing them back to your post. This generates a second engagement event from the same person. The algorithm interprets this as high-quality content worth showing to more people. Reply velocity compounds this effect: the faster you reply, the more likely the commenter is still active and will return.",
        },
        {
          heading: "The practical implication",
          body: "For most creators and brands, replying to every comment within 5 minutes is physically impossible — especially when posts go live during off-hours. Replyzen's auto-reply closes this gap by responding intelligently within 1–3 minutes of every comment, regardless of when you posted.",
        },
        {
          heading: "What the best accounts do differently",
          bullets: [
            "They reply to every comment, not just the high-engagement ones",
            "Their replies add value or invite further conversation",
            "They reply quickly — within the first 30 minutes after posting",
            "They use the first comment to boost engagement in the critical early window",
          ],
        },
      ],
    },
  },
  {
    id: 5,
    category: "Trends",
    featured: false,
    readTime: "6 min read",
    date: "May 14, 2025",
    author: { name: "Arjun Mehta", initials: "AM", color: "#6366f1" },
    icon: Rss,
    iconColor: "#06b6d4",
    title: "Social Media Automation Trends: What's Coming in the Next 12 Months",
    excerpt: "From AI agents that manage entire campaigns to voice-powered DM replies, here are the automation trends that will reshape social media marketing over the next year.",
    tags: ["Trends", "AI", "Future"],
    content: {
      intro: "Social media automation is moving from scheduled posts and simple bots to fully autonomous AI agents that can manage entire campaigns, qualify leads, and even handle objections — without human intervention. Here's what's coming.",
      sections: [
        {
          heading: "Trend 1: Agentic social media management",
          body: "AI agents will move beyond single-task automation (reply to this comment) to multi-step, goal-directed workflows (identify interested leads in comments, move to DM, qualify, and book a demo call). Replyzen is building toward this with its DM sequence automation.",
        },
        {
          heading: "Trend 2: Cross-platform thread continuity",
          body: "Right now, engagement is siloed by platform. Someone might comment on your Instagram post, then email you, then DM you on LinkedIn — and each conversation is treated separately. Future tools will unify these into a single relationship thread.",
        },
        {
          heading: "Trend 3: Voice-based DM replies",
          body: "Audio DMs are growing fast on Instagram and WhatsApp. AI tools that can generate natural-sounding voice replies are in development. Expect this to be mainstream within 18 months.",
        },
        {
          heading: "Trend 4: Sentiment-adaptive tone",
          body: "Current AI reply tools set a tone and keep it. Next-generation tools will detect the emotional state of the person they're replying to — excitement, frustration, confusion — and adapt tone automatically. Replyzen's next major update includes early sentiment detection.",
        },
      ],
    },
  },
  {
    id: 6,
    category: "Automation",
    featured: false,
    readTime: "5 min read",
    date: "May 7, 2025",
    author: { name: "Sarah Lin", initials: "SL", color: "#8b5cf6" },
    icon: Zap,
    iconColor: "#f97316",
    title: "Email Follow-up Automation: Why Most Tools Get It Wrong",
    excerpt: "Most email automation tools treat follow-ups as a scheduling problem. They're not. They're a context problem — and that's why generic blast-and-wait sequences fail while intelligent, thread-aware follow-ups win.",
    tags: ["Email", "Automation", "Follow-up"],
    content: {
      intro: "There are dozens of email automation tools on the market. Most of them let you schedule a sequence: send email 1 on day 0, email 2 on day 3, email 3 on day 7. The problem is this approach completely ignores what the prospect actually said — or didn't say.",
      sections: [
        {
          heading: "The context problem",
          body: "A sequence tool doesn't know if the prospect opened your last email, clicked a link, replied with a question, or hasn't engaged at all. It just fires the next email in the sequence regardless. This leads to tone-deaf follow-ups that damage the relationship instead of moving it forward.",
        },
        {
          heading: "What context-aware follow-up looks like",
          bullets: [
            "Reads the last N messages in the thread before generating a follow-up",
            "Adjusts the follow-up angle based on what was previously discussed",
            "Detects if the prospect showed interest (engagement signals) vs. went cold",
            "Escalates or de-escalates urgency based on silence duration",
            "Stops sending if a reply is received",
          ],
        },
        {
          heading: "Replyzen's approach",
          body: "Replyzen doesn't run sequences — it runs intelligence. Every follow-up draft is generated fresh by reading the actual thread. The AI understands what's been said, what hasn't been resolved, and what the most natural next step would be. This is why Replyzen drafts consistently feel personal rather than automated.",
        },
        {
          heading: "When sequences still make sense",
          body: "Cold outreach where you have zero prior relationship — that's where sequences work. But the moment someone has engaged with you, sequences become a liability. Switch to context-aware tools like Replyzen the moment a conversation starts.",
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
   POST DETAIL MODAL
───────────────────────────────────────────── */
function PostModal({ post, onClose }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-7 py-5 z-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs font-semibold bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5">{post.category}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />{post.readTime}
                </span>
                <span className="text-xs text-muted-foreground">{post.date}</span>
              </div>
              <h2 className="text-xl font-bold leading-snug">{post.title}</h2>
              <div className="flex items-center gap-2 mt-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: post.author.color }}>
                  {post.author.initials}
                </div>
                <span className="text-xs font-medium text-muted-foreground">{post.author.name}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none mt-1 shrink-0">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-6">
          <p className="text-sm text-muted-foreground leading-relaxed text-base">{post.content.intro}</p>

          {post.content.sections.map((section, i) => (
            <div key={i} className="space-y-3">
              <h3 className="text-base font-bold">{section.heading}</h3>
              {section.body && <p className="text-sm text-muted-foreground leading-relaxed">{section.body}</p>}
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

          {/* Tags */}
          <div className="flex flex-wrap gap-2 pt-2">
            {post.tags.map(tag => (
              <span key={tag} className="text-xs bg-muted/60 text-muted-foreground rounded-full px-3 py-1">{tag}</span>
            ))}
          </div>

          {/* CTA */}
          <div className="pt-4 border-t border-border flex flex-col sm:flex-row gap-3">
            <Button className="bg-primary hover:bg-primary/90 text-white font-semibold">
              Try Replyzen Free <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   POST CARD
───────────────────────────────────────────── */
function PostCard({ post, onClick, delay, featured }) {
  const [ref, visible] = useFadeIn();
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      }}
      className={`group rounded-2xl border border-border bg-card cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:border-primary/20 transition-all duration-300 overflow-hidden ${featured ? "md:col-span-2" : ""}`}
      onClick={() => onClick(post)}
    >
      {/* Top accent */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(to right, ${post.iconColor}60, ${post.iconColor}10)` }} />
      
      <div className={`p-7 ${featured ? "md:flex md:gap-10 md:items-start" : ""}`}>
        {/* Icon for featured */}
        {featured && (
          <div className="hidden md:flex w-16 h-16 rounded-2xl items-center justify-center shrink-0 mb-0" style={{ background: `${post.iconColor}15` }}>
            <post.icon className="w-7 h-7" style={{ color: post.iconColor }} />
          </div>
        )}

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {post.featured && <span className="text-xs font-bold bg-primary text-white rounded-full px-2.5 py-0.5">✦ Featured</span>}
            <span className="text-xs font-semibold bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5">{post.category}</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
            <span className="text-xs text-muted-foreground">{post.date}</span>
          </div>

          <h3 className={`font-bold mb-3 group-hover:text-primary transition-colors leading-snug ${featured ? "text-xl" : "text-base"}`}>
            {post.title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5 line-clamp-3">{post.excerpt}</p>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: post.author.color }}>
                {post.author.initials}
              </div>
              <span className="text-xs font-medium text-muted-foreground">{post.author.name}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {post.tags.slice(0, 2).map(tag => (
                <span key={tag} className="text-xs bg-muted/60 text-muted-foreground rounded-full px-2.5 py-1">{tag}</span>
              ))}
            </div>
            <span className="text-xs text-primary font-semibold flex items-center gap-1 shrink-0">
              Read <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────── */
export default function BlogPage() {
  const navigate  = useNavigate();
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedPost,   setSelectedPost]   = useState(null);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const filtered = POSTS.filter(p => {
    const matchCat  = activeCategory === "All" || p.category === activeCategory;
    const matchSearch = searchQuery === "" ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

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
            <a href="/guides" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">Guides</a>
            <a href="/blog"   className="text-sm text-foreground font-semibold">Blog</a>
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
      <section className="rz-hero-bg pt-32 pb-14 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <Badge variant="secondary" className="mb-5 font-semibold px-3 py-1 inline-flex items-center gap-1.5">
            <Rss className="w-3 h-3 text-primary" /> Insights & Updates
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
            The Replyzen<br /><span className="text-primary">Blog</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Deep dives into AI automation, social media strategy, sales tactics, and the future of engagement — written by the Replyzen team.
          </p>

          {/* Search */}
          <div className="mt-8 relative max-w-md mx-auto">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search posts…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-5 py-3 text-sm bg-card border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-primary" /> {POSTS.length} articles</span>
            <span className="w-px h-4 bg-border" />
            <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-primary" /> Updated weekly</span>
          </div>
        </div>
      </section>

      {/* ── CATEGORY FILTER ── */}
      <div className="sticky top-16 z-30 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-2 overflow-x-auto">
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

      {/* ── POSTS ── */}
      <main className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground">No posts found for "{searchQuery}"</p>
              <button onClick={() => { setSearchQuery(""); setActiveCategory("All"); }} className="mt-3 text-sm text-primary hover:underline">
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-lg font-bold">
                  {activeCategory === "All" ? "All Posts" : activeCategory}
                  {searchQuery && <span className="ml-2 text-sm font-normal text-muted-foreground">· "{searchQuery}"</span>}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">({filtered.length})</span>
                </h2>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {filtered.map((post, i) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onClick={setSelectedPost}
                    delay={i * 70}
                    featured={post.featured && i === 0 && activeCategory === "All" && !searchQuery}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── NEWSLETTER STRIP ── */}
      <section className="py-16 px-6 bg-card border-t border-border">
        <div className="max-w-xl mx-auto text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <Rss className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Stay in the loop</h2>
          <p className="text-sm text-muted-foreground mb-6">Get new posts delivered to your inbox every week. No spam — ever.</p>
          <div className="flex gap-2 max-w-sm mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 px-4 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
            />
            <Button className="bg-primary hover:bg-primary/90 text-white font-semibold shrink-0">Subscribe</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" /> Unsubscribe anytime
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
            <a href="/guides"           className="text-xs text-muted-foreground hover:text-foreground transition-colors">Guides</a>
            <a href="/privacy-policy"   className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
            <a href="/terms-of-service" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
          </div>
        </div>
      </footer>

      {/* ── POST MODAL ── */}
      {selectedPost && <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />}
    </div>
  );
}
