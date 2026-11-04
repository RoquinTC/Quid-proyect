"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormActions,
  FormDialog,
  FormField,
  FormSection,
} from "@/components/layout/form-kit";
import { apiFetch, toColombiaDateString } from "@/lib/api";
import { ClipboardList, FileText, Package, Paperclip, Plus, X } from "lucide-react";
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar orden médica" : "Nueva orden médica"}
      description="Registra lo ordenado y controla lo entregado frente a lo pendiente."
      icon={ClipboardList}
      tone="emerald"
      wide
      footer={
        <FormActions
          onCancel={() => onOpenChange(false)}
          submitLabel={isEditing ? "Guardar cambios" : "Crear orden"}
          submitType="button"
          onSubmit={handleSubmit}
          submitting={loading}
          disabled={!title.trim()}
        />
      }
    >
      <FormSection title="Datos de la orden" icon={ClipboardList}>
        <FormField label="Nombre de la orden" htmlFor="order-title">
          <Input
            id="order-title"
            placeholder="Ej: Medicamentos EPS mayo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Número" htmlFor="order-number" hint="Opcional">
            <Input
              id="order-number"
              placeholder="Opcional"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="rounded-xl"
            />
          </FormField>
          <FormField label="Fecha" htmlFor="order-date">
            <Input
              id="order-date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="rounded-xl"
            />
          </FormField>
        </div>

        <FormField
          label="Próximo reclamo"
          htmlFor="claim-date"
          hint="Se usa para recordarte cuándo volver a la farmacia."
        >
          <Input
            id="claim-date"
            type="date"
            value={nextClaimDate}
            onChange={(e) => setNextClaimDate(e.target.value)}
            className="rounded-xl"
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Rubros ordenados"
        icon={Package}
        hint="Un rubro por medicamento, insumo o terapia"
      >
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl" onClick={addItem}>
            <Plus className="size-3.5 mr-1" />
            Agregar rubro
          </Button>
        </div>

        {items.map((item, index) => (
          <div
            key={index}
            className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-900/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Rubro {index + 1}
                </p>
                <p className="text-[11px] text-gray-500">
                  Medicamento, insumo, terapia u orden pendiente.
                </p>
              </div>
              {items.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-xl"
                  onClick={() => removeItem(index)}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>

            <FormField label="Nombre del rubro">
              <Input
                placeholder="Ej: Losartán 50 mg, pañales, terapia física…"
                value={item.name}
                onChange={(e) => updateItem(index, "name", e.target.value)}
                className="rounded-xl"
              />
            </FormField>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FormField label="Cantidad ordenada" hint="Total de la orden.">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej: 30"
                  value={item.prescribedQty}
                  onChange={(e) => updateItem(index, "prescribedQty", e.target.value)}
                  className="rounded-xl"
                />
              </FormField>
              <FormField label="Cantidad entregada" hint="Lo que ya recibiste.">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej: 10"
                  value={item.deliveredQty}
                  onChange={(e) => updateItem(index, "deliveredQty", e.target.value)}
                  className="rounded-xl"
                />
              </FormField>
              <FormField label="Unidad" hint="Cómo se mide.">
                <Input
                  placeholder="und, cajas, ml…"
                  value={item.unit}
                  onChange={(e) => updateItem(index, "unit", e.target.value)}
                  className="rounded-xl"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FormField label="Consumo mensual" hint="Para proyectar el próximo reclamo.">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Opcional, ej: 30"
                  value={item.monthlyDose}
                  onChange={(e) => updateItem(index, "monthlyDose", e.target.value)}
                  className="rounded-xl"
                />
              </FormField>
              <FormField label="Indicaciones del rubro" hint="Ej: por cuotas, requiere autorización.">
                <Input
                  placeholder="Notas de este rubro"
                  value={item.notes}
                  onChange={(e) => updateItem(index, "notes", e.target.value)}
                  className="rounded-xl"
                />
              </FormField>
            </div>
          </div>
        ))}
      </FormSection>

      <FormSection title="Soporte de la orden" icon={Paperclip} collapsibleHint="opcional">
        <FormField label="Clasificación del soporte" htmlFor="support-type">
          <select
            id="support-type"
            value={supportType}
            onChange={(e) => setSupportType(e.target.value)}
            className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {SUPPORT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </FormField>
        <ReceiptUpload value={receiptUrl} onChange={setReceiptUrl} uploadLabel="Subir soporte" />
      </FormSection>

      <FormSection title="Notas" icon={FileText} collapsibleHint="opcional">
        <Textarea
          id="order-notes"
          placeholder="Pendientes, autorización, farmacia…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-[80px] rounded-xl resize-none"
        />
      </FormSection>
    </FormDialog>
  );
}
