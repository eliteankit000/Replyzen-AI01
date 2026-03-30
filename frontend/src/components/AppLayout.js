import { useState, useEffect, useCallback } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { isAnalyticsAllowed } from "@/lib/plan-utils";
import { isAdmin } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard, BarChart3, CreditCard,
  Settings, LogOut, Mail, ChevronLeft, ChevronRight, User, Menu, Lock,
  ShieldCheck, Inbox, PenSquare, Cpu, Bell
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/dashboard",      label: "Action Center",    icon: LayoutDashboard },
  { path: "/inbox",          label: "AI Inbox",         icon: Inbox },
  { path: "/compose",        label: "Composer",         icon: PenSquare },
  { path: "/analytics",      label: "Analytics",        icon: BarChart3 },
  { path: "/control-center", label: "AI Control",       icon: Cpu },
  { path: "/billing",        label: "Billing",          icon: CreditCard },
];

function SidebarNav({ collapsed, items, userPlan, onNavigate }) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
      {items.map((item) => {
        const locked = item.gated && !isAnalyticsAllowed(userPlan);
        return (
          <Tooltip key={item.path} delayDuration={collapsed ? 100 : 999999}>
            <TooltipTrigger asChild>
              <NavLink
                to={item.path}
                onClick={() => { if (onNavigate) onNavigate(); }}
                className={({ isActive }) =>
                  `sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                    isActive
                      ? "bg-accent text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  } ${collapsed ? "justify-center" : ""} ${locked ? "opacity-60" : ""}`
                }
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <item.icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {!collapsed && locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
              </NavLink>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" className="text-xs">
                {item.label} {locked && "(Pro)"}
              </TooltipContent>
            )}
          </Tooltip>
        );
      })}
    </nav>
  );
}

function SidebarBrand({ collapsed }) {
  return (
    <div className="h-16 flex items-center px-4 border-b border-border shrink-0">
      <div className={`flex items-center gap-2.5 transition-all duration-200 overflow-hidden ${collapsed ? "justify-center w-full" : ""}`}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-base font-bold tracking-tight whitespace-nowrap">
            Replyzen AI
          </span>
        )}
      </div>
    </div>
  );
}

// ✅ FIXED: Shows Google profile picture if available, falls back to initials
function UserAvatar({ user, size = "w-8 h-8" }) {
  const [imgError, setImgError] = useState(false);

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0] || "U").toUpperCase();

  if (user?.avatar_url && !imgError) {
    return (
      <img
        src={user.avatar_url}
        alt={user.full_name || "User"}
        className={`${size} rounded-full object-cover shrink-0 ring-1 ring-border`}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <Avatar className={`${size} shrink-0`}>
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

function SidebarUserMenu({ collapsed, user, onLogout, navigate }) {
  return (
    <div className="px-2 py-3 border-t border-border shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors ${collapsed ? "justify-center" : ""}`}
            data-testid="user-menu-trigger"
          >
            {/* ✅ Google avatar or initials fallback */}
            <UserAvatar user={user} size="w-8 h-8" />
            {!collapsed && (
              <div className="text-left min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{user?.full_name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate capitalize">{user?.plan || "free"} Plan</p>
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Avatar + name at top of dropdown */}
          <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border mb-1">
            <UserAvatar user={user} size="w-9 h-9" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-profile">
            <User className="w-4 h-4 mr-2" /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/billing")} data-testid="menu-billing">
            <CreditCard className="w-4 h-4 mr-2" /> Billing
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout} className="text-destructive" data-testid="menu-logout">
            <LogOut className="w-4 h-4 mr-2" /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const userPlan = user?.plan || "free";

  const navItems = isAdmin(user?.email)
    ? [...NAV_ITEMS, { path: "/admin", label: "Admin Panel", icon: ShieldCheck }]
    : NAV_ITEMS;

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/");
  }, [logout, navigate]);

  const sidebarWidth  = collapsed ? "w-[68px]"  : "w-[260px]";
  const sidebarMargin = collapsed ? "md:ml-[68px]" : "md:ml-[260px]";

  return (
    <TooltipProvider>
      <div className="min-h-screen" data-testid="app-layout">

        {/* Desktop Sidebar */}
        <aside
          className={`hidden md:flex flex-col fixed top-0 left-0 h-screen ${sidebarWidth} bg-card border-r border-border transition-[width] duration-200 ease-in-out z-30`}
          data-testid="sidebar"
        >
          <SidebarBrand collapsed={collapsed} />
          <SidebarNav collapsed={collapsed} items={navItems} userPlan={userPlan} />
          <div className="px-2 py-1 shrink-0">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-full flex items-center justify-center py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              data-testid="sidebar-toggle"
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
          <SidebarUserMenu collapsed={collapsed} user={user} onLogout={handleLogout} navigate={navigate} />
        </aside>

        {/* Main content */}
        <div className={`flex flex-col min-h-screen transition-[margin-left] duration-200 ease-in-out ${sidebarMargin}`}>

          {/* Mobile top bar */}
          <header className="md:hidden h-14 flex items-center justify-between px-4 border-b border-border bg-card sticky top-0 z-20 shrink-0">
            <div className="flex items-center gap-2">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0" data-testid="mobile-menu-btn">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[260px] p-0">
                  <div className="flex flex-col h-full">
                    <SidebarBrand collapsed={false} />
                    <SidebarNav collapsed={false} items={navItems} userPlan={userPlan} onNavigate={() => setMobileOpen(false)} />
                    <SidebarUserMenu collapsed={false} user={user} onLogout={handleLogout} navigate={navigate} />
                  </div>
                </SheetContent>
              </Sheet>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                  <Mail className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-bold">Replyzen AI</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Notification bell */}
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
              </Button>
              <UserAvatar user={user} size="w-8 h-8" />
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1">
            <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
