"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, Loader2, Bot, Mic } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type AuraMessage = { role: string; content: string };
type AuraAction = {
  type?: "proposal" | "executed" | string;
  tool?: string;
  requiresConfirmation?: boolean;
};

interface AuraQuickLogProps {
  onSuccess?: () => void;
}

export function AuraQuickLog({ onSuccess }: AuraQuickLogProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<AuraMessage[]>([]);
  const [pendingAction, setPendingAction] = useState<AuraAction | null>(null);
  const [showAura, setShowAura] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendToAura = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;
    setShowAura(true);
    
    const newMessages = [...messages, { role: "user", content: userMessage.trim() }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const res = await fetch("/api/aura/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Error comunicando con Aura");
      }

      setPendingAction(data.action?.type === "proposal" ? data.action : null);
      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
      
      // If Aura executed an action, we can trigger success callback
      if (data.action?.type === "executed") {
        setPendingAction(null);
        toast.success("Registro completado por Aura", {
          icon: <Sparkles className="size-4 text-cyan-500" />,
        });
        if (onSuccess) onSuccess();
        
        // Auto-hide after 3 seconds of success
        setTimeout(() => {
          setShowAura(false);
          setMessages([]);
        }, 3000);
      }
    } catch (error) {
      console.error("Aura Quick Log error:", error);
      toast.error("Error al procesar tu solicitud", {
        description: error instanceof Error ? error.message : "Intenta de nuevo",
      });
      // Pop the user message since it failed
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const userMessage = input.trim();
    setInput("");
    await sendToAura(userMessage);
  };

  const handleQuickReply = async (reply: "CONFIRMAR" | "CANCELAR") => {
    await sendToAura(reply);
  };

  const handleReset = () => {
    setMessages([]);
    setPendingAction(null);
    setShowAura(false);
    setInput("");
  };

  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const hasPendingProposal =
    Boolean(pendingAction?.requiresConfirmation) ||
    Boolean(lastAssistantMessage?.content.match(/responde confirmar|resumen para confirmar/i));

  return (
    <div className="w-full bg-white dark:bg-gray-900 border border-cyan-100 dark:border-cyan-900/30 rounded-2xl overflow-hidden shadow-sm shadow-cyan-500/5">
      {/* ── Chat history / Aura Response ── */}
      <AnimatePresence>
        {showAura && messages.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-cyan-50 dark:border-cyan-900/20 bg-cyan-50/30 dark:bg-cyan-950/20 px-4 py-3 space-y-3 max-h-60 overflow-y-auto text-sm"
          >
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="size-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm shadow-cyan-500/30">
                    <Sparkles className="size-3 text-white" />
                  </div>
                )}
                
                <div className={`px-3 py-2 rounded-xl max-w-[85%] whitespace-pre-wrap ${
                  msg.role === "user" 
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tr-sm" 
                    : "bg-white dark:bg-gray-800 border border-cyan-100 dark:border-cyan-800/30 text-gray-700 dark:text-gray-300 rounded-tl-sm shadow-sm"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="size-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shrink-0 shadow-sm shadow-cyan-500/30">
                  <Sparkles className="size-3 text-white" />
                </div>
                <div className="px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-cyan-100 dark:border-cyan-800/30">
                  <Loader2 className="size-4 animate-spin text-cyan-500" />
                </div>
              </div>
            )}
            {hasPendingProposal && !isLoading && (
              <div className="ml-8 rounded-2xl border border-cyan-100 bg-white p-3 shadow-sm dark:border-cyan-800/40 dark:bg-gray-900">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                  Revisa antes de guardar
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleQuickReply("CONFIRMAR")}
                    className="rounded-xl bg-cyan-600 text-xs hover:bg-cyan-700"
                  >
                    Confirmar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      inputRef.current?.focus();
                      toast.info("Escribe la corrección", {
                        description: "Ej: cambia el valor a 52.000 o usa otra tarjeta.",
                      });
                    }}
                    className="rounded-xl text-xs"
                  >
                    Editar
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleQuickReply("CANCELAR")}
                  className="mt-2 w-full rounded-xl text-xs text-gray-500"
                >
                  Cancelar registro
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input Area ── */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2 px-3">
        <div className="size-8 rounded-full bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 flex items-center justify-center shrink-0 border border-cyan-100 dark:border-cyan-800/50">
          <Bot className="size-4 text-cyan-600 dark:text-cyan-400" />
        </div>
        
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={showAura ? "Escribe tu respuesta..." : "Ej: Tanqueé 50mil en la TC..."}
          className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1 placeholder:text-gray-400 shadow-none"
          disabled={isLoading}
        />

        {showAura && messages.length > 0 && !isLoading && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2"
          >
            Cancelar
          </Button>
        )}
        
        {/* Placeholder for mic integration if we add it later */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded-full"
          disabled={isLoading}
          onClick={() => {
            toast.info("Función de micrófono en desarrollo", { description: "Pronto podrás dictarle a Aura con tu voz." })
          }}
        >
          <Mic className="size-4" />
        </Button>

        <Button
          type="submit"
          disabled={!input.trim() || isLoading}
          size="icon"
          className="size-8 rounded-full bg-cyan-600 hover:bg-cyan-700 shadow-sm shadow-cyan-500/20"
        >
          {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5 ml-0.5" />}
        </Button>
      </form>
    </div>
  );
}
