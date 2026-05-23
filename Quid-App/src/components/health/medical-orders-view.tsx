"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Edit3, FileClock, Plus, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import type { MedicalOrder } from "@/lib/types";
import { MedicalOrderForm } from "./medical-order-form";

const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" },
  partial: { label: "Parcial", className: "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300" },
  completed: { label: "Completa", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" },
  cancelled: { label: "Cancelada", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

export function MedicalOrdersView() {
  const [orders, setOrders] = useState<MedicalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<MedicalOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await apiFetch<MedicalOrder[]>("/api/medical-orders");
      setOrders(data);
    } catch (error) {
      console.error("Error fetching medical orders:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const summary = useMemo(() => {
    const pendingItems = orders.flatMap((order) => order.items || []).filter((item) => item.pendingQty > 0).length;
    const nextClaim = orders
      .filter((order) => order.nextClaimDate && order.status !== "completed")
      .sort((a, b) => new Date(a.nextClaimDate!).getTime() - new Date(b.nextClaimDate!).getTime())[0];

    return { pendingItems, nextClaim };
  }, [orders]);

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/medical-orders/${id}`, { method: "DELETE" });
      fetchOrders();
    } catch (error) {
      console.error("Error deleting medical order:", error);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 space-y-4 pb-safe">
      <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-cyan-600 to-teal-500 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.12),transparent)] pointer-events-none" />
        <CardContent className="p-5 relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="size-4 text-cyan-100" />
            <span className="text-sm text-cyan-100">Órdenes Médicas</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold tracking-tight">{orders.length}</p>
              <span className="text-xs text-cyan-100">{summary.pendingItems} ítem{summary.pendingItems !== 1 ? "s" : ""} pendiente{summary.pendingItems !== 1 ? "s" : ""}</span>
            </div>
            {summary.nextClaim?.nextClaimDate && (
              <div className="text-right">
                <span className="text-xs text-cyan-100">Próximo reclamo</span>
                <p className="text-sm font-bold">{formatDate(summary.nextClaim.nextClaimDate)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {orders.length === 0 ? (
        <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20">
          <CardContent className="p-8 text-center">
            <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 shadow-lg mb-4">
              <ClipboardList className="size-7 text-white" />
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">Sin órdenes médicas</h3>
            <p className="text-sm text-gray-500 mb-4">
              Crea órdenes para controlar entregas parciales y pendientes.
            </p>
            <Button className="rounded-xl bg-gradient-to-r from-cyan-600 to-teal-500" onClick={() => setShowForm(true)}>
              <Plus className="size-4 mr-1" />
              Crear Orden
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const status = statusLabels[order.status] || statusLabels.pending;
            const pendingItems = (order.items || []).filter((item) => item.pendingQty > 0);

            return (
              <Card key={order.id} className="border-0 shadow-md rounded-2xl">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{order.title}</h3>
                      <p className="text-xs text-gray-500">
                        {order.orderNumber ? `Orden ${order.orderNumber} · ` : ""}
                        {formatDate(order.issueDate)}
                      </p>
                    </div>
                    <Badge className={`${status.className} border-0`}>{status.label}</Badge>
                  </div>

                  {order.nextClaimDate && (
                    <div className="flex items-center gap-1.5 text-xs text-cyan-700 dark:text-cyan-300">
                      <FileClock className="size-3.5" />
                      Próximo reclamo: {formatDate(order.nextClaimDate)}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {(order.items || []).map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800">
                        <span className="font-medium text-gray-700 dark:text-gray-200">{item.name}</span>
                        <span className={item.pendingQty > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}>
                          {item.deliveredQty}/{item.prescribedQty} {item.unit}
                        </span>
                      </div>
                    ))}
                  </div>

                  {pendingItems.length > 0 && (
                    <div className="rounded-xl bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                      Pendiente: {pendingItems.map((item) => `${item.name} (${item.pendingQty} ${item.unit})`).join(", ")}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl h-8 text-xs"
                      onClick={() => {
                        setEditingOrder(order);
                        setShowForm(true);
                      }}
                    >
                      <Edit3 className="size-3.5 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl h-8 text-xs border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(order.id)}
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {orders.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 md:right-8 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <Button
            onClick={() => {
              setEditingOrder(null);
              setShowForm(true);
            }}
            className="size-14 rounded-full bg-gradient-to-br from-cyan-600 to-teal-500 shadow-lg shadow-cyan-500/30"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      <MedicalOrderForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingOrder(null);
        }}
        order={editingOrder}
        onSuccess={fetchOrders}
      />
    </motion.div>
  );
}
