
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

import { Mail, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

const API_URL =
  "https://replyzen-ai01-production.up.railway.app";

function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {

  const navigate = useNavigate();
  const { login, register } = useAuth();

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

  // --------------------------------------------------
  // Google Login
  // --------------------------------------------------

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    window.location.href =
      `${API_URL}/api/auth/google/login`;
  };

  // --------------------------------------------------
  // Email Login
  // --------------------------------------------------

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {

      await login(loginEmail, loginPassword);

      toast.success("Welcome back!");
      navigate("/dashboard");

    } catch (err) {

      setError(err.response?.data?.detail || "Login failed");

    } finally {

      setLoading(false);

    }
  };

  // --------------------------------------------------
  // Register
  // --------------------------------------------------

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

      toast.success("Account created successfully");

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

        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">Replyzen AI</span>
          </div>

          <p className="text-sm text-muted-foreground mt-3">
            Never miss a follow-up again
          </p>
        </div>

        <div className="bg-card border rounded-2xl p-8 shadow-sm">

          {/* GOOGLE LOGIN */}

          <Button
            variant="outline"
            className="w-full mb-6 h-11"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
          >

            {googleLoading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <GoogleIcon className="w-5 h-5 mr-2" />
            )}

            Continue with Google

          </Button>

          <div className="relative mb-6">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 bg-card px-3 text-xs text-muted-foreground">
              or
            </span>
          </div>

          <Tabs value={tab} onValueChange={setTab}>

            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="register">Sign up</TabsTrigger>
            </TabsList>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* LOGIN TAB */}

            <TabsContent value="login">

              <form onSubmit={handleLogin} className="space-y-4">

                <div>

                  <Label>Email</Label>

                  <Input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />

                </div>

                <div>

                  <Label>Password</Label>

                  <div className="relative">

                    <Input
                      type={showPw ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />

                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>

                  </div>

                </div>

                <Button className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                  {!loading && <ArrowRight className="w-4 h-4 ml-2"/>}
                </Button>

              </form>

            </TabsContent>

            {/* REGISTER TAB */}

            <TabsContent value="register">

              <form onSubmit={handleRegister} className="space-y-4">

                <div>
                  <Label>Full Name</Label>
                  <Input
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                  />
                </div>

                <div>

                  <Label>Password</Label>

                  <Input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                  />

                </div>

                <Button className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Create account"}
                </Button>

              </form>

            </TabsContent>

          </Tabs>

        </div>

      </div>

    </div>
  );
}
