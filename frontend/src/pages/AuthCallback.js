import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token) {
      // Decode JWT payload to extract user info (no library needed)
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));

        const userData = {
          id: payload.user_id || payload.sub || "",
          email: payload.email || "",
          full_name: payload.full_name || "",
          plan: payload.plan || "free",
        };

        // Use the same localStorage keys as auth-context.js
        localStorage.setItem("replyzen_token", token);
        localStorage.setItem("replyzen_user", JSON.stringify(userData));

        // Use window.location.href so AuthProvider re-reads localStorage fresh
        window.location.href = "/dashboard";
      } catch (err) {
        console.error("Failed to parse token:", err);
        navigate("/login?error=invalid_token", { replace: true });
      }
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
