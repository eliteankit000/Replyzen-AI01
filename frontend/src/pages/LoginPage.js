import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Mail, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register, loginWithGoogle, getGoogleAuthUrl } = useAuth();
  const [tab, setTab] = useState("login");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  // ✅ FIX: Check for OAuth callback — Google returns ?code=...&state=google_auth
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    // Only handle if it's our google_auth state (not Gmail connect flow)
    if (code && state === "google_auth") {
      handleGoogleCallback(code);
    }
  }, [searchParams]);

  const handleGoogleCallback = async (code) => {
    setGoogleLoading(true);
    setError("");
    try {
      const redirectUri = `${window.location.origin}/login`;
      const { user, isNewUser } = await loginWithGoogle(code, redirectUri);

      if (isNewUser) {
        toast.success(`Welcome to Replyzen AI, ${user.full_name || user.email}!`);
      } else {
        toast.success(`Welcome back, ${user.full_name || user.email}!`);
      }

      window.history.replaceState({}, document.title, "/login");
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Google authentication failed. Please try again.");
      window.history.replaceState({}, document.title, "/login");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError("");
    try {
      const redirectUri = `${window.location.origin}/login`;

      // ✅ FIX: Pass state=google_auth as part of redirectUri query,
      // so Google echoes it back and we can detect the callback.
      // We build the full redirect with state BEFORE calling backend,
      // then the backend appends it to the Google URL via the state param.
      const authUrl = await getGoogleAuthUrl(redirectUri);

      if (!authUrl) {
        throw new Error("No auth URL returned from server");
      }

      // ✅ FIX: Replace the state param that backend set (user_id) with "google_auth"
      // so our useEffect can detect the callback correctly.
      // Backend sets state= in the URL — we override it here for login flow.
      const urlObj = new URL(authUrl);
      urlObj.searchParams.set("state", "google_auth");

      window.location.href = urlObj.toString();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Failed to initiate Google login");
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(loginEmail, loginPassword);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (regPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await register(regEmail, regPassword, regName);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Replyzen AI</span>
          </div>
          <p className="text-sm text-muted-foreground mt-3">Never miss a follow-up again</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm animate-fade-in stagger-1">

          {/* Google Login Button */}
          <Button
            type="button"
            variant="outline"
            className="w-full mb-6 h-11"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            data-testid="google-login-btn"
          >
            {googleLoading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <GoogleIcon className="w-5 h-5 mr-2" />
            )}
            {googleLoading ? "Connecting to Google..." : "Continue with Google"}
          </Button>

          <div className="relative mb-6">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
              or
            </span>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login" data-testid="login-tab">Log in</TabsTrigger>
              <TabsTrigger value="register" data-testid="register-tab">Sign up</TabsTrigger>
            </TabsList>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm" data-testid="auth-error">
                {error}
              </div>
            )}

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="login-email" className="text-sm">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@company.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="mt-1.5"
                    data-testid="login-email-input"
                  />
                </div>
                <div>
                  <Label htmlFor="login-password" className="text-sm">Password</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="login-password"
                      type={showPw ? "text" : "password"}
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      data-testid="login-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-white"
                  disabled={loading || googleLoading}
                  data-testid="login-submit-btn"
                >
                  {loading ? "Signing in..." : "Sign in"}
                  {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <Label htmlFor="reg-name" className="text-sm">Full Name</Label>
                  <Input
                    id="reg-name"
                    type="text"
                    placeholder="John Doe"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                    className="mt-1.5"
                    data-testid="register-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="reg-email" className="text-sm">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="you@company.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                    className="mt-1.5"
                    data-testid="register-email-input"
                  />
                </div>
                <div>
                  <Label htmlFor="reg-password" className="text-sm">Password</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="reg-password"
                      type={showPw ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                      data-testid="register-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-white"
                  disabled={loading || googleLoading}
                  data-testid="register-submit-btn"
                >
                  {loading ? "Creating account..." : "Create account"}
                  {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
