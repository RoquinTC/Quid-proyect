"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, toColombiaDateString } from "@/lib/api";
import { Loader2, Plus, X } from "lucide-react";
import type { MedicalOrder } from "@/lib/types";

type DraftItem = {
  name: string;
  prescribedQty: string;
  deliveredQty: string;
  unit: string;
  monthlyDose: string;
};

const emptyItem: DraftItem = {
  name: "",
  prescribedQty: "",
  deliveredQty: "",
  unit: "und",
  monthlyDose: "",
};

interface MedicalOrderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: MedicalOrder | null;
  onSuccess?: () => void;
}

export function MedicalOrderForm({ open, onOpenChange, order, onSuccess }: MedicalOrderFormProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(order?.title || "");
  const [orderNumber, setOrderNumber] = useState(order?.orderNumber || "");
  const [issueDate, setIssueDate] = useState(order?.issueDate ? toColombiaDateString(order.issueDate) : "");
  const [nextClaimDate, setNextClaimDate] = useState(order?.nextClaimDate ? toColombiaDateString(order.nextClaimDate) : "");
  const [notes, setNotes] = useState(order?.notes || "");
  const [items, setItems] = useState<DraftItem[]>(() =>
    order?.items?.length
      ? order.items.map((item) => ({
          name: item.name,
          prescribedQty: String(item.prescribedQty),
          deliveredQty: String(item.deliveredQty ?? 0),
          unit: item.unit || "und",
          monthlyDose: item.monthlyDose != null ? String(item.monthlyDose) : "",
        }))
      : [{ ...emptyItem }]
  );

  const isEditing = !!order;

  const updateItem = (index: number, field: keyof DraftItem, value: string) => {
    setItems((current) => current.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)));
  };

  const addItem = () => setItems((current) => [...current, { ...emptyItem }]);

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, idx) => idx !== index));
  };

  const resetForm = () => {
    if (!order) {
      setTitle("");
      setOrderNumber("");
      setIssueDate("");
      setNextClaimDate("");
      setNotes("");
      setItems([{ ...emptyItem }]);
    }
  };

  const handleSubmit = async () => {
    const cleanItems = items
      .filter((item) => item.name.trim() && Number(item.prescribedQty) > 0)
      .map((item) => ({
        name: item.name.trim(),
        prescribedQty: Number(item.prescribedQty),
        deliveredQty: item.deliveredQty ? Number(item.deliveredQty) : 0,
        unit: item.unit || "und",
        monthlyDose: item.monthlyDose ? Number(item.monthlyDose) : null,
      }));

    if (!title.trim() || cleanItems.length === 0) return;

    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        orderNumber: orderNumber || null,
        issueDate: issueDate || null,
        nextClaimDate: nextClaimDate || null,
        notes: notes || null,
        items: cleanItems,
      };

      if (isEditing && order) {
        await apiFetch(`/api/medical-orders/${order.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/medical-orders", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving medical order:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-lg rounded-2xl max-h-[90vh] sm:max-h-[88dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Orden Médica" : "Nueva Orden Médica"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="order-title">Nombre de la orden</Label>
            <Input
              id="order-title"
              placeholder="Ej: Medicamentos EPS mayo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="order-number">Número</Label>
              <Input
                id="order-number"
                placeholder="Opcional"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-date">Fecha</Label>
              <Input
                id="order-date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="claim-date">Próximo reclamo</Label>
            <Input
              id="claim-date"
              type="date"
              value={nextClaimDate}
              onChange={(e) => setNextClaimDate(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Medicamentos/insumos</Label>
              <Button type="button" variant="outline" size="sm" className="rounded-xl h-8" onClick={addItem}>
                <Plus className="size-3.5 mr-1" />
                Agregar
              </Button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="rounded-xl border border-gray-200 p-3 space-y-3 dark:border-gray-700">
                <div className="flex gap-2">
                  <Input
                    placeholder="Nombre"
                    value={item.name}
                    onChange={(e) => updateItem(index, "name", e.target.value)}
                    className="rounded-xl"
                  />
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => removeItem(index)}>
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ordenado"
                    value={item.prescribedQty}
                    onChange={(e) => updateItem(index, "prescribedQty", e.target.value)}
                    className="rounded-xl"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Entregado"
                    value={item.deliveredQty}
                    onChange={(e) => updateItem(index, "deliveredQty", e.target.value)}
                    className="rounded-xl"
                  />
                  <Input
                    placeholder="Unidad"
                    value={item.unit}
                    onChange={(e) => updateItem(index, "unit", e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Consumo mensual opcional"
                  value={item.monthlyDose}
                  onChange={(e) => updateItem(index, "monthlyDose", e.target.value)}
                  className="rounded-xl"
                />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="order-notes">Notas</Label>
            <Textarea
              id="order-notes"
              placeholder="Pendientes, autorización, farmacia..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl min-h-[80px] resize-none"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || !title.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-700 hover:to-pink-600"
          >
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {isEditing ? "Guardar Cambios" : "Crear Orden"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
