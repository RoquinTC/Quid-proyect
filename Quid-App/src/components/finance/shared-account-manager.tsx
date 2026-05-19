"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  UserPlus,
  Users,
  Shield,
  Crown,
  Trash2,
  Eye,
  Pencil,
  Mail,
  Clock,
  Loader2,
  X,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import type { SharedAccountUser } from "@/lib/types";

// ─── Types ───

interface SharedAccountManagerProps {
  accountId: string;
  accountName: string;
  sharedUsers: SharedAccountUser[];
  onUpdate: () => void;
  isOwner: boolean;
}

interface PendingInvitation {
  id: string;
  inviteeEmail: string;
  role: string;
  status: string;
  createdAt: string;
  inviter?: { name: string; email: string };
  account?: { id: string; name: string; color: string };
}

// ─── Role helpers ───

const roleConfig: Record<string, { label: string; icon: typeof Eye; badgeClass: string }> = {
  admin: {
    label: "Admin",
    icon: Shield,
    badgeClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  editor: {
    label: "Editor",
    icon: Pencil,
    badgeClass: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  viewer: {
    label: "Viewer",
    icon: Eye,
    badgeClass: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
};

function getRoleBadgeClass(role: string): string {
  return roleConfig[role]?.badgeClass ?? roleConfig.viewer.badgeClass;
}

function getRoleLabel(role: string): string {
  return roleConfig[role]?.label ?? role;
}

function getRoleIcon(role: string): typeof Eye {
  return roleConfig[role]?.icon ?? Eye;
}

// ─── Component ───

export function SharedAccountManager({
  accountId,
  accountName,
  sharedUsers,
  onUpdate,
  isOwner,
}: SharedAccountManagerProps) {
  // Collapsed state — starts collapsed
  const [isOpen, setIsOpen] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Pending invitations state
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingFetched, setPendingFetched] = useState(false);

  // Role change / remove loading states
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // ─── Fetch pending invitations ───
  const fetchPendingInvitations = async () => {
    if (!isOwner) return;
    setLoadingPending(true);
    try {
      const data = await apiFetch<{ invitations: PendingInvitation[] }>(
        `/api/invitations?accountId=${accountId}`
      );
      setPendingInvitations(data.invitations ?? []);
      setPendingFetched(true);
    } catch (err) {
      console.error("Error fetching pending invitations:", err);
    } finally {
      setLoadingPending(false);
    }
  };

  // Load pending invitations when expanded for the first time
  useEffect(() => {
    if (isOwner && isOpen && !pendingFetched) {
      fetchPendingInvitations();
    }
  }, [isOwner, isOpen, pendingFetched, accountId]);

  // ─── Send invitation ───
  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteError("Ingresa un correo electrónico");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail.trim())) {
      setInviteError("Ingresa un correo electrónico válido");
      return;
    }

    setInviting(true);
    setInviteError(null);

    try {
      await apiFetch(`/api/accounts/${accountId}/invite`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      toast.success(`Invitación enviada a ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteRole("viewer");
      onUpdate();
      // Refresh pending invitations
      fetchPendingInvitations();
    } catch (err: any) {
      const message = err?.message || "Error al enviar la invitación";
      setInviteError(message);
      toast.error(message);
    } finally {
      setInviting(false);
    }
  };

  // ─── Change member role ───
  const handleRoleChange = async (userId: string, newRole: string) => {
    setChangingRoleId(userId);
    try {
      await apiFetch(`/api/accounts/${accountId}/members/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
      });
      toast.success("Rol actualizado correctamente");
      onUpdate();
    } catch (err: any) {
      toast.error(err?.message || "Error al cambiar el rol");
    } finally {
      setChangingRoleId(null);
    }
  };

  // ─── Remove member ───
  const handleRemoveMember = async (userId: string, userName: string) => {
    setRemovingId(userId);
    try {
      await apiFetch(`/api/accounts/${accountId}/members/${userId}`, {
        method: "DELETE",
      });
      toast.success(`${userName} ha sido removido de la cuenta`);
      onUpdate();
    } catch (err: any) {
      toast.error(err?.message || "Error al remover miembro");
    } finally {
      setRemovingId(null);
    }
  };

  const memberCount = sharedUsers.length + 1;
  const memberNames = sharedUsers.map((su) => su.user.name).join(", ");

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      {/* ─── Collapsed Summary Bar ─── */}
      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-8 rounded-xl flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/20 shrink-0">
                    <Users className="size-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Compartida
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400"
                      >
                        {memberCount} miembro{memberCount !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    {memberNames && (
                      <p className="text-[10px] text-gray-400 truncate">
                        {memberNames}
                      </p>
                    )}
                  </div>
                </div>
                <ChevronDown
                  className={`size-4 text-gray-400 shrink-0 transition-transform duration-200 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CardContent>
          </button>
        </CollapsibleTrigger>

        {/* ─── Expanded Content ─── */}
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3">
            <Separator />

            {/* ─── Shared Users List ─── */}
            <div className="space-y-1">
              {/* Owner row */}
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-gradient-to-r from-amber-50/80 to-yellow-50/50 dark:from-amber-900/15 dark:to-yellow-900/10">
                <div className="size-8 rounded-xl flex items-center justify-center bg-amber-100 dark:bg-amber-800/40 shrink-0">
                  <Crown className="size-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {accountName}
                    </p>
                    <span className="text-[8px] text-amber-600 dark:text-amber-400 font-medium">
                      (propietario)
                    </span>
                  </div>
                </div>
                <Badge className="text-[8px] px-1.5 py-0 h-4 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-800/40 dark:text-amber-300 border-0">
                  Admin
                </Badge>
              </div>

              {/* Shared users */}
              {sharedUsers.map((su) => {
                const RoleIcon = getRoleIcon(su.role);
                const isChangingRole = changingRoleId === (su.user.id || su.id);
                const isRemoving = removingId === (su.user.id || su.id);
                const isBusy = isChangingRole || isRemoving;

                return (
                  <div
                    key={su.id}
                    className={`flex items-center gap-2.5 p-2 rounded-xl transition-colors ${
                      isBusy
                        ? "bg-gray-50 dark:bg-gray-800/50 opacity-70"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    }`}
                  >
                    {/* User icon */}
                    <div className="size-8 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-800 shrink-0">
                      <Users className="size-3.5 text-gray-500 dark:text-gray-400" />
                    </div>

                    {/* User info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {su.user.name}
                      </p>
                      <p className="text-[9px] text-gray-400 truncate">
                        {su.user.email}
                      </p>
                    </div>

                    {/* Owner actions or read-only role badge */}
                    {isOwner ? (
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Role change dropdown */}
                        <Select
                          value={su.role}
                          onValueChange={(newRole) =>
                            handleRoleChange(su.user.id || su.id, newRole)
                          }
                          disabled={isBusy}
                        >
                          <SelectTrigger className="w-[85px] h-6 text-[10px] rounded-lg border-0 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 p-0 pl-1.5 pr-5">
                            {isChangingRole ? (
                              <Loader2 className="size-2.5 animate-spin text-emerald-500" />
                            ) : (
                              <div className="flex items-center gap-1">
                                <RoleIcon className="size-2" />
                                <span>{getRoleLabel(su.role)}</span>
                              </div>
                            )}
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="editor" className="text-[10px]">
                              <div className="flex items-center gap-1">
                                <Pencil className="size-2.5 text-blue-500" />
                                <span>Editor</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="viewer" className="text-[10px]">
                              <div className="flex items-center gap-1">
                                <Eye className="size-2.5 text-gray-500" />
                                <span>Viewer</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Remove button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 shrink-0"
                          onClick={() =>
                            handleRemoveMember(
                              su.user.id || su.id,
                              su.user.name
                            )
                          }
                          disabled={isBusy}
                        >
                          {isRemoving ? (
                            <Loader2 className="size-3 animate-spin text-red-400" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      /* Read-only role badge for non-owners */
                      <Badge
                        className={`text-[8px] px-1.5 py-0 h-4 rounded-lg border-0 ${getRoleBadgeClass(su.role)}`}
                      >
                        <RoleIcon className="size-2 mr-0.5" />
                        {getRoleLabel(su.role)}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ─── Invite Section (Owner Only) ─── */}
            {isOwner && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <UserPlus className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      Invitar persona
                    </span>
                  </div>

                  {/* Email input */}
                  <div className="relative">
                    <Mail className="size-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      type="email"
                      placeholder="correo@ejemplo.com"
                      value={inviteEmail}
                      onChange={(e) => {
                        setInviteEmail(e.target.value);
                        if (inviteError) setInviteError(null);
                      }}
                      className="pl-7 h-8 text-xs rounded-xl bg-white dark:bg-gray-900 border-emerald-200 dark:border-emerald-800 focus-visible:ring-emerald-400"
                      disabled={inviting}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleInvite();
                      }}
                    />
                  </div>

                  {/* Role selector + Invite button */}
                  <div className="flex gap-2">
                    <Select
                      value={inviteRole}
                      onValueChange={setInviteRole}
                      disabled={inviting}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs rounded-xl bg-white dark:bg-gray-900 border-emerald-200 dark:border-emerald-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="editor" className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <Pencil className="size-2.5 text-blue-500" />
                            <span>Editor</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="viewer" className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <Eye className="size-2.5 text-gray-500" />
                            <span>Viewer</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      onClick={handleInvite}
                      disabled={inviting || !inviteEmail.trim()}
                      className="flex-1 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      {inviting ? (
                        <>
                          <Loader2 className="size-3 mr-1 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <UserPlus className="size-3 mr-1" />
                          Invitar
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Role descriptions */}
                  <div className="flex gap-3 text-[9px] text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-0.5">
                      <Pencil className="size-2 text-blue-400" />
                      <span>Editor: agregar/borrar</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Eye className="size-2 text-gray-400" />
                      <span>Viewer: solo ver</span>
                    </div>
                  </div>

                  {/* Error message */}
                  {inviteError && (
                    <div className="flex items-start gap-1.5 bg-red-50 dark:bg-red-900/15 rounded-xl p-2">
                      <X className="size-3 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-red-600 dark:text-red-400">{inviteError}</p>
                    </div>
                  )}
                </div>

                {/* ─── Pending Invitations ─── */}
                {pendingFetched && pendingInvitations.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3 text-amber-500" />
                      <span className="text-[10px] font-medium text-gray-500">
                        Pendientes ({pendingInvitations.length})
                      </span>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {pendingInvitations.map((inv) => {
                        const InvRoleIcon = getRoleIcon(inv.role);
                        return (
                          <div
                            key={inv.id}
                            className="flex items-center gap-2 p-1.5 rounded-lg bg-amber-50/60 dark:bg-amber-900/10"
                          >
                            <div className="size-6 rounded-md flex items-center justify-center bg-amber-100 dark:bg-amber-800/30 shrink-0">
                              <Mail className="size-2.5 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-medium text-gray-900 dark:text-white truncate">
                                {inv.inviteeEmail}
                              </p>
                              <div className="flex items-center gap-1">
                                <InvRoleIcon className="size-2 text-gray-400" />
                                <span className="text-[9px] text-gray-400">
                                  {getRoleLabel(inv.role)}
                                </span>
                              </div>
                            </div>
                            <Badge className="text-[8px] px-1 py-0 h-3.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-800/40 dark:text-amber-300 border-0">
                              Pendiente
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
