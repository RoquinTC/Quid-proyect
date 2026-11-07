"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  Fuel,
  Wrench,
  FileText,
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
      return { Icon: UserPlus, color: "text-blue-600 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-950/60" };
    case "invitation_accepted":
      return { Icon: CheckCircle, color: "text-emerald-600 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/60" };
    case "invitation_rejected":
      return { Icon: XCircle, color: "text-red-600 dark:text-red-300", bg: "bg-red-50 dark:bg-red-950/60" };
    case "shared_transaction": {
      const isIncome = data?.transactionType === "income";
      return {
        Icon: isIncome ? ArrowDownRight : ArrowUpRight,
        color: isIncome ? "text-emerald-600 dark:text-emerald-300" : "text-orange-600 dark:text-orange-300",
        bg: isIncome ? "bg-emerald-50 dark:bg-emerald-950/60" : "bg-orange-50 dark:bg-orange-950/60",
      };
    }
    case "member_removed":
      return { Icon: UserMinus, color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/60" };
    case "role_changed":
      return { Icon: Shield, color: "text-purple-600 dark:text-purple-300", bg: "bg-purple-50 dark:bg-purple-950/60" };
    case "recurring_due":
      return { Icon: CalendarClock, color: "text-blue-600 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-950/60" };
    case "recurring_upcoming":
      return { Icon: Clock, color: "text-indigo-600 dark:text-indigo-300", bg: "bg-indigo-50 dark:bg-indigo-950/60" };
    case "transport_fuel_low":
      return { Icon: Fuel, color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/60" };
    case "transport_maintenance_due":
      return { Icon: Wrench, color: "text-cyan-600 dark:text-cyan-300", bg: "bg-cyan-50 dark:bg-cyan-950/60" };
    case "transport_document_due":
      return { Icon: FileText, color: "text-rose-600 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-950/60" };
    case "transport_custom_reminder_due":
      return { Icon: Clock, color: "text-cyan-600 dark:text-cyan-300", bg: "bg-cyan-50 dark:bg-cyan-950/60" };
    case "budget_limit":
      return { Icon: AlertTriangle, color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/60" };
    case "goal_completed":
      return { Icon: Trophy, color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/60" };
    case "goal_near_completion":
      return { Icon: Trophy, color: "text-purple-600 dark:text-purple-300", bg: "bg-purple-50 dark:bg-purple-950/60" };
    case "yield_ready":
      return { Icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/60" };
    default:
      return { Icon: Bell, color: "text-muted-foreground", bg: "bg-muted" };
  }
}

// ---------------------------------------------------------------------------
// Destino
// ---------------------------------------------------------------------------

/**
 * A dónde lleva tocar una notificación.
 *
 * Antes el toque solo marcaba como leída; ahora además navega al módulo y a la
 * sub-sección donde está el asunto, que es lo que la persona quiere al tocar.
 */
function destinationFor(
  type: string,
): { module: "dashboard" | "finance" | "transport" | "health" | "pantry"; finance?: string; health?: string } | null {
  switch (type) {
    case "invitation_received":
    case "invitation_accepted":
    case "invitation_rejected":
    case "shared_transaction":
    case "member_removed":
    case "role_changed":
      return { module: "finance", finance: "accounts" };
    case "recurring_due":
    case "recurring_upcoming":
      return { module: "finance", finance: "recurring" };
    case "budget_limit":
      return { module: "finance", finance: "budgets" };
    case "goal_completed":
    case "goal_near_completion":
      return { module: "finance", finance: "savings" };
    case "yield_ready":
      return { module: "finance", finance: "cdts" };
    case "transport_fuel_low":
    case "transport_maintenance_due":
    case "transport_document_due":
    case "transport_custom_reminder_due":
      return { module: "transport" };
    default:
      return null;
  }
}

/** Agrupa por día: "Hoy", "Ayer" y "Antes". */
function dayBucket(dateStr: string): "today" | "yesterday" | "older" {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return "today";
  if (time >= startOfToday - 24 * 60 * 60 * 1000) return "yesterday";
  return "older";
}

const BUCKET_LABELS: Record<"today" | "yesterday" | "older", string> = {
  today: "Hoy",
  yesterday: "Ayer",
  older: "Antes",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationPanel() {
  const { data: session } = useSession();
  const { addNotification, setActiveModule, setFinanceSubView, setHealthSubView } = useAppStore();

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
  const grouped = (["today", "yesterday", "older"] as const)
    .map((bucket) => {
      const items = visibleNotifications.filter((n) => dayBucket(n.createdAt) === bucket);
      return { bucket, items, unread: items.filter((n) => !n.read).length };
    })
    .filter((group) => group.items.length > 0);

  const goTo = (notification: AppNotification) => {
    const destination = destinationFor(notification.type);
    if (!destination) {
      setOpen(false);
      return;
    }
    setActiveModule(destination.module);
    if (destination.finance) {
      setFinanceSubView(destination.finance as never);
    }
    if (destination.health) {
      setHealthSubView(destination.health as never);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-white hover:bg-white/20">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 flex size-5 items-center justify-center bg-amber-400 p-0 text-xs text-emerald-900">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl bg-white p-0 text-gray-900 shadow-xl ring-1 ring-black/5 dark:bg-gray-900 dark:text-gray-100"
      >
        {/* Todo el panel es una columna: cabecera y pie fijos, lista con scroll */}
        <div className="flex max-h-[min(80vh,30rem)] flex-col">
          {/* Cabecera */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-3.5 py-2.5 dark:border-gray-800">
            <div className="flex min-w-0 items-center gap-2">
              <Bell className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <h3 className="truncate text-sm font-semibold">Notificaciones</h3>
              {unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                aria-label="Marcar todas como leídas"
                title="Marcar todas como leídas"
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              >
                <CheckCheck className="size-3.5" />
                <span className="whitespace-nowrap">Leídas</span>
              </button>
            )}
          </div>

          {/* Lista con scroll propio */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading && visibleNotifications.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-emerald-500" />
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                  <Bell className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No hay notificaciones</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Te avisaremos cuando haya algo nuevo
                </p>
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.bucket}>
                  {/* Encabezado de grupo con la cantidad */}
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-gray-50/95 px-3.5 py-1.5 backdrop-blur dark:bg-gray-800/95">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {BUCKET_LABELS[group.bucket]}
                    </span>
                    <span className="text-[10px] font-semibold text-gray-400">
                      {group.unread > 0
                        ? `${group.unread} nueva${group.unread === 1 ? "" : "s"}`
                        : `${group.items.length}`}
                    </span>
                  </div>

                  {group.items.map((notification) => {
                    const { Icon, color, bg } = getNotificationIcon(notification.type, notification.data);
                    const invitationId = getInvitationId(notification.data);
                    const isActionLoading = actionLoading[notification.id] ?? false;
                    const isInvitationPending =
                      notification.type === "invitation_received" && !!invitationId;

                    return (
                      <div
                        key={notification.id}
                        role="button"
                        tabIndex={0}
                        className={`flex cursor-pointer gap-3 border-b border-gray-50 px-3.5 py-2.5 transition-colors last:border-b-0 hover:bg-accent/50 dark:border-gray-800/60 ${
                          !notification.read ? "bg-emerald-50/70 dark:bg-emerald-950/30" : ""
                        }`}
                        onClick={() => {
                          if (!notification.read) markAsRead(notification.id);
                          goTo(notification);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            if (!notification.read) markAsRead(notification.id);
                            goTo(notification);
                          }
                        }}
                      >
                        <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${bg}`}>
                          <Icon className={`size-3.5 ${color}`} />
                        </div>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`min-w-0 break-words text-[13px] leading-snug ${
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
                          <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                            {notification.message}
                          </p>
                          <p className="text-[10px] text-muted-foreground/60">
                            {formatRelativeTime(notification.createdAt)}
                          </p>

                          {isInvitationPending && (
                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                className="h-7 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                                disabled={isActionLoading}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  acceptInvitation(notification.id, invitationId!);
                                }}
                              >
                                {isActionLoading ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                                Aceptar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 border-red-200 px-3 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:hover:bg-red-950/30"
                                disabled={isActionLoading}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  rejectInvitation(notification.id, invitationId!);
                                }}
                              >
                                Rechazar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Pie fijo */}
          {visibleNotifications.length > 0 && (
            <div className="shrink-0 border-t border-gray-100 px-3.5 py-1.5 dark:border-gray-800">
              <p className="text-center text-[10px] text-muted-foreground/60">
                Se actualiza cada 30 segundos
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
