import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { isAdmin } from "@/lib/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, Users, CreditCard, Mail, Zap,
  AlertTriangle, RefreshCw, Search, ChevronLeft,
  ChevronRight, Activity, CheckCircle, XCircle, Trash2
} from "lucide-react";
import api from "@/lib/api";

const TABS = [
  { key: "overview",      label: "Overview",       icon: Activity   },
  { key: "users",         label: "Users",          icon: Users      },
  { key: "subscriptions", label: "Subscriptions",  icon: CreditCard },
  { key: "emails",        label: "Email Accounts", icon: Mail       },
  { key: "followups",     label: "Follow-ups",     icon: Zap        },
  { key: "health",        label: "System Health",  icon: ShieldCheck},
];

const STAT_CARDS = [
  { key: "total_users",          label: "Total Users",          icon: Users,      bg: "bg-orange-50", text: "text-orange-500" },
  { key: "active_subscriptions", label: "Active Subscriptions", icon: CreditCard, bg: "bg-orange-50", text: "text-orange-500" },
  { key: "emails_connected",     label: "Emails Connected",     icon: Mail,       bg: "bg-orange-50", text: "text-orange-500" },
  { key: "followups_generated",  label: "Follow-ups Generated", icon: Zap,        bg: "bg-orange-50", text: "text-orange-500" },
];

