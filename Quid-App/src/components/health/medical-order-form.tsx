"use client";

import { useEffect, useState } from "react";
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
import { FileText, Loader2, Plus, X } from "lucide-react";
import { ReceiptUpload } from "@/components/finance/receipt-upload";
import type { MedicalOrder } from "@/lib/types";

type DraftItem = {
  name: string;
  prescribedQty: string;
  deliveredQty: string;
  unit: string;
  monthlyDose: string;
  notes: string;
};

const emptyItem: DraftItem = {
  name: "",
  prescribedQty: "",
  deliveredQty: "",
  unit: "und",
  monthlyDose: "",
  notes: "",
};

const SUPPORT_TYPES = [
  "Orden medica",
  "Formula de medicamentos",
  "Autorizacion",
  "Historia clinica",
  "Incapacidad",
  "Recibo o pendiente de farmacia",
  "Otro soporte",
];

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
  const [receiptUrl, setReceiptUrl] = useState<string | null>(order?.receiptUrl || null);
  const [supportType, setSupportType] = useState(SUPPORT_TYPES[0]);
  const [items, setItems] = useState<DraftItem[]>(() =>
    order?.items?.length
      ? order.items.map((item) => ({
          name: item.name,
          prescribedQty: String(item.prescribedQty),
          deliveredQty: String(item.deliveredQty ?? 0),
          unit: item.unit || "und",
          monthlyDose: item.monthlyDose != null ? String(item.monthlyDose) : "",
          notes: item.notes || "",
        }))
      : [{ ...emptyItem }]
  );

  const isEditing = !!order;

  useEffect(() => {
    if (!open) return;
    setTitle(order?.title || "");
    setOrderNumber(order?.orderNumber || "");
    setIssueDate(order?.issueDate ? toColombiaDateString(order.issueDate) : "");
    setNextClaimDate(order?.nextClaimDate ? toColombiaDateString(order.nextClaimDate) : "");
    setNotes(order?.notes || "");
    setReceiptUrl(order?.receiptUrl || null);
    setSupportType(SUPPORT_TYPES[0]);
    setItems(
      order?.items?.length
        ? order.items.map((item) => ({
            name: item.name,
            prescribedQty: String(item.prescribedQty),
            deliveredQty: String(item.deliveredQty ?? 0),
            unit: item.unit || "und",
            monthlyDose: item.monthlyDose != null ? String(item.monthlyDose) : "",
            notes: item.notes || "",
          }))
        : [{ ...emptyItem }]
    );
  }, [open, order]);

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
      setReceiptUrl(null);
      setSupportType(SUPPORT_TYPES[0]);
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
        notes: item.notes.trim() || null,
      }));

    if (!title.trim() || cleanItems.length === 0) return;

    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        orderNumber: orderNumber || null,
        issueDate: issueDate || undefined,
        nextClaimDate: nextClaimDate || null,
        notes: [notes.trim(), receiptUrl ? `Tipo de soporte: ${supportType}` : ""].filter(Boolean).join("\n") || null,
        receiptUrl,
        receiptThumbnail: null,
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
              <div>
                <Label>Medicamentos o insumos ordenados</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Registra cada medicamento, insumo o rubro por separado para controlar lo entregado y lo pendiente.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="rounded-xl h-8" onClick={addItem}>
                <Plus className="size-3.5 mr-1" />
                Agregar
              </Button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="rounded-xl border border-gray-200 p-3 space-y-3 dark:border-gray-700">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                    Rubro {index + 1}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Un rubro puede ser un medicamento, un insumo, una terapia, una orden o un elemento pendiente por reclamar.
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs">Nombre del rubro</Label>
                    <Input
                      placeholder="Ej: Losartán 50 mg, pañales, terapia física..."
                      value={item.name}
                      onChange={(e) => updateItem(index, "name", e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => removeItem(index)}>
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cantidad ordenada</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ej: 30"
                      value={item.prescribedQty}
                      onChange={(e) => updateItem(index, "prescribedQty", e.target.value)}
                      className="rounded-xl"
                    />
                    <p className="text-[10px] text-gray-400">Total que aparece en la orden.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cantidad entregada</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ej: 10"
                      value={item.deliveredQty}
                      onChange={(e) => updateItem(index, "deliveredQty", e.target.value)}
                      className="rounded-xl"
                    />
                    <p className="text-[10px] text-gray-400">Lo que ya recibiste.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Unidad</Label>
                    <Input
                      placeholder="und, cajas, ml..."
                      value={item.unit}
                      onChange={(e) => updateItem(index, "unit", e.target.value)}
                      className="rounded-xl"
                    />
                    <p className="text-[10px] text-gray-400">Cómo se mide el rubro.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Consumo mensual</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Opcional, ej: 30"
                      value={item.monthlyDose}
                      onChange={(e) => updateItem(index, "monthlyDose", e.target.value)}
                      className="rounded-xl"
                    />
                    <p className="text-[10px] text-gray-400">Ayuda a proyectar cuándo reclamar de nuevo.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Indicaciones del rubro</Label>
                    <Input
                      placeholder="Ej: entregar por cuotas, requiere autorización..."
                      value={item.notes}
                      onChange={(e) => updateItem(index, "notes", e.target.value)}
                      className="rounded-xl"
                    />
                    <p className="text-[10px] text-gray-400">Notas propias de este medicamento o insumo.</p>
                  </div>
                </div>
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

          <div className="space-y-2 rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/50 p-3 dark:border-cyan-900/50 dark:bg-cyan-950/10">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                <FileText className="size-4" />
              </div>
              <div className="min-w-0">
                <Label className="text-sm font-bold">Soporte de la orden</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Adjunta un PDF escaneado o una foto de la orden, fórmula o soporte general. Si el documento corresponde a un rubro específico, indícalo en las notas de ese rubro.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-type" className="text-xs">Clasificación del soporte</Label>
              <select
                id="support-type"
                value={supportType}
                onChange={(e) => setSupportType(e.target.value)}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-cyan-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                {SUPPORT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Esta clasificación queda guardada en las notas de la orden para que luego sea fácil ubicar el soporte.
              </p>
            </div>
            <ReceiptUpload value={receiptUrl} onChange={setReceiptUrl} uploadLabel="Subir soporte" />
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
