"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Send,
  Link as LinkIcon,
  Loader2,
  CheckCircle2,
  Cpu,
  Sliders,
  Sparkles,
  ShieldAlert,
  Calendar,
  Smile,
  Trash2,
} from "lucide-react";

type AuraSettingsProps = {
  settings: { telegramId?: string | null };
  updateSetting: (key: string, value: unknown) => Promise<void>;
  auraPairingCode: string;
  setAuraPairingCode: (code: string) => void;
  auraLinked: boolean;
  setAuraLinked: (linked: boolean) => void;
  setResetResult: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

export function AuraSettings({
  settings,
  updateSetting,
  auraPairingCode,
  setAuraPairingCode,
  auraLinked,
  setAuraLinked,
  setResetResult,
  setError,
}: AuraSettingsProps) {
  const [linkingAura, setLinkingAura] = useState(false);
  // Advanced preferences local state (for rich UI demonstration/persistence in future APIs)
  const [aiModel, setAiModel] = useState("gemini-1.5-flash");
  const [dailyDigest, setDailyDigest] = useState(true);
  const [dailyDigestTime, setDailyDigestTime] = useState("20:00");
  const [tone, setTone] = useState("friendly");
  const [writePermissions, setWritePermissions] = useState(true);
  const [tools, setTools] = useState({
    finances: true,
    health: true,
    transport: true,
    pantry: false,
  });

  const toggleTool = (tool: keyof typeof tools) => {
    setTools((prev) => ({ ...prev, [tool]: !prev[tool] }));
    setResetResult("Herramientas de Aura actualizadas");
    setTimeout(() => setResetResult(null), 2000);
  };

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={[]} className="space-y-2">
        {/* Conexión con Telegram */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="conexion" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <Send className="size-4 text-blue-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Conexión Telegram</span>
                <Badge
                  variant="secondary"
                  className={`text-xs ml-auto mr-2 ${
                    auraLinked
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                  }`}
                >
                  {auraLinked ? "Vinculado" : "Pendiente"}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <Card className="border border-blue-100 dark:border-blue-900/30 shadow-none rounded-xl bg-blue-50/10 dark:bg-blue-900/5">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-2xl bg-blue-500 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                      <Send className="size-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">Habla con Aura</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Controla tus presupuestos, registra gastos y haz consultas usando comandos de Telegram y lenguaje natural.
                      </p>
                    </div>
                  </div>

                  {!auraLinked ? (
                    <div className="space-y-4">
                      <div className="bg-blue-50/50 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-100/50 dark:border-blue-900/30 space-y-2">
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">¿No tienes tu código de vinculación?</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                          Abre un chat con Aura en Telegram y envíale el comando <code className="bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded font-mono font-bold text-blue-700 dark:text-blue-300">/start</code> para recibir un código de vinculación de 6 dígitos.
                        </p>
                        <Button
                          type="button"
                          className="w-full bg-[#0088cc] hover:bg-[#0077b5] text-white border-0 rounded-xl py-3.5 h-auto text-xs font-bold gap-2 shadow-sm transition-all"
                          onClick={() => window.open("https://t.me/Aura_RQC_Bot", "_blank")}
                        >
                          <Send className="size-3.5 text-white" />
                          Abrir Bot y Obtener Código
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="pairing-code" className="text-xs uppercase tracking-wider font-bold text-gray-400">
                          Código de vinculación
                        </Label>
                        <input
                          id="pairing-code"
                          type="text"
                          placeholder="NLMR3J"
                          value={auraPairingCode}
                          onChange={(e) => setAuraPairingCode(e.target.value.toUpperCase())}
                          className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all uppercase text-center font-bold"
                          maxLength={6}
                        />
                      </div>
                      <Button
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-6 shadow-md gap-2"
                        disabled={linkingAura || auraPairingCode.length < 4}
                        onClick={async () => {
                          setLinkingAura(true);
                          try {
                            const res = await fetch("/api/aura/link", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ code: auraPairingCode }),
                            });

                            const data = await res.json();
                            if (res.ok && data.success) {
                              setAuraLinked(true);
                              setResetResult("¡Aura vinculada con éxito! 🌸");
                            } else {
                              throw new Error(data.error || "Error al vincular");
                            }
                          } catch (err: any) {
                            setError(err.message || "Código inválido o expirado");
                          } finally {
                            setLinkingAura(false);
                          }
                        }}
                      >
                        {linkingAura ? <Loader2 className="size-4 animate-spin" /> : <LinkIcon className="size-4" />}
                        Vincular con Telegram
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                        <div className="size-8 rounded-full bg-emerald-500 flex items-center justify-center">
                          <CheckCircle2 className="size-4 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">¡Vinculación Activa!</p>
                          <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70">Tu cuenta está lista para recibir comandos.</p>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        className="w-full bg-[#0088cc] hover:bg-[#0077b5] text-white border-0 rounded-xl py-6 shadow-md gap-2"
                        onClick={() => window.open("https://t.me/Aura_RQC_Bot", "_blank")}
                      >
                        <Send className="size-4 text-white" />
                        Abrir Chat en Telegram
                      </Button>

                      <Button
                        variant="outline"
                        className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20 rounded-xl py-6 shadow-sm gap-2"
                        onClick={async () => {
                          if (confirm("¿Estás seguro de que deseas desvincular Aura de tu cuenta de Telegram? No podrás volver a enviar comandos hasta que la vincules de nuevo.")) {
                            try {
                              const res = await fetch("/api/aura/link", {
                                method: "DELETE",
                              });
                              if (res.ok) {
                                setAuraLinked(false);
                                setAuraPairingCode("");
                                setResetResult("Aura desvinculada con éxito");
                                setTimeout(() => setResetResult(null), 3000);
                              } else {
                                throw new Error("Error al desvincular");
                              }
                            } catch (err: any) {
                              setError(err.message || "Error al desvincular");
                            }
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                        Desvincular Telegram
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Modelo de Lenguaje AI */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="modelo" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                  <Cpu className="size-4 text-indigo-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Modelo e Inteligencia</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <Cpu className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Motor LLM de Aura</p>
                        <p className="text-xs text-gray-400">Modelo cognitivo de procesamiento</p>
                      </div>
                    </div>
                    <Select value={aiModel} onValueChange={(val) => { setAiModel(val); setResetResult(`Modelo cambiado a ${val}`); setTimeout(() => setResetResult(null), 2000); }}>
                      <SelectTrigger className="w-40 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (Rápido)</SelectItem>
                        <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro (Complejo)</SelectItem>
                        <SelectItem value="hermes-3">Hermes 3 Local (Privado)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <ShieldAlert className="size-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Permisos de escritura directos</p>
                        <p className="text-xs text-gray-400">Permitir que Aura guarde transacciones sin confirmar</p>
                      </div>
                    </div>
                    <Switch checked={writePermissions} onCheckedChange={(val) => { setWritePermissions(val); setResetResult(val ? "Escritura directa activada" : "Confirmación manual activada"); setTimeout(() => setResetResult(null), 2000); }} />
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Herramientas Habilitadas */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="herramientas" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center shrink-0">
                  <Sparkles className="size-4 text-pink-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Módulos Habilitados (Skills)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Card
                  className={`border cursor-pointer transition-all ${
                    tools.finances
                      ? "border-emerald-200 bg-emerald-50/10 dark:border-emerald-900/30"
                      : "border-gray-100 opacity-60"
                  }`}
                  onClick={() => toggleTool("finances")}
                >
                  <CardContent className="p-3 space-y-1">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">Finanzas</p>
                    <p className="text-[10px] text-gray-400">Saldos, presupuestos y gastos</p>
                  </CardContent>
                </Card>

                <Card
                  className={`border cursor-pointer transition-all ${
                    tools.health
                      ? "border-rose-200 bg-rose-50/10 dark:border-rose-900/30"
                      : "border-gray-100 opacity-60"
                  }`}
                  onClick={() => toggleTool("health")}
                >
                  <CardContent className="p-3 space-y-1">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">Salud</p>
                    <p className="text-[10px] text-gray-400">Medicamentos y citas</p>
                  </CardContent>
                </Card>

                <Card
                  className={`border cursor-pointer transition-all ${
                    tools.transport
                      ? "border-blue-200 bg-blue-50/10 dark:border-blue-900/30"
                      : "border-gray-100 opacity-60"
                  }`}
                  onClick={() => toggleTool("transport")}
                >
                  <CardContent className="p-3 space-y-1">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">Transporte</p>
                    <p className="text-[10px] text-gray-400">Mantenimientos y carga</p>
                  </CardContent>
                </Card>

                <Card
                  className={`border cursor-pointer transition-all ${
                    tools.pantry
                      ? "border-amber-200 bg-amber-50/10 dark:border-amber-900/30"
                      : "border-gray-100 opacity-60"
                  }`}
                  onClick={() => toggleTool("pantry")}
                >
                  <CardContent className="p-3 space-y-1">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">Despensa</p>
                    <p className="text-[10px] text-gray-400">Stock y listas de mercado</p>
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Tono y Digest Diario */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="comportamiento" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                  <Sliders className="size-4 text-orange-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Comportamiento y Tono</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                        <Smile className="size-3.5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Tono de conversación</p>
                        <p className="text-xs text-gray-400">Personalidad comunicativa</p>
                      </div>
                    </div>
                    <Select value={tone} onValueChange={(val) => { setTone(val); setResetResult(`Tono de Aura cambiado`); setTimeout(() => setResetResult(null), 2000); }}>
                      <SelectTrigger className="w-28 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">Cercano 🌸</SelectItem>
                        <SelectItem value="professional">Profesional 💼</SelectItem>
                        <SelectItem value="sarcastic">Sarcástico 🎭</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Calendar className="size-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Resumen diario automático</p>
                        <p className="text-xs text-gray-400">Envío de resumen a Telegram</p>
                      </div>
                    </div>
                    <Switch checked={dailyDigest} onCheckedChange={(val) => { setDailyDigest(val); setResetResult(val ? "Resumen diario programado" : "Resumen desactivado"); setTimeout(() => setResetResult(null), 2000); }} />
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>
      </Accordion>
    </div>
  );
}
