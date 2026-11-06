"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Mail, Copy, Loader2 } from "lucide-react";

/**
 * F-22 · Captura por correo.
 *
 * En vez de guardar la contraseña de Gmail (o hablar IMAP), se expone una
 * dirección a la que se hace POST con un token propio. Sirve con Gmail,
 * Outlook o con el script de `himalaya` que ya vive en el servidor.
 */

type Props = {
  enabled: boolean;
  onToggle: (value: boolean) => void;
};

export function InboxEmailCard({ enabled, onToggle }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    apiFetch<{ token: string }>("/api/inbox/email")
      .then((res) => setToken(res.token))
      .catch(() => toast.error("No se pudo generar el token"))
      .finally(() => setLoading(false));
  }, [enabled]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const endpoint =
    typeof window !== "undefined" ? `${window.location.origin}/api/inbox/email` : "/api/inbox/email";

  return (
    <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Mail className="size-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-900 dark:text-white">Captura por correo</p>
              <p className="text-xs text-gray-400">Recibe facturas y avisos del banco</p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>

        {!enabled ? (
          <p className="text-[11px] text-gray-400 mt-2 pl-11">
            Apagado: nadie puede enviar correos a la bandeja. No se guarda ninguna contraseña de
            correo; se usa un token propio que puedes revocar apagando esto.
          </p>
        ) : loading ? (
          <div className="mt-2 pl-11 flex items-center gap-1.5 text-[11px] text-gray-400">
            <Loader2 className="size-3 animate-spin" /> Generando token…
          </div>
        ) : (
          <div className="mt-2 space-y-2 pl-11">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Dirección</p>
              <div className="flex items-center gap-1.5">
                <code className="text-[10px] bg-gray-50 dark:bg-gray-800/60 rounded px-1.5 py-1 truncate flex-1">
                  {endpoint}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => copy(endpoint, "Dirección")}
                >
                  <Copy className="size-3" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Token</p>
              <div className="flex items-center gap-1.5">
                <code className="text-[10px] bg-gray-50 dark:bg-gray-800/60 rounded px-1.5 py-1 truncate flex-1">
                  {token}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => token && copy(token, "Token")}
                >
                  <Copy className="size-3" />
                </Button>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 leading-relaxed">
              Envía un POST con la cabecera <code>x-inbox-token</code> y un JSON con{" "}
              <code>subject</code>, <code>from</code> y <code>text</code>. El clasificador y las
              reglas hacen el resto; queda como una captura más en la bandeja.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
