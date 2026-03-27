import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, Send, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import axios from "axios";

const API_URL = process.env.REACT_APP_BACKEND_URL || "https://replyzen-ai01-production.up.railway.app";

export default function Contact() {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const validateForm = () => {
    if (!form.name.trim()) {
      setError("Please enter your name");
      return false;
    }
    if (!form.email.trim()) {
      setError("Please enter your email");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Please enter a valid email address");
      return false;
    }
    if (!form.message.trim() || form.message.trim().length < 10) {
      setError("Please enter a message (at least 10 characters)");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError("");
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/contact/send`, {
        name: form.name.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
      });

      if (response.data.success) {
        setSubmitted(true);
        toast.success("Message sent successfully! 🎉");
      }
    } catch (err) {
      const errorMessage = err.response?.data?.detail || "Failed to send message. Please try again or email us directly at hello@replyzenai.com";
      setError(errorMessage);
      toast.error(errorMessage);
      console.error("Contact form error:", err);
    } finally {
      setLoading(false);
    }
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
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name</label>
                <input
                  type="text"
                  placeholder="Your name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  disabled={loading}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Email</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  disabled={loading}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Message</label>
                <textarea
                  rows={5}
                  placeholder="How can we help you? (minimum 10 characters)"
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  disabled={loading}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {form.message.length}/5000 characters
                </p>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={loading || !form.name || !form.email || !form.message}
                className="w-full bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Message
                  </>
                )}
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
