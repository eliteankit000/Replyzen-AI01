import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, Send, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Contact() {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const handleSubmit = () => {
    if (!form.name || !form.email || !form.message) return;
    window.location.href = `mailto:hello@replyzenai.com?subject=Contact from ${form.name}&body=${encodeURIComponent(form.message)}%0A%0AFrom: ${form.email}`;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </button>
        <h1 className="text-3xl font-bold mb-2">Contact Us</h1>
        <p className="text-muted-foreground mb-10">
          Have a question or feedback? We'd love to hear from you.
        </p>

        {submitted ? (
          <Card>
            <CardContent className="py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Message Sent!</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Thanks for reaching out. We'll get back to you within 24 hours.
              </p>
              <Button variant="outline" onClick={() => navigate("/")}>Back to Home</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-6 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name</label>
                <input
                  type="text"
                  placeholder="Your name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Email</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Message</label>
                <textarea
                  rows={5}
                  placeholder="How can we help you?"
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <Button
                onClick={handleSubmit}
                className="w-full bg-primary hover:bg-primary/90 text-white"
              >
                <Send className="w-4 h-4 mr-2" /> Send Message
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Or email us directly at{" "}
                <a href="mailto:hello@replyzenai.com" className="text-primary hover:underline">
                  hello@replyzenai.com
                </a>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
