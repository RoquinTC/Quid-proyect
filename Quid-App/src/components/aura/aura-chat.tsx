"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sparkles, Send, Loader2, Check, X, MessageCircle } from "lucide-react";
import { toast } from "sonner";

type ChatAction = {
  type?: string;
  tool?: string;
  payload?: Record<string, unknown>;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: ChatAction;
  resolved?: "confirmed" | "cancelled";
};

type ChatResponse = {
  success?: boolean;
  text?: string;
  action?: ChatAction;
  responseMessages?: Array<{ role: string; content: string }>;
  error?: string;
};

const QUICK_PROMPTS = [
  "¿Cuánto gasté este mes?",
  "¿Cómo están mis deudas?",
  "¿Cómo van mis presupuestos?",
  "¿Qué pagos tengo pendientes?",
  "¿Cómo van mis metas?",
];

let counter = 0;
function nextId(): string {
  counter += 1;
  return `m${Date.now()}-${counter}`;
}

/**
 * Chat de Aura dentro de la app.
 *
 * Usa el mismo motor que Telegram (`POST /api/aura/chat`) y el mismo gateway de
 * herramientas, así que las propuestas de escritura llegan con su `proposalId` y
 * aquí se confirman con botones. Nada se ejecuta por lo que diga el modelo: el
 * botón llama a `/api/aura/tools/confirm`, que es el único camino de escritura.
 */
export function AuraChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, sending]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const userMessage: ChatMessage = { id: nextId(), role: "user", content: trimmed };
      const history = [...messages, userMessage];
      setMessages(history);
      setInput("");
      setSending(true);

      try {
        const data = await apiFetch<ChatResponse>("/api/aura/chat", {
          method: "POST",
          body: JSON.stringify({
            messages: history.slice(-12).map((message) => ({
              role: message.role,
              content: message.content,
            })),
          }),
        });

        const reply: ChatMessage = {
          id: nextId(),
          role: "assistant",
          content: data.text ?? "No entendí eso. ¿Lo dices de otra forma?",
          action: data.action,
        };

        setMessages((current) => [...current, reply]);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "error desconocido";
        setMessages((current) => [
          ...current,
          {
            id: nextId(),
            role: "assistant",
            content: `No pude responder (${detail}). Intenta de nuevo.`,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [messages, sending]
  );

  const resolveProposal = async (
    message: ChatMessage,
    decision: "confirm" | "cancel"
  ) => {
    const proposalId = message.action?.payload?.proposalId;
    if (typeof proposalId !== "string") return;

    setResolving(message.id);
    try {
      const data = await apiFetch<ChatResponse>("/api/aura/tools/confirm", {
        method: "POST",
        body: JSON.stringify({ action: decision, proposalId }),
      });

      const text =
        data.text ??
        (decision === "confirm" ? "Listo, quedó guardado." : "Listo, no guardé nada.");

      const resolved: ChatMessage["resolved"] =
        decision === "confirm" ? "confirmed" : "cancelled";

      setMessages((current) => [
        ...current.map((entry) =>
          entry.id === message.id ? { ...entry, resolved } : entry
        ),
        { id: nextId(), role: "assistant", content: text },
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo completar la acción"
      );
    } finally {
      setResolving(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Hablar con Aura"
          className="fixed right-4 bottom-20 z-40 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/30 transition-transform active:scale-95"
        >
          <MessageCircle className="size-5" />
        </button>
      </SheetTrigger>

      <SheetContent side="bottom" className="h-[88vh] rounded-t-3xl p-0 flex flex-col">
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="size-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Sparkles className="size-4 text-white" />
          </div>
          <div className="min-w-0">
            <SheetTitle className="text-sm font-bold leading-tight">Aura</SheetTitle>
            <p className="text-[10px] text-gray-400">Tu asistente, con tus datos</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                Pregúntame por tus cuentas, deudas, presupuestos, metas o vehículos. Si algo
                implica escribir, te lo propongo y tú confirmas.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void send(prompt)}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => {
            const proposalId = message.action?.payload?.proposalId;
            const isProposal = message.action?.type === "proposal" && typeof proposalId === "string";

            return (
              <div
                key={message.id}
                className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-line ${
                    message.role === "user"
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"
                  }`}
                >
                  {message.content}

                  {isProposal && !message.resolved && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 rounded-full px-3 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={resolving === message.id}
                        onClick={() => void resolveProposal(message, "confirm")}
                      >
                        {resolving === message.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-full px-2 text-[11px] gap-1 text-gray-500"
                        disabled={resolving === message.id}
                        onClick={() => void resolveProposal(message, "cancel")}
                      >
                        <X className="size-3" />
                        Cancelar
                      </Button>
                    </div>
                  )}

                  {message.resolved && (
                    <p className="mt-1.5 text-[10px] opacity-70">
                      {message.resolved === "confirmed" ? "Confirmado" : "Cancelado"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-gray-100 px-3 py-2 dark:bg-gray-800">
                <Loader2 className="size-4 animate-spin text-emerald-600" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form
          className="shrink-0 flex items-center gap-2 border-t border-gray-100 px-3 py-2 dark:border-gray-800"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Escríbele a Aura…"
            className="min-w-0 flex-1 rounded-full border border-gray-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-emerald-400 dark:border-gray-700 dark:bg-gray-900"
            disabled={sending}
          />
          <Button
            type="submit"
            size="sm"
            className="size-9 shrink-0 rounded-full bg-emerald-600 p-0 hover:bg-emerald-700 text-white"
            disabled={sending || !input.trim()}
          >
            <Send className="size-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
