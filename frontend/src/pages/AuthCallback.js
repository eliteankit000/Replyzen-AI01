import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const BACKEND_URL = "https://replyzen-ai01-production.up.railway.app";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token) {
      // Save token first
      localStorage.setItem("replyzen_token", token);

      // Fetch full user data from /me to get name, email, plan correctly
      fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch user");
          return res.json();
        })
        .then((userData) => {
          localStorage.setItem("replyzen_user", JSON.stringify(userData));
          // Full page reload so AuthProvider re-reads localStorage fresh
          window.location.href = "/dashboard";
        })
        .catch((err) => {
          console.error("Failed to fetch user info:", err);
          // Still proceed to dashboard — name will just be missing
          window.location.href = "/dashboard";
        });
    } else {
      navigate("/login?error=google_auth_failed", { replace: true });
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}
