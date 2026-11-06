"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, formatCurrency } from "@/lib/api";
import { toast } from "sonner";
import {
  Inbox,
  ClipboardPaste,
  Check,
  X,
  ChevronDown,
  Sparkles,
  AlertTriangle,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { TransactionForm } from "./transaction-form";
import { isSmsReadingAvailable, readRecentSms } from "@/lib/native/sms";

/**
 * F-49 · Bandeja de entrada.
 *
 * Recibe capturas (texto de SMS, correo, notificación o algo pegado) y las
 * deja pendientes de clasificar. Aceptar abre el formulario normal de
 * transacción **prellenado**: el movimiento se registra por el único camino
 * que ya sabe mover saldos y presupuestos.
 *
 * Nada se registra solo. La bandeja propone; el usuario confirma.
 */

type InboxItem = {
  id: string;
  source: string;
  rawText: string;
  parsedAmount: number | null;
  parsedType: string | null;
  parsedDate: string | null;
  parsedMerchant: string | null;
  confidence: number | null;
  status: string;
  /** "retiro_efectivo" cuando el retiro en cajero pasó la plata a efectivo. */
  notes: string | null;
  /** Movimiento ya registrado que parece ser el mismo (F-49b). */
  possibleMatch: {
    id: string;
    amount: number;
    date: string;
    description: string;
    confidence: "high" | "medium" | "low";
    daysApart: number;
    /** Si el candidato es un pago recurrente y en qué estado está. */
    origin?: "transaction" | "recurring";
    status?: string;
  } | null;
  /** F-36 · Regla que aplica a este mensaje (propone categoría/cuenta/tipo). */
  suggestedRule: {
    id: string;
    name: string;
    category: string | null;
    subCategory: string | null;
    accountId: string | null;
    type: string | null;
  } | null;
  receivedAt: string;
};

type InboxResponse = { items: InboxItem[]; pendingCount: number };

const SOURCE_LABEL: Record<string, string> = {
  sms: "SMS",
  email: "Correo",
  voice: "Voz",
  notification: "Notificación",
  manual: "Pegado",
};

/**
 * Fecha que se muestra en la tarjeta.
 *
 * Antes se caía a "Hoy" cuando el mensaje no traía fecha reconocible, así que
 * un SMS de la semana pasada aparecía como recién llegado. Ahora se usa la
 * fecha real del mensaje y solo se dice "Hoy"/"Ayer" cuando de verdad lo es.
 */
function formatCaptureDate(item: InboxItem): string {
  const iso = item.parsedDate ?? item.receivedAt;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const now = new Date();

  if (key(date) === key(now)) return "Hoy";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key(date) === key(yesterday)) return "Ayer";

  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    timeZone: "America/Bogota",
  });
}
/** Etiqueta del tipo detectado, incluido el retiro en efectivo. */
function typeLabel(item: InboxItem): string {
  if (item.notes === "retiro_efectivo") return " · Retiro en efectivo → bolsillo";
  if (item.parsedType === "income") return " · Ingreso";
  if (item.parsedType === "transfer") return " · Transferencia";
  return " · Gasto";
}

