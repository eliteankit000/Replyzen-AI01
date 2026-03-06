import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail, Zap, BarChart3, Clock, ArrowRight, Check,
  MessageSquare, Send, Shield, ChevronRight
} from "lucide-react";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
];

const FEATURES = [
  {
    icon: Clock,
    title: "Silence Detection",
    desc: "Automatically detects email threads where you're waiting for a reply. Configurable delay thresholds from 1-10 days.",
  },
  {
    icon: Zap,
    title: "AI Follow-ups",
    desc: "GPT-4o generates context-aware follow-up drafts matching your preferred tone: professional, friendly, or casual.",
  },
  {
    icon: Send,
    title: "One-Click Send",
    desc: "Review AI drafts, edit if needed, and send directly through Gmail. No copy-pasting or app switching.",
  },
  {
    icon: BarChart3,
    title: "Smart Analytics",
    desc: "Track follow-up success rates, response patterns, and optimize your outreach with actionable insights.",
  },
];

const STEPS = [
  { num: "01", title: "Connect Gmail", desc: "Link your Gmail account securely with OAuth. Your data stays encrypted." },
  { num: "02", title: "Detect Silence", desc: "Our engine scans your threads and finds conversations gone quiet." },
  { num: "03", title: "AI Drafts", desc: "Get intelligent follow-up drafts generated from your conversation context." },
  { num: "04", title: "Send & Track", desc: "Review, edit, and send. Track responses and optimize your follow-up game." },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Get started",
    features: ["5 follow-ups/month", "1 email account", "Basic AI drafts", "Manual sending"],
    cta: "Start Free",
    popular: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    desc: "For professionals",
    features: ["100 follow-ups/month", "3 email accounts", "Advanced AI tones", "Auto-send", "Analytics", "Priority support"],
    cta: "Get Pro",
    popular: true,
  },
  {
    name: "Business",
    price: "$49",
    period: "/month",
    desc: "For teams",
    features: ["Unlimited follow-ups", "10 email accounts", "All AI tones", "Auto-send", "Advanced analytics", "Team collaboration", "API access", "Dedicated support"],
    cta: "Get Business",
    popular: false,
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight" data-testid="brand-logo">Replyzen AI</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a key={l.label} href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")} data-testid="nav-login-btn">Log in</Button>
            <Button size="sm" onClick={() => navigate("/login")} data-testid="nav-signup-btn" className="bg-primary hover:bg-primary/90 text-white">
              Get Started <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-gradient pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6 animate-fade-in" data-testid="hero-badge">
            <Zap className="w-3 h-3 mr-1" /> AI-Powered Follow-up Automation
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight animate-fade-in stagger-1" data-testid="hero-heading">
            Never miss a<br />
            <span className="gradient-text">follow-up</span> again
          </h1>
          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto animate-fade-in stagger-2">
            Replyzen AI detects silent email conversations and generates intelligent follow-up drafts so you close more deals, faster.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in stagger-3">
            <Button size="lg" onClick={() => navigate("/login")} data-testid="hero-cta-btn" className="bg-primary hover:bg-primary/90 text-white px-8 h-12 text-base">
              Start for Free <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button variant="outline" size="lg" className="h-12 text-base" onClick={() => { const el = document.getElementById("how-it-works"); el?.scrollIntoView({ behavior: "smooth" }); }}>
              See How it Works
            </Button>
          </div>
          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-muted-foreground animate-fade-in stagger-4">
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-primary" /> Free forever plan</span>
            <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-primary" /> SOC2 ready</span>
            <span className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-primary" /> Gmail integration</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-base md:text-lg font-semibold text-primary mb-2">Features</h2>
            <p className="text-2xl sm:text-3xl font-bold">Everything you need to follow up smarter</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`feature-card p-8 rounded-xl bg-card border border-border animate-fade-in stagger-${i + 1}`} data-testid={`feature-card-${i}`}>
                <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-5">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24 px-6 bg-card">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-base md:text-lg font-semibold text-primary mb-2">How it Works</h2>
            <p className="text-2xl sm:text-3xl font-bold">Four steps to never lose a lead</p>
          </div>
          <div className="space-y-0">
            {STEPS.map((s, i) => (
              <div key={s.num} className="flex gap-6 items-start py-8 border-b border-border last:border-0" data-testid={`step-${i}`}>
                <span className="text-4xl font-bold text-primary/20 shrink-0 w-16">{s.num}</span>
                <div>
                  <h3 className="text-lg font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-base md:text-lg font-semibold text-primary mb-2">Pricing</h2>
            <p className="text-2xl sm:text-3xl font-bold">Simple, transparent pricing</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-xl border p-8 ${p.popular ? "border-primary bg-card shadow-lg ring-1 ring-primary/20" : "border-border bg-card"}`}
                data-testid={`plan-${p.name.toLowerCase()}`}
              >
                {p.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white">Most Popular</Badge>
                )}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
                <div className="mt-6 mb-6">
                  <span className="text-4xl font-bold">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
                <Button
                  className={`w-full mb-6 ${p.popular ? "bg-primary hover:bg-primary/90 text-white" : ""}`}
                  variant={p.popular ? "default" : "outline"}
                  onClick={() => navigate("/login")}
                  data-testid={`plan-${p.name.toLowerCase()}-cta`}
                >
                  {p.cta} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
                <ul className="space-y-3">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 bg-card">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to stop losing opportunities?</h2>
          <p className="text-base text-muted-foreground mb-8">Join professionals who use Replyzen AI to stay on top of every conversation.</p>
          <Button size="lg" onClick={() => navigate("/login")} data-testid="cta-final-btn" className="bg-primary hover:bg-primary/90 text-white px-8 h-12 text-base">
            Get Started Free <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border">
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
