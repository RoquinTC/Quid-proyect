"use client";

import { useEffect, useState } from "react";
import { Download, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encryptBackup } from "@/lib/backup-crypto";

/**
 * F-17 · Respaldo cifrado.
 *
 * Toma el export que ya existe (`/api/backup/export`), lo cifra en el
 * dispositivo con la contraseña del usuario y lo entrega como archivo `.quid`.
 * La contraseña nunca sale del teléfono ni se guarda.
 *
 * En Android se escribe en caché y se comparte con la hoja del sistema; en web
 * se descarga. El archivo **no** sirve sin la contraseña: no hay recuperación.
 */

const EVENT = "quid-backup-open";

export function requestEncryptedBackup(): void {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function EncryptedBackupDialog() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const listener = () => {
      setOpen(true);
      setPassword("");
      setConfirm("");
      setMessage("");
      setError("");
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, []);

  if (!open) return null;

  const download = async () => {
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Usa al menos 8 caracteres. Sin esta contraseña no se puede abrir el respaldo.");
      return;
    }
    if (password !== confirm) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setWorking(true);
    try {
      const response = await fetch("/api/backup/export");
      if (!response.ok) throw new Error("No se pudo generar el respaldo.");
      const payload = await response.json();
      const file = await encryptBackup(payload, password);
      const name = `quid-respaldo-${new Date().toISOString().slice(0, 10)}.quid`;

      const { Capacitor } = await import("@capacitor/core");

      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        await Filesystem.writeFile({
          path: name,
          data: file,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
        await Share.share({ title: "Respaldo cifrado de Quid", url: uri });
        setMessage("Respaldo cifrado listo. Guárdalo en un lugar seguro.");
      } else {
        const blob = new Blob([file], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
        setMessage("Respaldo descargado.");
      }
      setPassword("");
      setConfirm("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo crear el respaldo.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-emerald-600 dark:text-emerald-400" />
          <p className="font-semibold">Respaldo cifrado</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Descarga todos tus datos en un archivo protegido con esta contraseña. Quid no la guarda:
          si la pierdes, el respaldo no se puede abrir.
        </p>

        <input
          type="password"
          placeholder="Contraseña del respaldo"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        />
        <input
          type="password"
          placeholder="Repite la contraseña"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        />

        {error && <p className="text-sm text-rose-500">{error}</p>}
        {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

        <Button className="w-full rounded-xl" disabled={working} onClick={() => void download()}>
          <Download className="mr-2 size-4" />
          {working ? "Cifrando…" : "Descargar respaldo"}
        </Button>
        <Button variant="ghost" className="w-full rounded-xl" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
