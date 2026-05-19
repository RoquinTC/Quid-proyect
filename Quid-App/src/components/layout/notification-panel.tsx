"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Bell,
  CheckCircle,
  XCircle,
  UserPlus,
  UserMinus,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  CheckCheck,
  Loader2,
  CalendarClock,
  AlertTriangle,
  Trophy,
  TrendingUp,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data: Record<string, any> | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Spanish relative time – matches the requested UX: "hace 5 min", "hace 2 horas", "ayer" */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "ahora mismo";
  if (diffMins < 60) return `hace ${diffMins} min`;
  if (diffHours < 24) return `hace ${diffHours} hora${diffHours !== 1 ? "s" : ""}`;
  if (diffDays === 1) return "ayer";
  if (diffDays < 7) return `hace ${diffDays} días`;
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} semana${Math.floor(diffDays / 7) !== 1 ? "s" : ""}`;
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
}

/** Return the icon + colour tuple for a notification type */
function getNotificationIcon(type: string, data: Record<string, any> | null) {
  switch (type) {
    case "invitation_received":
      return { Icon: UserPlus, color: "text-blue-500", bg: "bg-blue-50" };
    case "invitation_accepted":
      return { Icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50" };
    case "invitation_rejected":
      return { Icon: XCircle, color: "text-red-500", bg: "bg-red-50" };
    case "shared_transaction": {
      const isIncome = data?.transactionType === "income";
      return {
        Icon: isIncome ? ArrowDownRight : ArrowUpRight,
        color: isIncome ? "text-emerald-500" : "text-orange-500",
        bg: isIncome ? "bg-emerald-50" : "bg-orange-50",
      };
    }
    case "member_removed":
      return { Icon: UserMinus, color: "text-amber-500", bg: "bg-amber-50" };
    case "role_changed":
      return { Icon: Shield, color: "text-purple-500", bg: "bg-purple-50" };
    case "recurring_due":
      return { Icon: CalendarClock, color: "text-blue-500", bg: "bg-blue-50" };
    case "recurring_upcoming":
      return { Icon: Clock, color: "text-indigo-500", bg: "bg-indigo-50" };
    case "budget_limit":
      return { Icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50" };
    case "goal_completed":
      return { Icon: Trophy, color: "text-amber-500", bg: "bg-amber-50" };
    case "goal_near_completion":
      return { Icon: Trophy, color: "text-purple-500", bg: "bg-purple-50" };
    case "yield_ready":
      return { Icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50" };
    default:
      return { Icon: Bell, color: "text-muted-foreground", bg: "bg-muted" };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationPanel() {
  const { data: session } = useSession();
  const { addNotification } = useAppStore();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [readTimestamps, setReadTimestamps] = useState<Record<string, number>>({});

  // Filter out read notifications that were read more than 3 minutes ago (client-side fade-out)
  const READ_FADE_MS = 3 * 60 * 1000;
  const visibleNotifications = notifications.filter((n) => {
    if (!n.read) return true; // Always show unread
    // If we tracked when it was read locally, use that
    const readAt = readTimestamps[n.id];
    if (readAt) return Date.now() - readAt < READ_FADE_MS;
    // If it was already read when fetched (e.g., from server), hide if older than 3 min
    return Date.now() - new Date(n.createdAt).getTime() < READ_FADE_MS;
  });

  // ---- Fetch notifications ----
  const fetchNotifications = useCallback(async () => {
    if (!session?.user) return;
    try {
      const data = await apiFetch<{
        notifications: AppNotification[];
        unreadCount: number;
      }>("/api/notifications");
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Silently fail – polling will retry
    }
  }, [session?.user]);

  // Initial fetch + 30-second polling
  useEffect(() => {
    if (!session?.user) return;
    setLoading(true);
    fetchNotifications().finally(() => setLoading(false));

    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [session?.user, fetchNotifications]);

  // ---- Mark one as read ----
  const markAsRead = useCallback(
    async (id: string) => {
      // Optimistic update
      const now = Date.now();
      setReadTimestamps((prev) => ({ ...prev, [id]: now }));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await apiFetch(`/api/notifications/${id}/read`, { method: "PUT" });
      } catch {
        toast.error("Error al marcar como leída");
        // Revert optimistic update
        fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  // ---- Mark all as read ----
  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    const now = Date.now();
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.read ? n : { ...n, read: true }));
      // Track read timestamps for newly-read ones
      const newTimestamps: Record<string, number> = {};
      prev.forEach((n) => {
        if (!n.read) newTimestamps[n.id] = now;
      });
      setReadTimestamps((prev) => ({ ...prev, ...newTimestamps }));
      return updated;
    });
    setUnreadCount(0);

    try {
      await apiFetch("/api/notifications/read-all", { method: "PUT" });
    } catch {
      toast.error("Error al marcar todas como leídas");
      fetchNotifications();
    }
  }, [fetchNotifications]);

  // ---- Accept invitation ----
  const acceptInvitation = useCallback(
    async (notificationId: string, invitationId: string) => {
      setActionLoading((prev) => ({ ...prev, [notificationId]: true }));
      try {
        await apiFetch(`/api/invitations/${invitationId}/accept`, {
          method: "POST",
        });
        toast.success("Invitación aceptada");
        // Add client-side notification for immediate feedback
        addNotification({
          title: "Invitación aceptada",
          message: "Te has unido a la cuenta compartida correctamente.",
          type: "success",
        });
        // Delete the notification so it disappears from the panel
        try {
          await apiFetch(`/api/notifications/${notificationId}`, { method: "DELETE" });
        } catch {}
        // Remove from local state immediately
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err: any) {
        toast.error(err?.message || "Error al aceptar la invitación");
      } finally {
        setActionLoading((prev) => ({ ...prev, [notificationId]: false }));
      }
    },
    [addNotification]
  );

  // ---- Reject invitation ----
  const rejectInvitation = useCallback(
    async (notificationId: string, invitationId: string) => {
      setActionLoading((prev) => ({ ...prev, [notificationId]: true }));
      try {
        await apiFetch(`/api/invitations/${invitationId}/reject`, {
          method: "POST",
        });
        toast.success("Invitación rechazada");
        addNotification({
          title: "Invitación rechazada",
          message: "Has rechazado la invitación.",
          type: "info",
        });
        // Delete the notification so it disappears from the panel
        try {
          await apiFetch(`/api/notifications/${notificationId}`, { method: "DELETE" });
        } catch {}
        // Remove from local state immediately
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err: any) {
        toast.error(err?.message || "Error al rechazar la invitación");
      } finally {
        setActionLoading((prev) => ({ ...prev, [notificationId]: false }));
      }
    },
    [addNotification]
  );

  // ---- Derive invitationId from notification data ----
  const getInvitationId = (data: Record<string, any> | null): string | null => {
    if (!data) return null;
    return data.invitationId ?? data.invitation_id ?? null;
  };

  // ---- Render ----
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-white hover:bg-white/20"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 size-5 p-0 flex items-center justify-center bg-amber-400 text-emerald-900 text-[10px] font-bold border-0">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[calc(100vw-2rem)] sm:w-96 p-0 rounded-xl shadow-xl border-0 ring-1 ring-black/5"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-foreground">
            Notificaciones
          </h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-1 px-2"
              onClick={markAllAsRead}
            >
              <CheckCheck className="size-3.5" />
              Marcar todas como leídas
            </Button>
          )}
        </div>

        {/* List */}
        {loading && visibleNotifications.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-emerald-500" />
          </div>
        ) : visibleNotifications.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Bell className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No hay notificaciones
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Te avisaremos cuando haya algo nuevo
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="flex flex-col">
              {visibleNotifications.map((notification, idx) => {
                const { Icon, color, bg } = getNotificationIcon(
                  notification.type,
                  notification.data
                );
                const invitationId = getInvitationId(notification.data);
                const isActionLoading = actionLoading[notification.id] ?? false;
                const isInvitationPending =
                  notification.type === "invitation_received" &&
                  !!invitationId;

                return (
                  <div key={notification.id}>
                    {idx > 0 && <Separator className="mx-4" />}
                    <div
                      className={`flex gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-accent/50 ${
                        !notification.read ? "bg-emerald-50/50" : ""
                      }`}
                      onClick={() => {
                        if (!notification.read) markAsRead(notification.id);
                      }}
                    >
                      {/* Icon */}
                      <div
                        className={`size-9 shrink-0 rounded-full ${bg} flex items-center justify-center mt-0.5`}
                      >
                        <Icon className={`size-4 ${color}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm leading-snug ${
                              !notification.read
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground/80"
                            }`}
                          >
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-[11px] text-muted-foreground/60">
                          {formatRelativeTime(notification.createdAt)}
                        </p>

                        {/* Invitation action buttons */}
                        {isInvitationPending && (
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3"
                              disabled={isActionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                acceptInvitation(
                                  notification.id,
                                  invitationId!
                                );
                              }}
                            >
                              {isActionLoading ? (
                                <Loader2 className="size-3 animate-spin mr-1" />
                              ) : null}
                              Aceptar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 px-3"
                              disabled={isActionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                rejectInvitation(
                                  notification.id,
                                  invitationId!
                                );
                              }}
                            >
                              Rechazar
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Footer – only visible when there are visible notifications */}
        {visibleNotifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <p className="text-[11px] text-center text-muted-foreground/60">
              Se actualiza cada 30 segundos
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