function StatCard({ label, icon: Icon, bg, text, value, loading }) {
  return (
    <Card>
      <CardContent className="pt-6 pb-5 flex flex-col gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bg}`}>
          <Icon className={`w-5 h-5 ${text}`} />
        </div>
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : (
          <div>
            <p className="text-3xl font-bold">
              {value !== undefined ? Number(value).toLocaleString() : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
      <p className="text-sm text-muted-foreground">Page {page} of {pages}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page === 1}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page === pages}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ value }) {
  const active = value === "active" || value === true || value === "sent";
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
      active ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
    }`}>
      {active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {String(value)}
    </span>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/stats")
      .then(r => { setStats(r.data); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      {error && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Could not load stats from backend.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {STAT_CARDS.map(({ key, label, icon, bg, text }) => (
          <StatCard key={key} label={label} icon={icon} bg={bg} text={text}
            value={stats?.[key]} loading={loading} />
        ))}
      </div>
    </div>
  );
}

// ─── USERS TAB ────────────────────────────────────────────────────────────────
function UsersTab() {
  // ✅ FIX: Pull patchUser + current user from auth context.
  //
  // THE ROOT CAUSE:
  // refreshUser() calls authAPI.getMe() and then setUser(). But if getMe()
  // fails for ANY reason (network blip, CORS, token issue), the catch{} block
  // swallows the error and setUser() is never called — so the sidebar never
  // updates. This is why the sidebar stubbornly shows "Free Plan" even after
  // the DB was correctly updated.
  //
  // THE FIX — two-step approach:
  //
  // Step 1 (patchUser): Directly merge { plan } into the React context state.
  // This is a pure synchronous state update — it CANNOT fail. It updates the
  // sidebar immediately the instant the PATCH request returns 200.
  //
  // Step 2 (refreshUser): Also re-fetch from the backend as a background sync
  // so all other user fields (full_name, email, etc.) stay fresh. If this fails
  // it doesn't matter because Step 1 already updated the plan.
  const { user: currentUser, patchUser, refreshUser } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback((p = 1, s = "") => {
    setLoading(true);
    api.get("/admin/users", { params: { page: p, limit: 20, search: s || undefined } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(page, search); }, [page, search, load]);

  const handleSearch = () => { setPage(1); setSearch(searchInput); };

  const handleDelete = async (userId) => {
    if (!window.confirm("Delete this user? This cannot be undone.")) return;
    await api.delete(`/admin/users/${userId}`);
    load(page, search);
  };

  const handlePlanChange = async (userId, plan) => {
    // 1. Save to DB
    await api.patch(`/admin/users/${userId}/plan`, { plan });

    // 2. Find the user row we just updated from the current table data
    const updatedRow = data?.users?.find(u => String(u.id) === String(userId));

    // 3. ✅ KEY FIX: If the admin just updated their OWN account, immediately
    //    patch the auth context so the sidebar re-renders right now.
    //    We compare by email (stable identifier) because id formats can differ
    //    between the admin_users view and the JWT user_id.
    if (updatedRow && updatedRow.email === currentUser?.email) {
      patchUser({ plan });
    }

    // 4. Also fire refreshUser in the background to sync all fields from DB.
    //    Even if this fails silently, Step 3 already fixed the sidebar.
    if (typeof refreshUser === "function") {
      refreshUser().catch(() => {});
    }

    // 5. Reload the admin table
    load(page, search);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Search by email or name..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button size="sm" onClick={handleSearch} className="bg-primary hover:bg-primary/90 text-white">
          Search
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Joined</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      ))}
                    </tr>
                  ))
                ) : data?.users?.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No users found</td></tr>
                ) : (
                  data?.users?.map(u => (
                    <tr key={u.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{u.full_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.plan || "free"}
                          onChange={e => handlePlanChange(u.id, e.target.value)}
                          className="text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                        >
                          <option value="free">free</option>
                          <option value="pro">pro</option>
                          <option value="business">business</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={u.is_active ?? true} /></td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(u.id)} className="text-red-500 hover:text-red-600 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <Pagination page={page} pages={data?.pages || 1} onPage={setPage} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── SUBSCRIPTIONS TAB ────────────────────────────────────────────────────────
function SubscriptionsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const load = useCallback((p = 1, s = "") => {
    setLoading(true);
    api.get("/admin/subscriptions", { params: { page: p, limit: 20, status: s || undefined } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(page, status); }, [page, status, load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => load(page, status)} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expires</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      ))}
                    </tr>
                  ))
                ) : data?.subscriptions?.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No subscriptions found</td></tr>
                ) : (
                  data?.subscriptions?.map(s => (
                    <tr key={s.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{s.full_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-medium capitalize">{s.plan}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={s.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <Pagination page={page} pages={data?.pages || 1} onPage={setPage} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── EMAIL ACCOUNTS TAB ───────────────────────────────────────────────────────
function EmailAccountsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback((p = 1) => {
    setLoading(true);
    api.get("/admin/email-accounts", { params: { page: p, limit: 20 } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Provider</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Connected</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : data?.email_accounts?.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No email accounts found</td></tr>
              ) : (
                data?.email_accounts?.map(e => (
                  <tr key={e.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{e.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-medium capitalize">{e.provider || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.user_email || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.created_at ? new Date(e.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge value={e.is_active ?? true} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} pages={data?.pages || 1} onPage={setPage} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── FOLLOWUPS TAB ────────────────────────────────────────────────────────────
function FollowupsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback((p = 1) => {
    setLoading(true);
    api.get("/admin/followups", { params: { page: p, limit: 20 } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : data?.followups?.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No follow-ups found</td></tr>
              ) : (
                data?.followups?.map(f => (
                  <tr key={f.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{f.user_email || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge value={f.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {f.created_at ? new Date(f.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {f.sent_at ? new Date(f.sent_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} pages={data?.pages || 1} onPage={setPage} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SYSTEM HEALTH TAB ────────────────────────────────────────────────────────
function HealthTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api.get("/admin/health")
      .then(r => {
        if (typeof r.data === "object" && !Array.isArray(r.data)) {
          setData(r.data);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const STATUS_ITEMS = data ? [
    { label: "Database", value: data.database },
    { label: "API",      value: data.api      },
  ] : [];
  const TABLE_COUNTS = data?.table_counts ? Object.entries(data.table_counts) : [];
  const ORIGINS = data?.allowed_origins || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      {error && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Could not load health data.
        </div>
      )}
      <div>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Service Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}><CardContent className="py-5"><Skeleton className="h-6 w-32" /></CardContent></Card>
            ))
          ) : (
            STATUS_ITEMS.map(({ label, value }) => (
              <Card key={label}>
                <CardContent className="py-4 flex items-center justify-between">
                  <p className="text-sm font-medium">{label}</p>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                    value === "ok" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"
                  }`}>
                    {value === "ok" ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {value}
                  </span>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Database Table Counts</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="py-5"><Skeleton className="h-8 w-20" /></CardContent></Card>
            ))
          ) : TABLE_COUNTS.length === 0 ? (
            <p className="text-sm text-muted-foreground col-span-4">No table data available.</p>
          ) : (
            TABLE_COUNTS.map(([table, count]) => (
              <Card key={table}>
                <CardContent className="pt-5 pb-4 flex flex-col gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-orange-500" />
                  </div>
                  <p className="text-2xl font-bold">
                    {typeof count === "number" ? count.toLocaleString() : count}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{table.replace(/_/g, " ")}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Allowed CORS Origins</h2>
        <Card>
          <CardContent className="py-4">
            {loading ? <Skeleton className="h-24 w-full" /> : ORIGINS.length === 0 ? (
              <p className="text-sm text-muted-foreground">No origins configured.</p>
            ) : (
              <ul className="space-y-2">
                {ORIGINS.map(origin => (
                  <li key={origin} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    <code className="font-mono text-xs text-muted-foreground">{origin}</code>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── MAIN ADMIN PAGE ──────────────────────────────────────────────────────────
export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (user && !isAdmin(user.email)) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  if (!user || !isAdmin(user.email)) return null;

  const renderTab = () => {
    switch (activeTab) {
      case "overview":      return <OverviewTab />;
      case "users":         return <UsersTab />;
      case "subscriptions": return <SubscriptionsTab />;
      case "emails":        return <EmailAccountsTab />;
      case "followups":     return <FollowupsTab />;
      case "health":        return <HealthTab />;
      default:              return <OverviewTab />;
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-page">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <Badge className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5">ADMIN</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Logged in as {user.email}</p>
        </div>
      </div>
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
      {renderTab()}
    </div>
  );
}
