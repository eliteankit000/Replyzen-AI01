import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BACKEND_URL = "https://replyzen-ai01-production.up.railway.app";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("authenticating");

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get("token");
      const errorParam = searchParams.get("error");

      // Handle error from OAuth
      if (errorParam) {
        const errorMessages = {
          access_denied: "You cancelled the sign-in process.",
          google_auth_failed: "Google authentication failed.",
          invalid_state: "Invalid authentication state. Please try again.",
          token_exchange_failed: "Failed to exchange authorization code.",
          user_creation_failed: "Failed to create user account.",
        };
        const msg = errorMessages[errorParam] || `Authentication error: ${errorParam}`;
        setError(msg);
        setStatus("error");
        toast.error(msg);
        return;
      }

      // No token provided
      if (!token) {
        setError("No authentication token received. Please try again.");
        setStatus("error");
        toast.error("No authentication token received.");
        return;
      }

      try {
        setStatus("fetching_user");
        
        // Save token first
        localStorage.setItem("replyzen_token", token);

        // Fetch full user data from /me
        const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch user data: ${response.status}`);
        }

        const userData = await response.json();
        localStorage.setItem("replyzen_user", JSON.stringify(userData));

        setStatus("success");
        toast.success(`Welcome${userData.full_name ? `, ${userData.full_name.split(" ")[0]}` : ""}! 🎉`);

        // Full page reload so AuthProvider re-reads localStorage fresh
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 500);

      } catch (err) {
        console.error("Auth callback error:", err);
        
        // Still try to proceed with basic token if user fetch fails
        if (localStorage.getItem("replyzen_token")) {
          toast.warning("Signed in, but couldn't load profile.");
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 500);
        } else {
          setError("Failed to complete authentication. Please try again.");
          setStatus("error");
          toast.error("Failed to complete authentication.");
        }
      }
    };

    handleCallback();
  }, [searchParams]);

  const handleRetry = () => {
    // Clear any stored data and go back to login
    localStorage.removeItem("replyzen_token");
    localStorage.removeItem("replyzen_user");
    navigate("/login", { replace: true });
  };

  // Error state
  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Authentication Failed</h2>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <Button onClick={handleRetry} className="bg-primary hover:bg-primary/90 text-white">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Loading states
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-2">
          <Mail className="w-6 h-6 text-white" />
        </div>
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">
          {status === "authenticating" && "Authenticating..."}
          {status === "fetching_user" && "Loading your account..."}
          {status === "success" && "Redirecting to dashboard..."}
        </p>
      </div>
    </div>
  );
}
