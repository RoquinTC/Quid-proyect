"use client";

import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { performLogout } from "@/lib/logout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationPanel } from "@/components/layout/notification-panel";

export function Header() {
  const { data: session } = useSession();
  const { toggleSidebar } = useAppStore();

  const userInitials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "UH";

  // performLogout clears all session state (localStorage, IndexedDB, SW cache, cookies) before redirecting
  // This prevents the race condition where the redirect kills cleanup effects

  return (
    <header className="z-50 bg-gradient-to-r from-emerald-600 to-teal-500 text-white rounded-b-2xl shadow-lg shadow-emerald-500/20 shrink-0">
      <div className="flex items-center justify-between px-4 py-3 safe-area-top">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 md:hidden"
            onClick={toggleSidebar}
          >
            <Menu className="size-5" />
          </Button>
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="Quid" className="size-8 rounded-xl" />
            <h1 className="text-lg font-bold tracking-tight">Quid</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Notifications */}
          <NotificationPanel />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full ring-2 ring-white/30 hover:ring-white/60 transition-all"
              >
                <Avatar className="size-9">
                  <AvatarImage
                    src={session?.user?.image || ""}
                    alt={session?.user?.name || "Usuario"}
                  />
                  <AvatarFallback className="bg-white/20 text-white text-xs font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{session?.user?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {session?.user?.email}
                </p>
              </div>
              <DropdownMenuItem
                onClick={performLogout}
                className="text-red-600 focus:text-red-600 cursor-pointer rounded-lg"
              >
                <LogOut className="mr-2 size-4" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
