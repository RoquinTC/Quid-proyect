"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import type { HealthProfile } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface ShoppingListFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ShoppingListForm({ open, onOpenChange, onSuccess }: ShoppingListFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("Lista de Mercado");
  const [profileId, setProfileId] = useState<string>("none");
  const [healthProfiles, setHealthProfiles] = useState<HealthProfile[]>([]);

  useEffect(() => {
    if (open) {
      apiFetch<HealthProfile[]>("/api/health-profiles")
        .then(setHealthProfiles)
        .catch(console.error);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!name) return;
    setLoading(true);
    try {
      await apiFetch("/api/shopping-lists", {
        method: "POST",
        body: JSON.stringify({
          name,
          profileId: profileId === "none" ? null : profileId,
        }),
      });
      onSuccess?.();
      onOpenChange(false);
      setName("Lista de Mercado");
      setProfileId("none");
    } catch (error) {
      console.error("Error creating list:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Nueva Lista de Mercado</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="listName">Nombre</Label>
            <Input
              id="listName"
              placeholder="Ej: Lista semanal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Health Profile */}
          <div className="space-y-2">
            <Label>Perfil de salud (opcional)</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Sin perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin perfil</SelectItem>
                {healthProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.type === "owner" ? "Propietario" : "Invitado"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-400">
              Considerar restricciones alimentarias al generar la lista
            </p>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !name}
            className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            Crear Lista
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
