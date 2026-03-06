import { useState, useEffect } from "react";
import { analyticsAPI } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Send, Zap, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart } from "recharts";

export default function Analytics() {
  const [overview, setOverview] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [topContacts, setTopContacts] = useState([]);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, chartRes, contactsRes] = await Promise.all([
        analyticsAPI.getOverview(),
        analyticsAPI.getFollowupsOverTime(parseInt(period)),
        analyticsAPI.getTopContacts(),
      ]);
      setOverview(overviewRes.data);
      setChartData(chartRes.data || []);
      setTopContacts(contactsRes.data || []);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: "Follow-ups Sent", value: overview?.followups_sent || 0, icon: Send, trend: "+12%", color: "text-emerald-600" },
    { label: "Pending Drafts", value: overview?.followups_pending || 0, icon: Zap, trend: null, color: "text-amber-600" },
    { label: "Response Rate", value: `${overview?.response_rate || 0}%`, icon: TrendingUp, trend: "+5%", color: "text-primary" },
    { label: "Threads Tracked", value: overview?.total_threads || 0, icon: BarChart3, trend: null, color: "text-blue-600" },
  ];

  return (
    <div className="space-y-8" data-testid="analytics-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="analytics-heading">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your follow-up performance</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36" data-testid="period-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <Card key={s.label} className="animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }} data-testid={`analytics-stat-${i}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                {s.trend && <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">{s.trend}</Badge>}
              </div>
              {loading ? <Skeleton className="h-8 w-20" /> : <p className="text-2xl font-bold">{s.value}</p>}
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Follow-ups Over Time Chart */}
        <Card className="lg:col-span-2" data-testid="followups-chart">
          <CardHeader>
            <CardTitle className="text-base">Follow-ups Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(21, 90%, 48%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(21, 90%, 48%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(160, 60%, 45%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(160, 60%, 45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 10%, 88%)" />
                  <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Area type="monotone" dataKey="generated" stroke="hsl(21, 90%, 48%)" fill="url(#genGrad)" strokeWidth={2} name="Generated" />
                  <Area type="monotone" dataKey="sent" stroke="hsl(160, 60%, 45%)" fill="url(#sentGrad)" strokeWidth={2} name="Sent" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                No data yet. Generate and send follow-ups to see trends.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Contacts */}
        <Card data-testid="top-contacts">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Top Contacts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : topContacts.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No contacts yet
              </div>
            ) : (
              <div className="space-y-3">
                {topContacts.map((c, i) => (
                  <div key={c.email} className="flex items-center justify-between" data-testid={`contact-${i}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">{c.count} sent</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
