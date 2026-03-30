import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bell,
  Users,
  Clock,
  AlertTriangle,
  Mail,
  CheckCircle,
  RefreshCw,
  Inbox,
  X,
} from "lucide-react";
import { toast } from "sonner";

const NOTIFICATION_ICONS = {
  potential_client: { icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
  followup_required: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  high_priority: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  gmail_disconnected: { icon: Mail, color: "text-red-600", bg: "bg-red-50" },
  sync_complete: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationsAPI.getAll(20, false);
      if (res.data.success) {
        setNotifications(res.data.data.notifications || []);
        setUnreadCount(res.data.data.unread_count || 0);
      }
    } catch (err) {
      console.error("[Notifications] Failed to load:", err);
    }
  }, []);

  // Load notifications on mount and periodically
  useEffect(() => {
    loadNotifications();
    
    // Poll every 30 seconds for new notifications
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Reload when popover opens
  useEffect(() => {
    if (open) {
      loadNotifications();
    }
  }, [open, loadNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAsRead(null, true);
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success("All marked as read");
    } catch (err) {
      toast.error("Failed to mark as read");
    }
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read
    if (!notification.is_read) {
      try {
        await notificationsAPI.markAsRead(notification.id);
        setUnreadCount(prev => Math.max(0, prev - 1));
        setNotifications(prev =>
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
      } catch (err) {
        console.error(err);
      }
    }

    // Navigate based on type
    if (notification.email_id) {
      navigate(`/inbox?selected=${notification.email_id}`);
    } else if (notification.type === "gmail_disconnected") {
      navigate("/control-center");
    } else {
      navigate("/inbox");
    }
    
    setOpen(false);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = (now - date) / 1000 / 60; // minutes
    
    if (diff < 1) return "Just now";
    if (diff < 60) return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 bg-red-500 text-white text-[10px] font-bold"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80 p-0" align="end">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="h-7 text-xs text-muted-foreground hover:text-primary"
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* Notifications list */}
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4">
              <Inbox className="w-10 h-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            notifications.map(notification => {
              const config = NOTIFICATION_ICONS[notification.type] || NOTIFICATION_ICONS.sync_complete;
              const Icon = config.icon;
              
              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`
                    flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-border last:border-0
                    ${notification.is_read ? "bg-background" : "bg-primary/5"}
                    hover:bg-muted/50
                  `}
                >
                  <div className={`p-2 rounded-full ${config.bg} shrink-0`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${notification.is_read ? "" : "font-semibold"}`}>
                        {notification.title}
                      </p>
                      {!notification.is_read && (
                        <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {notification.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatTime(notification.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate("/inbox");
                setOpen(false);
              }}
              className="w-full text-xs text-muted-foreground hover:text-primary"
            >
              View all in Inbox
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
