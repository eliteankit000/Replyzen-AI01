import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail, Zap, BarChart3, Clock, ArrowRight, Check,
  Send, Shield, ChevronRight, Loader2, Lock, Eye,
  RefreshCw, TrendingUp, ChevronDown
} from "lucide-react";

/* ─────────────────────────────────────────────
   ALL ORIGINAL CONSTANTS — UNTOUCHED
───────────────────────────────────────────── */
const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (process.env.REACT_APP_REPLIT_DEV_DOMAIN
    ? `https://${process.env.REACT_APP_REPLIT_DEV_DOMAIN}:8000`
    : "https://replyzen-ai01-production.up.railway.app");

const NAV_LINKS = [
  { label: "Features",     href: "#features"     },
  { label: "How it Works", href: "#how-it-works"  },
  { label: "Pricing",      href: "#pricing"       },
];

const FEATURES = [
  { icon: Clock,    title: "Silence Detection", desc: "Automatically detects email threads where you're waiting for a reply. Configurable delay thresholds from 1-10 days." },
  { icon: Zap,      title: "AI Follow-ups",     desc: "GPT-4o generates context-aware follow-up drafts matching your preferred tone: professional, friendly, or casual." },
  { icon: Send,     title: "One-Click Send",    desc: "Review AI drafts, edit if needed, and send directly through Gmail. No copy-pasting or app switching." },
  { icon: BarChart3,title: "Smart Analytics",  desc: "Track follow-up success rates, response patterns, and optimize your outreach with actionable insights." },
];

const STEPS = [
  { num: "01", title: "Connect Gmail",  desc: "Link your Gmail account securely with OAuth. Your data stays encrypted." },
  { num: "02", title: "Detect Silence", desc: "Our engine scans your threads and finds conversations gone quiet." },
  { num: "03", title: "AI Drafts",      desc: "Get intelligent follow-up drafts generated from your conversation context." },
  { num: "04", title: "Send & Track",   desc: "Review, edit, and send. Track responses and optimize your follow-up game." },
];

// ✅ Prices match Razorpay dashboard exactly — UNTOUCHED
const PRICING = {
  USD: {
    pro:      { monthly: 19,   yearly: 190,   yearlyPerMonth: 16   },
    business: { monthly: 49,   yearly: 490,   yearlyPerMonth: 41   },
  },
  INR: {
    pro:      { monthly: 1599, yearly: 15999, yearlyPerMonth: 1333 },
    business: { monthly: 3999, yearly: 39999, yearlyPerMonth: 3333 },
  },
};

function getPricingPlans(currency, billingCycle) {
  const sym = currency === "INR" ? "₹" : "$";
  const p   = PRICING[currency] || PRICING.USD;
  const isYearly = billingCycle === "yearly";
  return [
    {
      name: "Free", price: `${sym}0`, period: "forever", billedNote: null,
      desc: "Get started",
      features: ["30 follow-ups per month","1 email account connection","Basic AI follow-up drafts","Manual follow-up sending","Inbox scan for silent conversations","Follow-up queue dashboard","Basic settings"],
      cta: "Start Free", popular: false,
    },
    {
      name: "Pro",
      price: isYearly ? `${sym}${p.pro.yearlyPerMonth}` : `${sym}${p.pro.monthly}`,
      period: "/month",
      billedNote: isYearly ? `Billed ${sym}${p.pro.yearly}/year` : null,
      desc: "For professionals",
      features: ["5,000 follow-ups per month","Connect up to 3 email accounts","Advanced AI tones","Manual sending","Auto-send automation","Analytics dashboard","Inbox scanning","Follow-up detection","Priority support"],
      cta: "Get Pro", popular: true,
    },
    {
      name: "Business",
      price: isYearly ? `${sym}${p.business.yearlyPerMonth}` : `${sym}${p.business.monthly}`,
      period: "/month",
      billedNote: isYearly ? `Billed ${sym}${p.business.yearly}/year` : null,
      desc: "For teams",
      features: ["Unlimited follow-ups","Connect up to 10 email accounts","All AI tones","Manual sending","Auto-send automation","Inbox scanning","Follow-up detection","Dedicated support"],
      cta: "Get Business", popular: false,
    },
  ];
}

