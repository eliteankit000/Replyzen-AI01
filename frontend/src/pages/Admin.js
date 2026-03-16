import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { isAdmin } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck, Users, CreditCard, Mail, Zap,
  Activity, AlertTriangle
} from "lucide-react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "";

async function fetchAdminStats(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const results = await Promise.allSettled([
    axios.get(`${API_BASE}/api/admin/stats`, { headers }),
  ]);

  if (results[0].status === "fulfilled") {
    return results[0].value.data;
  }
  return null;
}

const STAT_CARDS = [
  { key: "total_users",          label: "Total Users",            icon: Users,      color: "bg-blue-50 text-blue-600"   },
  { key: "active_subscriptions", label: "Active Subscriptions",   icon: CreditCard, color: "bg-green-50 text-green-600" },
  { key: "emails_connected",     label: "Emails Connected",       icon: Mail,       color: "bg-orange-50 text-orange-600"},
  { key: "followups_generated",  label: "Follow-ups Generated",   icon: Zap,        color: "bg-purple-50 text-purple-600"},
];

const COMING_SOON = [
  "User Management",
  "Subscription Monitoring",
  "Payment Logs",
  "Email Account Monitoring",
  "Follow-up Activity",
  "System Health",
];

export default function Admin() {
  const { user, token } = useAuth();
  const navigate        = useNavigate();
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  // Block non-admins client-side (server also blocks via API)
  useEffect(() => {
    if (user && !isAdmin(user.email)) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user || !isAdmin(user.email)) return;
    setLoading(true);
    fetchAdminStats(token)
      .then((data) => {
        setStats(data);
        setError(!data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user, token]);

  // Don't render anything for non-admins
  if (!user || !isAdmin(user.email)) return null;

  return (
    <div className="space-y-8" data-testid="admin-page">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <Badge className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5">
              ADMIN
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            System overview — logged in as {user.email}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Could not load live stats. The <code className="font-mono text-xs">/api/admin/stats</code> endpoint may not exist yet — see setup note below.
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {STAT_CARDS.map(({ key, label, icon: Icon, color }) => (
          <Card key={key}>
            <CardContent className="pt-6 pb-5 flex flex-col gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              {loading ? (
                <Skeleton className="h-9 w-20" />
              ) : (
                <div>
                  <p className="text-3xl font-bold">
                    {stats?.[key] !== undefined
                      ? Number(stats[key]).toLocaleString()
                      : "—"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{label}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity indicator */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Coming Soon</h2>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {COMING_SOON.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Setup note for backend */}
      <div className="text-xs text-muted-foreground border rounded-lg px-4 py-3 bg-muted/30 space-y-1">
        <p className="font-medium text-foreground">Backend setup needed</p>
        <p>Add this endpoint to your FastAPI backend so live stats load:</p>
        <code className="block mt-1 font-mono bg-muted rounded px-2 py-1 text-xs">
          GET /api/admin/stats → {"{ total_users, active_subscriptions, emails_connected, followups_generated }"}
        </code>
      </div>

    </div>
  );
}
