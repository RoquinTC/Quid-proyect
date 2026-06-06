"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useDataEvent } from "@/hooks/use-data-event";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReceiptUpload } from "@/components/finance/receipt-upload";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag,
  Plus,
  Loader2,
  CheckCircle,
  FileText,
  Clock,
  ArrowRight,
  ExternalLink,
  Package,
  ChevronDown,
} from "lucide-react";

interface Medication {
  id: string;
  name: string;
}

interface OrderItem {
  id: string;
  medicationId?: string | null;
  name: string;
  prescribedQty: number;
  deliveredQty: number;
  pendingQty: number;
  unit: string;
  monthlyDose?: number | null;
}

interface MedicalOrder {
  id: string;
  orderNumber?: string | null;
  title: string;
  issueDate: string;
  nextClaimDate?: string | null;
  status: string;
  notes?: string | null;
  receiptUrl?: string | null;
  items: OrderItem[];
}

export function PendingClaimsTab() {
  const [orders, setOrders] = useState<MedicalOrder[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);

  // Claim Dialog States
  const [activeOrder, setActiveOrder] = useState<MedicalOrder | null>(null);
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [claims, setClaims] = useState<
    Record<string, { quantityToClaim: number; medicationId: string }>
  >({});
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [nextClaimDate, setNextClaimDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "pending" | "partial" | "completed">("active");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersData, medsData] = await Promise.all([
        apiFetch<MedicalOrder[]>("/api/medical-orders"),
        apiFetch<Medication[]>("/api/medications"),
      ]);
      setOrders(ordersData);
      setMedications(medsData);
    } catch (error) {
      console.error("Error loading pending claims data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useDataEvent("medicalOrders", fetchData);
  useDataEvent("medications", fetchData);

  const handleOpenClaimDialog = (order: MedicalOrder) => {
    setActiveOrder(order);
    const initialClaims: Record<string, { quantityToClaim: number; medicationId: string }> = {};
    order.items.forEach((item) => {
      if (item.pendingQty > 0) {
        // Buscar coincidencia exacta o por substring en el catálogo local de medicamentos
        const matchingMed = medications.find(
          (m) => m.name.toLowerCase().trim() === item.name.toLowerCase().trim()
        );
        initialClaims[item.id] = {
          quantityToClaim: item.pendingQty,
          medicationId: item.medicationId || matchingMed?.id || "",
        };
      }
    });
    setClaims(initialClaims);
    setReceiptUrl(order.receiptUrl || null);
    setNextClaimDate(
      order.nextClaimDate ? new Date(order.nextClaimDate).toISOString().split("T")[0] : ""
    );
    setShowClaimDialog(true);
  };

  const handleClaimValueChange = (itemId: string, field: "quantityToClaim" | "medicationId", val: any) => {
    setClaims((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: val,
      },
    }));
  };

  const handleSubmitClaim = async () => {
    if (!activeOrder) return;
    setSubmitting(true);
    try {
      const claimsPayload = Object.entries(claims).map(([itemId, data]) => ({
        itemId,
        medicationId: data.medicationId || null,
        quantityToClaim: data.quantityToClaim,
      }));

      await apiFetch("/api/health/orders/claim", {
        method: "POST",
        body: JSON.stringify({
          orderId: activeOrder.id,
          claims: claimsPayload,
          receiptUrl,
          nextClaimDate: nextClaimDate || null,
        }),
      });

      setShowClaimDialog(false);
      setActiveOrder(null);
      fetchData();
    } catch (error) {
      console.error("Error confirming claim:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // Calcular total de medicamentos pendientes en "bolsa virtual"
  const pendingItemsTotal = orders.reduce((sum, order) => {
    return sum + order.items.reduce((itemSum, item) => itemSum + item.pendingQty, 0);
  }, 0);

  const getOrderStatusBadge = (order: MedicalOrder) => {
    if (order.status === "completed") {
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-250 dark:border-emerald-900 rounded-lg text-xs font-semibold px-2 py-0.5">
          Completada
        </Badge>
      );
    }
    if (order.status === "partial") {
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900 rounded-lg text-xs font-semibold px-2 py-0.5">
          Entrega Parcial
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded-lg text-xs font-semibold px-2 py-0.5">
        Pendiente
      </Badge>
    );
  };

  const filteredOrders = orders.filter((order) => {
    if (statusFilter === "active") return order.status !== "completed";
    return order.status === statusFilter;
  });

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-safe">
      {/* Tarjeta de Bolsa Virtual */}
      <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.08),transparent)] pointer-events-none" />
        <CardContent className="p-5 relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag className="size-4 text-violet-200" />
            <span className="text-sm text-violet-100">Bolsa Virtual de Pendientes</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold tracking-tight">{pendingItemsTotal}</p>
              <span className="text-xs text-violet-200">unidades de medicamento por reclamar</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-violet-200">Órdenes Activas</span>
              <p className="text-sm font-bold">
                {orders.filter((o) => o.status !== "completed").length} en farmacia
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { value: "active", label: "Activas" },
          { value: "pending", label: "Pendientes" },
          { value: "partial", label: "Parciales" },
          { value: "completed", label: "Completadas" },
        ].map((filter) => (
          <Button
            key={filter.value}
            variant={statusFilter === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(filter.value as typeof statusFilter)}
            className={`h-8 shrink-0 rounded-xl text-xs ${
              statusFilter === filter.value
                ? "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-950/40 dark:text-violet-300"
                : ""
            }`}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {/* Lista de órdenes médicas y sus entregas */}
      <div className="space-y-3">
        {orders.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Package className="size-10 mx-auto opacity-20 mb-2" />
            <p className="text-sm">No tienes recetas u órdenes de medicamentos registradas.</p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredOrders.map((order) => {
              const hasPendingItems = order.items.some((i) => i.pendingQty > 0);
              const isExpanded = expandedId === order.id;
              const pendingCount = order.items.filter((i) => i.pendingQty > 0).length;

              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200">
                    <CardContent className="p-3 space-y-3">
                      {/* Cabecera de la Orden */}
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        className="flex w-full items-start justify-between gap-2 text-left"
                      >
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                            {order.title}
                          </h4>
                          <span className="block truncate text-[10px] text-gray-400 font-medium uppercase">
                            Orden: {order.orderNumber || "Sin número"} • Expedida:{" "}
                            {new Date(order.issueDate).toLocaleDateString("es-CO")}
                          </span>
                          <span className="mt-1 block text-[11px] text-gray-500">
                            {pendingCount > 0 ? `${pendingCount} pendiente${pendingCount !== 1 ? "s" : ""} por reclamar` : "Entrega cerrada"}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {getOrderStatusBadge(order)}
                          <ChevronDown className={`size-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </button>

                      {/* Items de medicamentos */}
                      {isExpanded && <div className="space-y-2 pt-1">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex justify-between items-center text-xs p-2 rounded-xl bg-gray-50 dark:bg-gray-900/60"
                          >
                            <div className="space-y-0.5">
                              <span className="font-semibold text-gray-850 dark:text-gray-200">
                                {item.name}
                              </span>
                              <div className="flex gap-2 text-[10px] text-gray-400">
                                <span>Recetado: {item.prescribedQty} {item.unit}</span>
                                <span>•</span>
                                <span>Entregado: {item.deliveredQty} {item.unit}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              {item.pendingQty > 0 ? (
                                <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 rounded-md border-0 text-[10px]">
                                  {item.pendingQty} pendientes
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 rounded-md border-0 text-[10px]">
                                  Entregado
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>}

                      {/* Próximo reclamo o Soporte de Recibo */}
                      {(order.nextClaimDate || order.receiptUrl) && (
                        <div className="flex flex-wrap gap-2 text-xs border-t border-gray-50 dark:border-gray-800 pt-2.5">
                          {order.nextClaimDate && (
                            <div className="flex items-center gap-1 text-gray-500 bg-gray-50 dark:bg-gray-900 p-1.5 rounded-lg">
                              <Clock className="size-3.5 text-gray-400" />
                              <span>
                                Próxima entrega:{" "}
                                {new Date(order.nextClaimDate).toLocaleDateString("es-CO")}
                              </span>
                            </div>
                          )}
                          {order.receiptUrl && (
                            <a
                              href={order.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline bg-violet-50 dark:bg-violet-950/20 p-1.5 rounded-lg"
                            >
                              <FileText className="size-3.5" />
                              <span>Ver Soporte Pendiente</span>
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Botón de Reclamar */}
                      {isExpanded && hasPendingItems && (
                        <div className="flex justify-end pt-2 border-t border-gray-50 dark:border-gray-800">
                          <Button
                            size="sm"
                            className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs h-8"
                            onClick={() => handleOpenClaimDialog(order)}
                          >
                            <CheckCircle className="size-3.5 mr-1" /> Registrar Reclamo / Entrega
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* DIÁLOGO REGISTRAR RECLAMO/ENTREGA DE MEDICAMENTOS */}
      <Dialog open={showClaimDialog} onOpenChange={setShowClaimDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Entrega de Medicamentos</DialogTitle>
            <DialogDescription>
              Confirma cuántas unidades te entregaron hoy y asócialas al stock real de tu botiquín en casa.
            </DialogDescription>
          </DialogHeader>

          {activeOrder && (
            <div className="space-y-4 pt-2">
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-500">Medicamentos por Reclamar</Label>
                <div className="space-y-3">
                  {activeOrder.items
                    .filter((item) => item.pendingQty > 0)
                    .map((item) => {
                      const claimData = claims[item.id] || { quantityToClaim: 0, medicationId: "" };
                      return (
                        <div
                          key={item.id}
                          className="p-3 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-2.5"
                        >
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-800 dark:text-gray-200">
                              {item.name}
                            </span>
                            <span className="text-gray-400">
                              Pendientes: {item.pendingQty} {item.unit}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px] text-gray-400">Cantidad Entregada</Label>
                              <Input
                                type="number"
                                min="0"
                                max={item.pendingQty}
                                value={claimData.quantityToClaim}
                                onChange={(e) =>
                                  handleClaimValueChange(
                                    item.id,
                                    "quantityToClaim",
                                    Math.min(item.pendingQty, Number(e.target.value))
                                  )
                                }
                                className="rounded-xl h-9 text-xs"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[10px] text-gray-400">Medicamento en Botiquín</Label>
                              <Select
                                value={claimData.medicationId}
                                onValueChange={(val) =>
                                  handleClaimValueChange(item.id, "medicationId", val)
                                }
                              >
                                <SelectTrigger className="rounded-xl h-9 text-xs">
                                  <SelectValue placeholder="No asociar stock" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none_unlinked">No asociar a catálogo</SelectItem>
                                  {medications.map((med) => (
                                    <SelectItem key={med.id} value={med.id}>
                                      {med.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Upload de soporte de pendientes (foto de la farmacia) */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-500">Foto del Soporte / Recibo de Pendiente</Label>
                <div className="border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl p-2 bg-gray-50/50 dark:bg-transparent">
                  <ReceiptUpload
                    value={receiptUrl}
                    onChange={(url) => setReceiptUrl(url)}
                  />
                </div>
                <p className="text-[10px] text-gray-400">
                  Sube la foto del recibo firmado o la constancia de pendientes emitida por la farmacia.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="next-claim" className="text-xs text-gray-500">Próxima Fecha de Entrega / Reclamo (Opcional)</Label>
                <Input
                  id="next-claim"
                  type="date"
                  value={nextClaimDate}
                  onChange={(e) => setNextClaimDate(e.target.value)}
                  className="rounded-xl h-10 text-sm"
                />
              </div>

              <Button
                className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl h-10 font-medium"
                onClick={handleSubmitClaim}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="size-4 animate-spin mr-1" /> : <CheckCircle className="size-4 mr-1" />}
                Confirmar Entrega de Medicamentos
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