/** Color del monto según el tipo. */
function amountClass(item: InboxItem, noAmount: boolean): string {
  if (noAmount) return "text-gray-300 dark:text-gray-600";
  if (item.parsedType === "income") return "text-emerald-600 dark:text-emerald-400";
  if (item.parsedType === "transfer") return "text-sky-600 dark:text-sky-400";
  return "text-gray-900 dark:text-white";
}
function toDateInput(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function InboxView() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readingSms, setReadingSms] = useState(false);

  // Cuenta de efectivo del usuario, detectada por TIPO (no por nombre: puede
  // llamarse "Moneditas"). Es el destino natural de un retiro en cajero.
  const [cashAccountId, setCashAccountId] = useState<string | null>(null);

  // Filtro: por defecto se ocultan las capturas que ya tienen un
  // movimiento registrado, que es justo lo que no se quiere ver.
  const [showMatched, setShowMatched] = useState(false);

  // Captura nueva
  const [rawText, setRawText] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Aceptar → formulario prellenado
  const [accepting, setAccepting] = useState<InboxItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<InboxResponse>("/api/inbox");
      setItems(data.items || []);
      setPendingCount(data.pendingCount ?? 0);
    } catch {
      toast.error("No se pudo leer la bandeja");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Se busca la cuenta de efectivo por tipo, no por nombre: el usuario puede
  // llamarla "Moneditas", "Plata en mano" o como quiera. Solo hay una.
  useEffect(() => {
    apiFetch<Array<{ id: string; type: string }>>("/api/accounts")
      .then((accounts) => {
        const cash = (accounts || []).find((account) => account.type === "cash");
        setCashAccountId(cash?.id ?? null);
      })
      .catch(() => setCashAccountId(null));
  }, []);

  const matchedCount = items.filter((item) => item.possibleMatch).length;
  const visibleItems = showMatched ? items : items.filter((item) => !item.possibleMatch);
  const handleCapture = async () => {
    const text = rawText.trim();
    if (!text) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ item?: InboxItem; duplicate?: boolean; skipped?: boolean; reason?: string }>(
        "/api/inbox",
        { method: "POST", body: JSON.stringify({ rawText: text, source: "manual" }) }
      );
      if (res.duplicate) {
        toast.info("Ese mensaje ya estaba en la bandeja");
        return;
      }
      if (res.skipped) {
        // Clave, publicidad o estafa: no se guarda, y se dice por qué.
        toast.info(res.reason || "Ese mensaje no es un movimiento");
        return;
      }
      if (!res.item) {
        toast.error("No se pudo capturar");
        return;
      }
      if (res.item.parsedAmount === null) {
        toast.warning("Capturado, pero no se detectó un monto. Edítalo al registrarlo.");
      } else {
        toast.success(`Capturado: ${formatCurrency(res.item.parsedAmount)}`);
      }
      setRawText("");
      await load();
    } catch {
      toast.error("No se pudo capturar");
    } finally {
      setSaving(false);
    }
  };

  /** Lee los SMS del teléfono y los deposita en la bandeja. */
  const handleReadSms = async () => {
    setReadingSms(true);
    try {
      const result = await readRecentSms(120, 21);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      // Pre-filtro en el teléfono: solo se envían mensajes que parecen
      // movimientos. El parser del servidor hace la lectura fina, pero no
      // tiene sentido subir 120 SMS de conversaciones personales.
      const FINANCIAL = /(\$|\bCOP\b|compra|pago|retiro|abono|transacci|d[eé]bito|factura|consignaci|cuota)/i;
      const candidates = result.messages.filter((m) => FINANCIAL.test(m.body)).slice(0, 60);

      if (candidates.length === 0) {
        toast.info("No se encontraron SMS de movimientos");
        return;
      }

      let created = 0;
      let duplicates = 0;
      // Claves, publicidad y estafas: no entran a la bandeja.
      let skipped = 0;
      for (const message of candidates) {
        try {
          const res = await apiFetch<{ duplicate?: boolean; skipped?: boolean }>("/api/inbox", {
            method: "POST",
            body: JSON.stringify({ rawText: message.body, source: "sms", capturedAt: message.date }),
          });
          if (res.duplicate) duplicates++;
          else if (res.skipped) skipped++;
          else created++;
        } catch {
          /* un SMS que falle no debe tumbar el resto */
        }
      }

      const extras = [
        duplicates > 0 ? `${duplicates} ya estaban` : null,
        skipped > 0 ? `${skipped} no eran movimientos` : null,
      ].filter(Boolean);

      if (created === 0) {
        toast.info(extras.length ? `Nada nuevo · ${extras.join(" · ")}` : "Nada nuevo");
      } else {
        toast.success(
          `${created} capturados${extras.length ? ` · ${extras.join(" · ")}` : ""}`
        );
      }
      await load();
    } finally {
      setReadingSms(false);
    }
  };
  const mark = async (
    item: InboxItem,
    status: "accepted" | "dismissed",
    transactionId?: string
  ) => {
    try {
      await apiFetch("/api/inbox", {
        method: "PATCH",
        body: JSON.stringify({ id: item.id, status, ...(transactionId ? { transactionId } : {}) }),
      });
      await load();
    } catch {
      toast.error("No se pudo actualizar la captura");
    }
  };

  const openAccept = (item: InboxItem) => {
    setAccepting(item);
    setFormOpen(true);
  };

  const handleAccepted = async () => {
    if (accepting) {
      await mark(accepting, "accepted");
    }
    setAccepting(null);
  };

  return (
    <div className="p-4 space-y-4 pb-safe">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Inbox className="size-5 text-indigo-500" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Bandeja de entrada</h2>
        {pendingCount > 0 && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            {pendingCount}
          </span>
        )}
      </div>

      {/* Lectura de SMS (solo app Android) */}
      {isSmsReadingAvailable() && (
        <Button
          type="button"
          variant="outline"
          onClick={handleReadSms}
          disabled={readingSms}
          className="w-full h-9 rounded-xl text-xs border-sky-200 dark:border-sky-900/50 text-sky-700 dark:text-sky-300"
        >
          {readingSms ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <MessageSquare className="size-3.5 mr-1" />}
          {readingSms ? "Leyendo SMS…" : "Leer SMS del teléfono"}
        </Button>
      )}
      {/* Captura manual */}
      <Card className="border border-dashed border-indigo-200 dark:border-indigo-900/50 shadow-none rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/10">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <ClipboardPaste className="size-3.5 text-indigo-500" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Pegar un mensaje
            </span>
          </div>
          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Pega el SMS del banco o cualquier texto… Ej: Compraste $45.900 en EXITO PRADO. 04/11"
            rows={3}
            className="rounded-xl text-xs resize-none"
          />
          <Button
            type="button"
            onClick={handleCapture}
            disabled={saving || !rawText.trim()}
            className="w-full h-9 rounded-xl text-xs"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Sparkles className="size-3.5 mr-1" />}
            Capturar
          </Button>
        </CardContent>
      </Card>

      {/* Filtro: las capturas que ya tienen movimiento se ocultan por defecto.
          Es lo que el usuario ya tiene controlado y no quiere volver a ver. */}
      {matchedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowMatched((value) => !value)}
          className="w-full text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl py-2 px-3 flex items-center justify-center gap-1.5"
        >
          <AlertTriangle className="size-3" />
          {showMatched
            ? `Ocultar las ${matchedCount} que ya están registradas`
            : `${matchedCount} ya registradas (ocultas) · Ver`}
        </button>
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          <div className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700/50 p-6 text-center">
          <Inbox className="size-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          {matchedCount > 0 && !showMatched ? (
            <>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Todo al día</p>
              <p className="text-[11px] text-gray-400 mt-1">
                Las {matchedCount} capturas pendientes ya tienen su movimiento registrado.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Nada pendiente</p>
              <p className="text-[11px] text-gray-400 mt-1">
                Cuando lleguen SMS, correos o capturas por voz, aparecerán aquí para clasificar.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => {
            const isOpen = expanded === item.id;
            const lowConfidence = (item.confidence ?? 0) < 0.6;
            const noAmount = item.parsedAmount === null;
            return (
              <Card
                key={item.id}
                className="border border-gray-100 dark:border-gray-700/50 shadow-sm rounded-2xl"
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          {SOURCE_LABEL[item.source] || item.source}
                        </span>
                        {lowConfidence && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="size-2.5" />
                            revisar
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {item.parsedMerchant || "Sin comercio detectado"}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {formatCaptureDate(item)}
                        {typeLabel(item)}
                      </p>
                      {item.suggestedRule && (
                        <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-0.5 truncate">
                          Regla «{item.suggestedRule.name}»
                          {item.suggestedRule.category ? ` → ${item.suggestedRule.category}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-bold ${amountClass(item, noAmount)}`}
                      >
                        {noAmount ? "—" : formatCurrency(item.parsedAmount!)}
                      </p>
                    </div>
                  </div>

                  {/* Texto original */}
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    className="w-full flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {isOpen ? "Ocultar mensaje" : "Ver mensaje original"}
                    <ChevronDown className={`size-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-lg p-2 break-words">
                      {item.rawText}
                    </p>
                  )}

                  {/* F-49b · Aviso de posible duplicado: los SMS son de días
                      atrás y el movimiento puede estar registrado ya. Nunca se
                      descarta solo; decide el usuario. */}
                  {item.possibleMatch && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 p-2">
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                            {item.possibleMatch.origin === "recurring"
                              ? item.possibleMatch.status === "pending"
                                ? "Coincide con un pago programado"
                                : "Ya está registrado como pago"
                              : "Parece ya registrado"}
                          </p>
                          <p className="text-[10px] text-amber-700 dark:text-amber-400 truncate">
                            {item.possibleMatch.description} ·{" "}
                            {new Date(item.possibleMatch.date).toLocaleDateString("es-CO", {
                              day: "numeric",
                              month: "short",
                              timeZone: "America/Bogota",
                            })}{" "}
                            · {formatCurrency(item.possibleMatch.amount)}
                            {item.possibleMatch.daysApart > 0 &&
                              ` (${item.possibleMatch.daysApart} día${
                                item.possibleMatch.daysApart === 1 ? "" : "s"
                              } de diferencia)`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {item.possibleMatch ? (
                      <>
                        <Button
                          type="button"
                          onClick={() => mark(item, "accepted", item.possibleMatch!.id)}
                          className="flex-1 h-8 rounded-lg text-[11px]"
                        >
                          <Check className="size-3 mr-1" />
                          Ya está registrado
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openAccept(item)}
                          className="h-8 rounded-lg text-[11px] px-3"
                          title="Registrar de todos modos"
                        >
                          Registrar igual
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          onClick={() => openAccept(item)}
                          className="flex-1 h-8 rounded-lg text-[11px]"
                        >
                          <Check className="size-3 mr-1" />
                          Registrar movimiento
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => mark(item, "dismissed")}
                          className="h-8 rounded-lg text-[11px] px-3"
                        >
                          <X className="size-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Formulario prellenado para aceptar */}
      <TransactionForm
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setAccepting(null);
        }}
        defaultAccountId={accepting?.suggestedRule?.accountId ?? undefined}
        defaultDescription={
          accepting
            ? accepting.notes === "retiro_efectivo"
              ? "Retiro en efectivo"
              : (accepting.parsedMerchant || accepting.rawText).slice(0, 120)
            : undefined
        }
        defaultType={accepting?.suggestedRule?.type || accepting?.parsedType || "expense"}
        prefill={
          accepting
            ? {
                amount: accepting.parsedAmount !== null ? String(accepting.parsedAmount) : undefined,
                category: accepting.suggestedRule?.category ?? undefined,
                date: toDateInput(accepting.parsedDate),
                // Retiro en cajero → la plata pasa a la cuenta de efectivo.
                toAccountId:
                  accepting.notes === "retiro_efectivo" && cashAccountId
                    ? cashAccountId
                    : undefined,
              }
            : null
        }
        onSuccess={handleAccepted}
      />
    </div>
  );
}
