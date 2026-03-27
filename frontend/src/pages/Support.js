import { useNavigate } from "react-router-dom";
import { Mail, MessageCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Support() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>
        <h1 className="text-3xl font-bold mb-2">Support</h1>
        <p className="text-muted-foreground mb-10">
          We're here to help. Reach out and we'll get back to you as soon as possible.
        </p>
        <div className="grid gap-4">
          <Card>
            <CardContent className="py-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Email Support</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Send us an email and we'll respond within 24 hours.
                </p>
                <a href="mailto:hello@replyzenai.com" className="text-sm text-primary font-medium hover:underline">
                  hello@replyzenai.com
                </a>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Common Questions</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Browse answers to the most frequently asked questions.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• How do I connect my Gmail account?</li>
                  <li>• How does AI generate follow-ups?</li>
                  <li>• How do I cancel my subscription?</li>
                  <li>• Is my email data secure?</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-8 text-center">
          <Button onClick={() => navigate("/login")} className="bg-primary hover:bg-primary/90 text-white">
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