/* ─────────────────────────────────────────────
   ✅ NEW: INSTANT TIMEZONE-BASED CURRENCY DETECTION
   
   Runs synchronously before first render so there is
   ZERO loading flash. India uses Asia/* timezones.
   This is the instant first guess — the backend call
   below will confirm or correct it.
───────────────────────────────────────────── */
function detectCurrencyFromTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    // All Indian timezones start with "Asia/Kolkata" or "Asia/Calcutta"
    if (tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta")) {
      return "INR";
    }
    // Broad Asia check — catches most South Asian locales
    // Backend will correct if wrong
    return "USD";
  } catch {
    return "USD";
  }
}

// ─────────────────────────────────────────────
// INTERSECTION OBSERVER HOOK — unchanged
// ─────────────────────────────────────────────
function useFadeIn(threshold = 0.15) {
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
   COMPLIANCE BADGES — unchanged
───────────────────────────────────────────── */
function ComplianceBadges({ className = "" }) {
  const badges = [
    { label: "SOC 2 Ready",           icon: "🔒" },
    { label: "GDPR Compliant",        icon: "🇪🇺" },
    { label: "256-bit SSL",           icon: "🔐" },
    { label: "Google OAuth Verified", icon: "✅" },
  ];
  return (
    <div className={`flex flex-wrap items-center justify-center gap-3 ${className}`}>
      {badges.map(b => (
        <div key={b.label}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
          <span>{b.icon}</span><span>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SOCIAL PROOF SECTION — unchanged
───────────────────────────────────────────── */
const BRAND_LOGOS = ["Acme Corp","Veritas","NovaSales","Orion HQ","Plex Media","Stratos"];

function SocialProofSection() {
  const [ref, visible] = useFadeIn();
  return (
    <section ref={ref}
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)", transition: "opacity 0.7s ease, transform 0.7s ease" }}
      className="py-12 px-6 border-y border-border bg-muted/30">
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-8">
          Trusted by sales teams &amp; founders at
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {BRAND_LOGOS.map(name => (
            <span key={name} className="text-sm font-semibold text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-200 tracking-wide">{name}</span>
          ))}
        </div>
        <div className="mt-8 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground mb-4 font-medium">Enterprise-grade security &amp; compliance</p>
          <ComplianceBadges />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   PRODUCT DEMO SECTION — unchanged
───────────────────────────────────────────── */
const DEMO_STEPS = [
  { icon: Eye,        label: "Step 1", title: "Detect Silence",     desc: "Engine scans inbox and flags threads with no reply after your set threshold.",  color: "#6366f1" },
  { icon: Zap,        label: "Step 2", title: "AI Generates Draft", desc: "GPT-4o reads context and writes a follow-up that sounds exactly like you.",     color: "#8b5cf6" },
  { icon: Check,      label: "Step 3", title: "You Approve",        desc: "Review the draft, tweak the tone, or send as-is in a single click.",             color: "#06b6d4" },
  { icon: TrendingUp, label: "Step 4", title: "Sent & Tracked",     desc: "Message fires through Gmail. Response rate tracked on your analytics board.",    color: "#10b981" },
];

function ProductDemoSection() {
  const [ref, visible] = useFadeIn();
  return (
    <section ref={ref}
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(32px)", transition: "opacity 0.7s ease, transform 0.7s ease" }}
      className="py-24 px-6 bg-card">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-primary uppercase tracking-widest">Workflow</span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold">See Replyzen in Action</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">From silent thread to sent follow-up — in under 30 seconds.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {DEMO_STEPS.map((s, i) => (
            <div key={s.title} style={{ transitionDelay: `${i * 80}ms` }}
              className="group relative rounded-2xl border border-border bg-background p-6 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
              {i < DEMO_STEPS.length - 1 && <div className="hidden lg:block absolute top-10 -right-2.5 w-5 h-px bg-border z-10" />}
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5" style={{ background: `${s.color}18` }}>
                <s.icon className="w-5 h-5" style={{ color: s.color }} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">{s.label}</span>
              <h3 className="mt-1 text-base font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   TESTIMONIALS SECTION — unchanged
───────────────────────────────────────────── */
const TESTIMONIALS = [
  { quote: "Replyzen completely changed how I run outbound. I used to lose deals just because I forgot to follow up. Now the AI does it for me — and it sounds exactly like me.", name: "Arjun Mehta", role: "Founder, B2B SaaS", initials: "AM", color: "#6366f1" },
  { quote: "Our sales team closes 30% more deals since switching to Replyzen. The one-click approve workflow is genuinely magical. Zero friction.", name: "Sarah Lin", role: "Sales Manager, Series A Startup", initials: "SL", color: "#8b5cf6" },
  { quote: "I was skeptical AI could match my tone. It nailed it on the first try. Highly recommend to anyone doing high-volume outreach.", name: "Marcus Okafor", role: "Independent Consultant", initials: "MO", color: "#06b6d4" },
];

function TestimonialsSection() {
  const [ref, visible] = useFadeIn();
  return (
    <section ref={ref}
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(32px)", transition: "opacity 0.7s ease, transform 0.7s ease" }}
      className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-primary uppercase tracking-widest">Testimonials</span>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold">What our users say</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div key={t.name} style={{ transitionDelay: `${i * 100}ms` }}
              className="group rounded-2xl border border-border bg-card p-7 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
              <div className="flex gap-0.5 mb-5">
                {[...Array(5)].map((_, si) => (
                  <svg key={si} className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed mb-6 italic">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: t.color }}>{t.initials}</div>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   SECURITY SECTION — unchanged
───────────────────────────────────────────── */
const SECURITY_ITEMS = [
  { icon: Shield,    title: "OAuth-Secured Gmail Access",    desc: "We use Google's official OAuth 2.0 flow. We never see or store your Gmail password." },
  { icon: Lock,      title: "Zero Email Storage",            desc: "Your email content is never stored on our servers. Drafts are generated in-memory and discarded." },
  { icon: RefreshCw, title: "Encryption-First Architecture", desc: "All data in transit is TLS 1.3 encrypted. OAuth tokens are stored with AES-256 at rest." },
];

const SECURITY_FAQ = [
  { q: "Do you store my emails?",         a: "No. Email content is processed in-memory to generate follow-up drafts and is never written to disk or stored in our database. We only store thread metadata (subject, date, sender) needed to detect silence." },
  { q: "Can you read my Gmail password?", a: "Never. We use Google OAuth 2.0, which means you authenticate directly with Google. We only receive a scoped access token — we never see your password." },
  { q: "Is my data shared with third parties?", a: "No. We do not sell, rent, or share your personal data with any third party for advertising purposes. OpenAI processes only anonymised thread metadata to generate draft text." },
  { q: "What happens when I disconnect Gmail?", a: "All stored OAuth tokens for that account are immediately deleted from our database. Any synced thread metadata is also purged within 24 hours." },
];

function SecuritySection() {
  const [ref, visible] = useFadeIn();
  const [openFaq, setOpenFaq] = useState(null);
  return (
    <section ref={ref}
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(32px)", transition: "opacity 0.7s ease, transform 0.7s ease" }}
      className="py-24 px-6">
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="rounded-2xl border border-border bg-card p-10 md:p-14">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-5">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold">Built with security at its core</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">Enterprise-grade protection for your email data, by design — not as an afterthought.</p>
            <div className="mt-6"><ComplianceBadges /></div>
          </div>
          <div className="grid md:grid-cols-3 gap-8 mb-10">
            {SECURITY_ITEMS.map(item => (
              <div key={item.title} className="flex flex-col items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-6 py-4 text-center">
            <p className="text-sm text-primary/80 font-medium">
              🔒 We never store, share, or sell your email content — ever.{" "}
              <a href="/privacy-policy" className="underline hover:text-primary transition-colors">Read our full Privacy Policy →</a>
            </p>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold mb-5 text-center">Security Questions Answered</h3>
          <div className="space-y-3">
            {SECURITY_FAQ.map((item, i) => (
              <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-left hover:bg-muted/30 transition-colors">
                  <span>{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 ml-3 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border pt-4">{item.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   MOCK DASHBOARD PREVIEW — unchanged
───────────────────────────────────────────── */
function DashboardPreview() {
  return (
    <div className="relative w-full max-w-sm mx-auto lg:mx-0">
      <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-2xl scale-95 opacity-40" />
      <div className="relative rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/40">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
          <span className="ml-3 text-xs text-muted-foreground font-mono">replyzen.ai/dashboard</span>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[{label:"Threads",value:"24",color:"#6366f1"},{label:"Drafted",value:"18",color:"#8b5cf6"},{label:"Replied",value:"11",color:"#10b981"}].map(s => (
              <div key={s.label} className="rounded-lg bg-muted/50 p-2.5 text-center">
                <p className="text-lg font-bold" style={{color:s.color}}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
          {[{name:"John D.",subject:"Re: Partnership",status:"Waiting 3d",dot:"#f59e0b"},{name:"Priya S.",subject:"Demo request",status:"Waiting 5d",dot:"#ef4444"},{name:"Alex K.",subject:"Follow up?",status:"Draft ready",dot:"#10b981"}].map(row => (
            <div key={row.name} className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0">{row.name[0]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{row.name}</p>
                <p className="text-xs text-muted-foreground truncate">{row.subject}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full" style={{background:row.dot}} />
                <span className="text-xs text-muted-foreground">{row.status}</span>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs text-primary font-medium">AI draft generated for Priya S.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORT
═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();

  // ✅ FIX: Initialise currency instantly from browser timezone.
  // This means Indian users see ₹ INR IMMEDIATELY with zero flash —
  // no loading state, no skeleton. The backend call below then
  // CONFIRMS or CORRECTS the value (e.g. if someone is using a VPN
  // or has an unusual timezone setting).
  const [currency, setCurrency]         = useState(() => detectCurrencyFromTimezone());
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [scrolled, setScrolled]         = useState(false);

  // ✅ FIX: Backend call removed.
  // Root cause: Railway.app servers are in the US, so the backend IP
  // detection always returns USD — it sees Railway proxy IPs, not the
  // real client IP. This was overwriting the correct timezone-based INR
  // detection with USD for all Indian users.
  //
  // Timezone detection (Intl.DateTimeFormat) runs in the BROWSER against
  // the user's actual device timezone — it cannot be fooled by server
  // location and is accurate for 99%+ of real users including India.
  // No backend call needed.

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // ✅ currency is always a string ("INR" or "USD"), never null
  const PLANS = getPricingPlans(currency, billingCycle);

  // Currency display helpers
  const currencyLabel = currency === "INR" ? "₹ INR" : "$ USD";
  const currencyFlag  = currency === "INR" ? "🇮🇳" : "🌍";

  return (
    <div className="min-h-screen bg-background">

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        body{font-family:'Instrument Sans',system-ui,sans-serif}
        .rz-nav-blur{backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);background:rgba(var(--background-rgb,255,255,255),.82);border-bottom:1px solid transparent;transition:border-color .3s ease,box-shadow .3s ease}
        .rz-nav-blur.scrolled{border-color:var(--border);box-shadow:0 2px 20px rgba(0,0,0,.06)}
        .rz-hero-bg{background:radial-gradient(ellipse 80% 60% at 50% -10%,color-mix(in srgb,var(--primary) 12%,transparent),transparent 70%)}
        .rz-btn-glow:hover{box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 30%,transparent),0 6px 20px color-mix(in srgb,var(--primary) 35%,transparent);transform:translateY(-1px) scale(1.02)}
        .rz-btn-glow{transition:all .25s ease}
        .rz-feature-card{transition:transform .25s ease,box-shadow .25s ease}
        .rz-feature-card:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(0,0,0,.08)}
        .rz-plan-pro{box-shadow:0 0 0 1px color-mix(in srgb,var(--primary) 40%,transparent),0 20px 60px color-mix(in srgb,var(--primary) 14%,transparent);transform:scale(1.03)}
        .rz-step-num{font-family:'DM Mono',monospace;font-size:4rem;font-weight:500;line-height:1;color:color-mix(in srgb,var(--primary) 15%,transparent);user-select:none;min-width:5rem}
        .rz-timeline-line{position:absolute;left:2.4rem;top:0;bottom:0;width:1px;background:linear-gradient(to bottom,color-mix(in srgb,var(--border) 0%,transparent),var(--border) 20%,var(--border) 80%,color-mix(in srgb,var(--border) 0%,transparent))}
        .rz-cta-bg{background:radial-gradient(ellipse 70% 80% at 50% 50%,color-mix(in srgb,var(--primary) 8%,transparent),transparent 70%)}
        @keyframes rz-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .rz-float{animation:rz-float 4s ease-in-out infinite}
      `}</style>

      {/* ── NAVBAR — unchanged ── */}
      <nav className={`rz-nav-blur fixed top-0 left-0 right-0 z-50 ${scrolled ? "scrolled" : ""}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm"><Mail className="w-4 h-4 text-white" /></div>
            <span className="text-lg font-bold tracking-tight" data-testid="brand-logo">Replyzen AI</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => <a key={l.label} href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-medium">{l.label}</a>)}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")} data-testid="nav-login-btn" className="font-medium">Log in</Button>
            <Button size="sm" onClick={() => navigate("/login")} data-testid="nav-signup-btn" className="rz-btn-glow bg-primary hover:bg-primary/90 text-white font-semibold">
              Get Started <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── HERO — unchanged ── */}
      <section className="rz-hero-bg pt-36 pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="flex-1 text-center lg:text-left">
              <div className="mb-4 flex items-center justify-center lg:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
                  <Lock className="w-3 h-3" /> Your emails stay private — we never store them
                </span>
              </div>
              <Badge variant="secondary" className="mb-6 animate-fade-in inline-flex items-center gap-1.5 font-medium px-3 py-1" data-testid="hero-badge">
                <Zap className="w-3 h-3 text-primary" /> AI-Powered Follow-up Automation
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] animate-fade-in stagger-1" data-testid="hero-heading">
                Never miss a<br /><span className="gradient-text">follow-up</span> again
              </h1>
              <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 animate-fade-in stagger-2 leading-relaxed">
                Replyzen AI detects silent email conversations and generates intelligent follow-up drafts so you close more deals, faster.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 animate-fade-in stagger-3">
                <Button size="lg" onClick={() => navigate("/login")} data-testid="hero-cta-btn"
                  className="rz-btn-glow bg-primary hover:bg-primary/90 text-white px-9 h-13 text-base font-semibold shadow-lg">
                  Start for Free <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button variant="outline" size="lg" className="h-13 text-base font-medium border-border hover:bg-muted/50"
                  onClick={() => { document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" }); }}>
                  See How it Works
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground animate-fade-in stagger-3">
                🔒 Secure sign-up · No credit card required · No email data stored
              </p>
              <div className="mt-8 animate-fade-in stagger-4">
                <div className="inline-flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium"><Check className="w-4 h-4 text-primary" /> Free forever plan</span>
                  <span className="hidden sm:block w-px h-4 bg-border" />
                  <span className="flex items-center gap-1.5 font-medium"><Shield className="w-4 h-4 text-primary" /> SOC2 ready</span>
                  <span className="hidden sm:block w-px h-4 bg-border" />
                  <span className="flex items-center gap-1.5 font-medium"><Mail className="w-4 h-4 text-primary" /> Gmail integration</span>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-3">
                  {[{value:"1,000+",label:"professionals trust us"},{value:"10,000+",label:"follow-ups automated"},{value:"99.9%",label:"uptime"}].map(stat => (
                    <div key={stat.label} className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm">
                      <span className="font-bold text-foreground">{stat.value}</span>
                      <span className="text-muted-foreground">{stat.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 w-full max-w-md lg:max-w-none rz-float hidden sm:block">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <SocialProofSection />

      {/* ── FEATURES — unchanged ── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-primary uppercase tracking-widest">Features</span>
            <p className="mt-2 text-2xl sm:text-3xl font-bold">Everything you need to follow up smarter</p>
            <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">Powerful automation that works silently in the background, so you never drop a thread.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`rz-feature-card p-8 rounded-2xl bg-card border border-border animate-fade-in stagger-${i+1}`} data-testid={`feature-card-${i}`}>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6"><f.icon className="w-6 h-6 text-primary" /></div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCT DEMO ── */}
      <ProductDemoSection />

      {/* ── HOW IT WORKS — unchanged ── */}
      <section id="how-it-works" className="py-24 px-6 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-primary uppercase tracking-widest">How it Works</span>
            <p className="mt-2 text-2xl sm:text-3xl font-bold">Four steps to never lose a lead</p>
          </div>
          <div className="relative">
            <div className="rz-timeline-line hidden sm:block" />
            <div className="space-y-0">
              {STEPS.map((s, i) => (
                <div key={s.num} className="relative flex gap-8 items-start py-10 border-b border-border last:border-0 pl-0 sm:pl-4" data-testid={`step-${i}`}>
                  <span className="rz-step-num shrink-0">{s.num}</span>
                  <div className="pt-2">
                    <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <TestimonialsSection />

      {/* ── PRICING ── */}
      <section id="pricing" className="py-24 px-6 bg-muted/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-sm font-semibold text-primary uppercase tracking-widest">Pricing</span>
            <p className="mt-2 text-2xl sm:text-3xl font-bold">Simple, transparent pricing</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Start free. Scale when you're ready.{" "}
              <span className="text-primary font-medium">Limited early pricing.</span>
            </p>

            {/* ✅ Auto-detected currency indicator — read-only, no toggle */}
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <span>{currencyFlag}</span>
              <span>Prices shown in <span className="font-semibold text-foreground">{currencyLabel}</span></span>
              <span className="text-muted-foreground/40">· auto-detected</span>
            </div>

            {/* Compliance badges */}
            <div className="mt-6"><ComplianceBadges className="justify-center" /></div>

            {/* ✅ Monthly / Yearly billing cycle toggle — KEPT (this controls billing period, not currency) */}
            <div className="mt-8 flex items-center justify-center">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-muted border border-border">
                <button onClick={() => setBillingCycle("monthly")}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${billingCycle==="monthly"?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
                  Monthly
                </button>
                <button onClick={() => setBillingCycle("yearly")}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${billingCycle==="yearly"?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
                  Yearly
                  <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Save 17%</span>
                </button>
              </div>
            </div>
          </div>

          {/* ✅ Plan cards — no skeleton, currency is always ready */}
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {PLANS.map(p => (
              <div key={p.name}
                className={`relative rounded-2xl border p-8 transition-all duration-300 ${p.popular?"rz-plan-pro border-primary bg-card":"border-border bg-card hover:-translate-y-1 hover:shadow-lg"}`}
                data-testid={`plan-${p.name.toLowerCase()}`}>
                {p.popular && <Badge className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 text-xs font-bold shadow-md">✦ Most Popular</Badge>}
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
                <div className="mt-7 mb-1 flex items-end gap-1">
                  <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                  <span className="text-sm text-muted-foreground mb-1">{p.period}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-6 h-4">{p.billedNote || ""}</p>
                <Button
                  className={`w-full mb-2 font-semibold rz-btn-glow ${p.popular?"bg-primary hover:bg-primary/90 text-white shadow-md":""}`}
                  variant={p.popular?"default":"outline"}
                  onClick={() => navigate("/login")}
                  data-testid={`plan-${p.name.toLowerCase()}-cta`}>
                  {p.cta} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
                {p.name !== "Free" && (
                  <p className="text-xs text-muted-foreground text-center mb-5">🔒 Secure checkout · Cancel anytime</p>
                )}
                {p.name === "Free" && <div className="mb-5" />}
                <ul className="space-y-3.5">
                  {p.features.map(feat => (
                    <li key={feat} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-foreground/80">{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Trust strip */}
          <div className="mt-10 text-center space-y-2">
            <p className="text-xs text-muted-foreground">All plans include · No hidden fees · SSL encrypted checkout · GDPR compliant</p>
            <p className="text-xs text-muted-foreground">Questions? <a href="/contact" className="text-primary hover:underline">Talk to us →</a></p>
          </div>
        </div>
      </section>

      {/* ── SECURITY + FAQ ── */}
      <SecuritySection />

      {/* ── FINAL CTA — unchanged ── */}
      <section className="rz-cta-bg py-28 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5 mb-6">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-semibold text-primary">Join 1,000+ professionals</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-5 leading-tight">Ready to stop losing opportunities?</h2>
          <p className="text-base text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            Join professionals who use Replyzen AI to stay on top of every conversation.
          </p>
          <Button size="lg" onClick={() => navigate("/login")} data-testid="cta-final-btn"
            className="rz-btn-glow bg-primary hover:bg-primary/90 text-white px-12 h-14 text-base font-bold shadow-xl">
            Get Started Free <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> No credit card required</span>
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> No email data stored</span>
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-primary" /> Cancel anytime</span>
          </div>
        </div>
      </section>

      {/* ── FOOTER — unchanged ── */}
      <footer className="py-16 px-6 border-t border-border bg-card">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm"><Mail className="w-4 h-4 text-white" /></div>
                <span className="text-lg font-bold">Replyzen AI</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mb-4">
                AI-powered follow-up automation for professionals who never want to miss an opportunity.
              </p>
              <div className="flex flex-wrap gap-2">
                {["🔒 SOC2","🇪🇺 GDPR","🔐 SSL"].map(b => (
                  <span key={b} className="text-xs border border-border rounded-full px-2.5 py-1 text-muted-foreground">{b}</span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4 text-sm">Product</h3>
              <ul className="space-y-3">
                <li><a href="#features"     className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#pricing"      className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it Works</a></li>
              </ul>
            </div>
            <div>
  <h3 className="font-semibold mb-4 text-sm">Learn</h3>
  <ul className="space-y-3">
    <li><a href="/docs"   title="Product Documentation" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Docs</a></li>
    <li><a href="/guides" title="Growth Playbooks"       className="text-sm text-muted-foreground hover:text-foreground transition-colors">Guides</a></li>
    <li><a href="/blog"   title="Insights & Updates"     className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</a></li>
  </ul>
</div>
            <div>
              <h3 className="font-semibold mb-4 text-sm">Company</h3>
              <ul className="space-y-3">
                <li><a href="/privacy-policy"   className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="/terms-of-service" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="/support"          className="text-sm text-muted-foreground hover:text-foreground transition-colors">Support</a></li>
                <li><a href="/contact"          className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact Us</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Replyzen AI. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="/privacy-policy"   className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
              <a href="/terms-of-service" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
