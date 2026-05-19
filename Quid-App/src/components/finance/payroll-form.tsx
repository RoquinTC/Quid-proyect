"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogStickyFooter,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DaySelect } from "@/components/ui/day-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Loader2, Briefcase, Calendar, TrendingUp } from "lucide-react";
import { SubCategorySelector } from "./subcategory-selector";
import type { Account, CategoryData, PayrollGroup } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";

interface PayrollFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  editingGroup?: PayrollGroup | null;
}

const frequencyOptions = [
  { value: "monthly", label: "Mensual", desc: "1 pago al mes" },
  { value: "biweekly", label: "Quincenal", desc: "2 pagos al mes" },
  { value: "weekly", label: "Semanal", desc: "1 pago por semana" },
];

const dayOfWeekOptions = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

export function PayrollForm({ open, onOpenChange, onSuccess, editingGroup }: PayrollFormProps) {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);

  // Form state
  const [description, setDescription] = useState("Sueldo");
  const [frequency, setFrequency] = useState("monthly");
  const [accountId, setAccountId] = useState("");
  const [subAccountId, setSubAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [adjustToBusinessDay, setAdjustToBusinessDay] = useState(false);
  const [businessDayDirection, setBusinessDayDirection] = useState<"before" | "after">("before");

  // Schedule state
  const [monthlyDay, setMonthlyDay] = useState(1);
  const [monthlyAmount, setMonthlyAmount] = useState("");

  const [biweeklyDay1, setBiweeklyDay1] = useState(1);
  const [biweeklyAmount1, setBiweeklyAmount1] = useState("");
  const [biweeklyDay2, setBiweeklyDay2] = useState(15);
  const [biweeklyAmount2, setBiweeklyAmount2] = useState("");

  const [weeklyDayOfWeek, setWeeklyDayOfWeek] = useState(5); // Friday
  const [weeklyAmount, setWeeklyAmount] = useState("");

  // Available subcategories for current category
  const currentCategoryData = categories.find((c) => c.name === category);
  const availableSubCategories = currentCategoryData?.subcategories || [];

  // Sync form when dialog opens
  useEffect(() => {
    if (open && editingGroup) {
      setDescription(editingGroup.description || "Sueldo");
      setFrequency(editingGroup.frequency || "monthly");
      setAccountId(editingGroup.accountId || "");
      setSubAccountId(editingGroup.subAccountId || "");
      setCategory(editingGroup.category || "");
      setSubCategory(editingGroup.subCategory || "");
      setAdjustToBusinessDay(editingGroup.adjustToBusinessDay || false);
      setBusinessDayDirection((editingGroup.businessDayDirection as "before" | "after") || "before");

      try {
        const scheds = JSON.parse(editingGroup.schedules);
        if (editingGroup.frequency === "monthly" && scheds[0]) {
          setMonthlyDay(scheds[0].day || 1);
          setMonthlyAmount(scheds[0].amount?.toString() || "");
        } else if (editingGroup.frequency === "biweekly" && scheds.length === 2) {
          setBiweeklyDay1(scheds[0].day || 1);
          setBiweeklyAmount1(scheds[0].amount?.toString() || "");
          setBiweeklyDay2(scheds[1].day || 15);
          setBiweeklyAmount2(scheds[1].amount?.toString() || "");
        } else if (editingGroup.frequency === "weekly" && scheds[0]) {
          setWeeklyDayOfWeek(scheds[0].dayOfWeek ?? 5);
          setWeeklyAmount(scheds[0].amount?.toString() || "");
        }
      } catch {
        setMonthlyDay(1); setMonthlyAmount("");
        setBiweeklyDay1(1); setBiweeklyAmount1("");
        setBiweeklyDay2(15); setBiweeklyAmount2("");
        setWeeklyDayOfWeek(5); setWeeklyAmount("");
      }
    } else if (open) {
      setDescription("Sueldo");
      setFrequency("monthly");
      setAccountId("");
      setSubAccountId("");
      setCategory("");
      setSubCategory("");
      setAdjustToBusinessDay(false);
      setBusinessDayDirection("before");
      setMonthlyDay(1); setMonthlyAmount("");
      setBiweeklyDay1(1); setBiweeklyAmount1("");
      setBiweeklyDay2(15); setBiweeklyAmount2("");
      setWeeklyDayOfWeek(5); setWeeklyAmount("");
    }
  }, [open, editingGroup]);

  // Fetch accounts and categories
  useEffect(() => {
    if (!open) return;
    apiFetch<Account[]>("/api/accounts")
      .then(setAccounts)
      .catch(console.error);
    apiFetch<Record<string, CategoryData[]>>("/api/categories?type=income")
      .then((data) => setCategories(data.income || []))
      .catch(console.error);
  }, [open]);

  // Reset subcategory when category changes
  useEffect(() => {
    if (!editingGroup) {
      setSubCategory("");
    }
  }, [category, editingGroup]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const subAccounts = selectedAccount?.subAccounts || [];

  const getTotalAmount = (): number => {
    if (frequency === "monthly") return parseFloat(monthlyAmount) || 0;
    if (frequency === "biweekly") return (parseFloat(biweeklyAmount1) || 0) + (parseFloat(biweeklyAmount2) || 0);
    if (frequency === "weekly") return (parseFloat(weeklyAmount) || 0) * 4;
    return 0;
  };

  const handleSubmit = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      let schedules: Array<{ day?: number; dayOfWeek?: number; amount: number }> = [];

      if (frequency === "monthly") {
        schedules = [{ day: monthlyDay, amount: parseFloat(monthlyAmount) || 0 }];
      } else if (frequency === "biweekly") {
        schedules = [
          { day: biweeklyDay1, amount: parseFloat(biweeklyAmount1) || 0 },
          { day: biweeklyDay2, amount: parseFloat(biweeklyAmount2) || 0 },
        ];
      } else if (frequency === "weekly") {
        schedules = [{ dayOfWeek: weeklyDayOfWeek, amount: parseFloat(weeklyAmount) || 0 }];
      }

      const payload = {
        description,
        frequency,
        schedules,
        accountId,
        subAccountId: subAccountId || null,
        category: category || null,
        subCategory: subCategory || null,
        adjustToBusinessDay,
        businessDayDirection,
      };

      if (editingGroup) {
        await apiFetch(`/api/payroll/${editingGroup.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/payroll", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating payroll:", error);
    } finally {
      setLoading(false);
    }
  };

  const isValid = () => {
    if (!accountId) return false;
    if (frequency === "monthly" && (!monthlyAmount || parseFloat(monthlyAmount) <= 0)) return false;
    if (frequency === "biweekly" && (
      !biweeklyAmount1 || parseFloat(biweeklyAmount1) <= 0 ||
      !biweeklyAmount2 || parseFloat(biweeklyAmount2) <= 0
    )) return false;
    if (frequency === "weekly" && (!weeklyAmount || parseFloat(weeklyAmount) <= 0)) return false;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl" scrollable>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="size-5 text-emerald-600" />
            Asistente de Nómina
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Description */}
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Sueldo, Salario, Nómina"
              className="rounded-xl"
            />
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label>Frecuencia de pago</Label>
            <div className="grid grid-cols-3 gap-2">
              {frequencyOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFrequency(opt.value)}
                  className={`p-3 rounded-xl border-2 transition-all text-center ${
                    frequency === opt.value
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                  }`}
                >
                  <p className={`text-xs font-bold ${frequency === opt.value ? "text-emerald-700 dark:text-emerald-400" : "text-gray-600 dark:text-gray-400"}`}>
                    {opt.label}
                  </p>
                  <p className="text-[9px] text-gray-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Schedules based on frequency */}
          {frequency === "monthly" && (
            <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pago Mensual</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">Día del mes</Label>
                  <DaySelect
                    value={monthlyDay}
                    onValueChange={setMonthlyDay}
                    placeholder="Día del mes"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Monto</Label>
                  <CurrencyInput
                    value={monthlyAmount}
                    onChange={setMonthlyAmount}
                    showPrefix
                    placeholder="0"
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {frequency === "biweekly" && (
            <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pagos Quincenales</Label>
              {[
                { label: "Primera quincena", day: biweeklyDay1, setDay: setBiweeklyDay1, amount: biweeklyAmount1, setAmount: setBiweeklyAmount1 },
                { label: "Segunda quincena", day: biweeklyDay2, setDay: setBiweeklyDay2, amount: biweeklyAmount2, setAmount: setBiweeklyAmount2 },
              ].map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <p className="text-[10px] text-gray-500 font-medium">{item.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <DaySelect
                      value={item.day}
                      onValueChange={item.setDay}
                      placeholder="Día"
                      className="rounded-xl h-9 text-xs"
                    />
                    <CurrencyInput
                      value={item.amount}
                      onChange={item.setAmount}
                      showPrefix
                      placeholder="0"
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {frequency === "weekly" && (
            <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pago Semanal</Label>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Día de la semana</Label>
                  <Select value={weeklyDayOfWeek.toString()} onValueChange={(v) => setWeeklyDayOfWeek(parseInt(v))}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dayOfWeekOptions.map((d) => (
                        <SelectItem key={d.value} value={d.value.toString()}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Monto por semana</Label>
                  <CurrencyInput
                    value={weeklyAmount}
                    onChange={setWeeklyAmount}
                    showPrefix
                    placeholder="0"
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Account */}
          <div className="space-y-2">
            <Label>Cuenta de recepción</Label>
            <Select value={accountId} onValueChange={(v) => { setAccountId(v); setSubAccountId(""); }}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Seleccionar cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: acc.color }} />
                      {acc.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-account (optional) */}
          {subAccounts.length > 0 && (
            <div className="space-y-2">
              <Label>Bolsillo (opcional)</Label>
              <Select value={subAccountId} onValueChange={setSubAccountId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Cuenta principal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Cuenta principal</SelectItem>
                  {subAccounts.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Category — blank by default, user chooses */}
          <div className="space-y-2">
            <Label>Categoría</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v); setSubCategory(""); }}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.name} value={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-category */}
          <SubCategorySelector
            availableSubCategories={availableSubCategories}
            value={subCategory}
            onChange={setSubCategory}
            visible={!!category}
            resetKey={category}
          />

          {/* Business Day Adjustment */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Ajustar a día hábil</Label>
                <p className="text-[10px] text-gray-400">Si el día de pago cae fin de semana o festivo</p>
              </div>
              <Switch
                checked={adjustToBusinessDay}
                onCheckedChange={setAdjustToBusinessDay}
              />
            </div>

            {adjustToBusinessDay && (
              <div className="space-y-2 pt-1 border-t border-gray-200 dark:border-gray-700">
                <Label className="text-[11px]">Mover al día hábil</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBusinessDayDirection("before")}
                    className={`p-2 rounded-xl border-2 text-center transition-all ${
                      businessDayDirection === "before"
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <Calendar className="size-4 mx-auto mb-1 text-emerald-600" />
                    <p className="text-[10px] font-medium">Anterior</p>
                    <p className="text-[8px] text-gray-400">Lunes si es domingo</p>
                  </button>
                  <button
                    onClick={() => setBusinessDayDirection("after")}
                    className={`p-2 rounded-xl border-2 text-center transition-all ${
                      businessDayDirection === "after"
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                        : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <Calendar className="size-4 mx-auto mb-1 text-emerald-600" />
                    <p className="text-[10px] font-medium">Siguiente</p>
                    <p className="text-[8px] text-gray-400">Lunes si es sábado</p>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Summary Preview */}
          {isValid() && (
            <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="size-4 text-emerald-500" />
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Resumen Nómina
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(getTotalAmount())}
                  <span className="text-xs font-normal text-emerald-500 ml-1">/mes</span>
                </p>
                <div className="mt-2 space-y-1 text-[10px] text-gray-500">
                  <p>Frecuencia: {frequencyOptions.find((f) => f.value === frequency)?.label}</p>
                  {frequency === "monthly" && <p>Día {monthlyDay} de cada mes</p>}
                  {frequency === "biweekly" && <p>Días {biweeklyDay1} y {biweeklyDay2} de cada mes</p>}
                  {frequency === "weekly" && <p>Cada {dayOfWeekOptions.find((d) => d.value === weeklyDayOfWeek)?.label}</p>}
                  {adjustToBusinessDay && (
                    <p>Ajuste: día hábil {businessDayDirection === "before" ? "anterior" : "siguiente"}</p>
                  )}
                  {selectedAccount && <p>Cuenta: {selectedAccount.name}</p>}
                  {category && <p>Categoría: {category}{subCategory ? ` / ${subCategory}` : ""}</p>}
                </div>
              </CardContent>
            </Card>
          )}

        </DialogBody>
        <DialogStickyFooter>
          <Button
            onClick={handleSubmit}
            disabled={loading || !isValid()}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500"
          >
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Briefcase className="size-4 mr-2" />}
            {editingGroup ? "Guardar Cambios" : "Crear Asistente de Nómina"}
          </Button>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  );
}
