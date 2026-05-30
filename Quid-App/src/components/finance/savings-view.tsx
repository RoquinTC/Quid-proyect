"use client";

import { useEffect, useState } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useLocalQuery } from "@/lib/local/hooks/queries";
import { useAppStore } from "@/lib/store";
import { SavingsGoalCard } from "./savings-goal-card";
import { SavingsGoalForm } from "./savings-goal-form";
import { SavingsContributeForm } from "./savings-contribute-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, PiggyBank, Sparkles, Loader2, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SavingsGoal } from "@/lib/types";

type EmergencySuggestion = {
  existingGoalId: string | null;
  recommendedTarget: number;
  currentEmergencyLiquidity: number;
  availableBalance: number;
  averageMonthlyExpenses: number;
  averageMonthlyRealIncome: number;
  fixedMonthlyExpenses: number;
  coverageMonths: number;
  monthsToBuild: number;
  contributionRate: number;
  incomeBasedContribution: number;
  gapMonthlyContribution: number;
  gap: number;
  monthlyContribution: number;
  configuredRealIncomeRules?: number;
  configuredFixedExpenseRules?: number;
  recommendedDeadline: string;
  aiSuggestion: string;
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function SavingsView() {
  const { setFinanceSubView } = useAppStore();
  const { data: goals, loading, refetch: fetchGoals } = useLocalQuery<SavingsGoal>("/api/savings");
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [contributeGoalId, setContributeGoalId] = useState<string | null>(null);
  const [contributeGoalName, setContributeGoalName] = useState("");
  const [contributeLinkedAccounts, setContributeLinkedAccounts] = useState<any[]>([]);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [emergencySuggestion, setEmergencySuggestion] = useState<EmergencySuggestion | null>(null);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [showEmergencyGoalForm, setShowEmergencyGoalForm] = useState(false);
  const [emergencyInitialGoal, setEmergencyInitialGoal] = useState<any | null>(null);
  const [emergencyCoverageMonths, setEmergencyCoverageMonths] = useState("3");
  const [emergencyBuildMonths, setEmergencyBuildMonths] = useState("6");

  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const hasEmergencyGoal = goals.some((goal) => goal.type === "emergency_fund");

  useEffect(() => {
    let cancelled = false;
    async function loadEmergencySuggestion() {
      setEmergencyLoading(true);
      try {
        const params = new URLSearchParams({
          coverageMonths: emergencyCoverageMonths,
          monthsToBuild: emergencyBuildMonths,
          contributionRate: "10",
        });
        const suggestion = await apiFetch<EmergencySuggestion>(`/api/savings/emergency-suggestion?${params.toString()}`);
        if (!cancelled) setEmergencySuggestion(suggestion);
      } catch (error) {
        console.error("Error loading emergency suggestion:", error);
      } finally {
        if (!cancelled) setEmergencyLoading(false);
      }
    }
    loadEmergencySuggestion();
    return () => { cancelled = true; };
  }, [emergencyBuildMonths, emergencyCoverageMonths]);

  const handleContribute = (goalId: string, goalName: string, linkedAccounts: any[] = []) => {
    setContributeGoalId(goalId);
    setContributeGoalName(goalName);
    setContributeLinkedAccounts(linkedAccounts);
  };

  const handleGoalClick = (goalId: string) => {
    sessionStorage.setItem("selectedSavingsGoalId", goalId);
    setFinanceSubView("savings-detail");
  };

  const handleEditGoal = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setShowGoalForm(true);
  };

  const handleCreateNew = () => {
    setEditingGoal(null);
    setShowGoalForm(true);
  };

  const handleFormSuccess = () => {
    fetchGoals();
    setEditingGoal(null);
  };

  const handleFormClose = (open: boolean) => {
    setShowGoalForm(open);
    if (!open) {
      setEditingGoal(null);
    }
  };

  const handleDeleteGoal = async () => {
    if (!deleteGoalId) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/savings/${deleteGoalId}`, { method: "DELETE" });
      setDeleteGoalId(null);
      fetchGoals();
    } catch (error) {
      console.error("Error deleting savings goal:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateEmergencyFund = async () => {
    if (!emergencySuggestion) return;

    setEmergencyInitialGoal({
      name: "Fondo de emergencia",
      description: "Colchón para cubrir gastos esenciales ante imprevistos.",
      targetAmount: emergencySuggestion.recommendedTarget,
      deadline: emergencySuggestion.recommendedDeadline,
      frequency: "mensual",
      monthlyDay: 1,
      type: "emergency_fund",
      icon: "Shield",
      color: "#0EA5E9",
      aiSuggestion: emergencySuggestion.aiSuggestion,
    });
    setEditingGoal(null);
    setShowEmergencyGoalForm(true);
  };

  const handleEmergencyFormClose = (open: boolean) => {
    setShowEmergencyGoalForm(open);
    if (!open) setEmergencyInitialGoal(null);
  };

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
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-safe"
    >
      {/* Total Savings Header */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-purple-600 to-violet-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <PiggyBank className="size-4 text-purple-200" />
              <span className="text-sm text-purple-100">Total Ahorrado</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">
              {formatCurrency(totalSaved)}
            </p>
            {totalTarget > 0 && (
              <p className="text-xs text-purple-200 mt-1">
                Meta total: {formatCurrency(totalTarget)}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* AI Suggestion Card */}
      {emergencySuggestion && !hasEmergencyGoal && (
        <motion.div variants={itemVariants}>
          <Card className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 to-cyan-50 shadow-sm dark:border-sky-900/40 dark:from-sky-950/30 dark:to-cyan-950/20">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="size-4 text-sky-600" />
                <span className="text-sm font-semibold text-sky-800 dark:text-sky-200">
                  Fondo de emergencia inteligente
                </span>
              </div>
              <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                {emergencySuggestion.aiSuggestion}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white/70 p-2 dark:bg-gray-900/50">
                  <p className="text-gray-500">Meta sugerida</p>
                  <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(emergencySuggestion.recommendedTarget)}</p>
                </div>
                <div className="rounded-xl bg-white/70 p-2 dark:bg-gray-900/50">
                  <p className="text-gray-500">Aporte sugerido</p>
                  <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(emergencySuggestion.monthlyContribution)}</p>
                </div>
                <div className="rounded-xl bg-white/70 p-2 dark:bg-gray-900/50">
                  <p className="text-gray-500">Ingreso real prom.</p>
                  <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(emergencySuggestion.averageMonthlyRealIncome)}</p>
                </div>
                <div className="rounded-xl bg-white/70 p-2 dark:bg-gray-900/50">
                  <p className="text-gray-500">10% ingreso real</p>
                  <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(emergencySuggestion.incomeBasedContribution)}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-gray-500">Cubrir</p>
                  <Select value={emergencyCoverageMonths} onValueChange={setEmergencyCoverageMonths}>
                    <SelectTrigger className="h-9 rounded-xl bg-white/80 text-xs dark:bg-gray-900/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 mes</SelectItem>
                      <SelectItem value="3">3 meses</SelectItem>
                      <SelectItem value="6">6 meses</SelectItem>
                      <SelectItem value="12">12 meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-gray-500">Construir en</p>
                  <Select value={emergencyBuildMonths} onValueChange={setEmergencyBuildMonths}>
                    <SelectTrigger className="h-9 rounded-xl bg-white/80 text-xs dark:bg-gray-900/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 meses</SelectItem>
                      <SelectItem value="6">6 meses</SelectItem>
                      <SelectItem value="9">9 meses</SelectItem>
                      <SelectItem value="12">12 meses</SelectItem>
                      <SelectItem value="18">18 meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                El aporte divide la meta pendiente entre los meses elegidos. {emergencySuggestion.configuredRealIncomeRules || emergencySuggestion.configuredFixedExpenseRules
                  ? "El cálculo ya está usando las categorías marcadas para fondo de emergencia."
                  : "Marca ingresos reales y gastos fijos en Presupuesto para afinar el cálculo."}
              </p>
              <Button
                onClick={handleCreateEmergencyFund}
                disabled={emergencyLoading}
                className="mt-3 w-full rounded-xl bg-sky-600 hover:bg-sky-700"
              >
                <ShieldCheck className="mr-2 size-4" />
                Configurar fondo sugerido
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* AI Suggestion Card */}
      {goals.some((g) => g.aiSuggestion) && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="size-4 text-purple-500" />
                <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">
                  Plan IA
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
                {goals.find((g) => g.aiSuggestion)?.aiSuggestion}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Goals List */}
      {goals.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-500 shadow-lg mb-4">
                <PiggyBank className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                Sin metas de ahorro
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Crea una meta para empezar a ahorrar hacia tus objetivos
              </p>
              <Button
                onClick={handleCreateNew}
                className="rounded-xl bg-gradient-to-r from-purple-600 to-violet-500"
              >
                <Plus className="size-4 mr-1" />
                Crear Meta
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => (
            <motion.div key={goal.id} variants={itemVariants}>
              <SavingsGoalCard
                goal={goal}
                onContribute={() => handleContribute(goal.id, goal.name, goal.linkedAccounts)}
                onClick={() => handleGoalClick(goal.id)}
                onEdit={() => handleEditGoal(goal)}
                onDelete={() => setDeleteGoalId(goal.id)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Goal Form Dialog */}
      <SavingsGoalForm
        open={showGoalForm}
        onOpenChange={handleFormClose}
        editingGoal={editingGoal}
        onSuccess={handleFormSuccess}
      />

      <SavingsGoalForm
        open={showEmergencyGoalForm}
        onOpenChange={handleEmergencyFormClose}
        initialGoal={emergencyInitialGoal}
        onSuccess={(goal) => {
          handleEmergencyFormClose(false);
          handleFormSuccess();
          return goal;
        }}
      />

      {/* Contribute Sheet */}
      {contributeGoalId && (
        <SavingsContributeForm
          open={!!contributeGoalId}
          onOpenChange={(open) => {
            if (!open) {
              setContributeGoalId(null);
              setContributeGoalName("");
              setContributeLinkedAccounts([]);
            }
          }}
          goalId={contributeGoalId}
          goalName={contributeGoalName}
          linkedAccounts={contributeLinkedAccounts}
          onSuccess={fetchGoals}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteGoalId} onOpenChange={(open) => { if (!open) setDeleteGoalId(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta meta de ahorro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la meta, todos sus aportes y pagos recurrentes asociados. Los CDTs vinculados se desvincularán. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-500 hover:bg-red-600"
              onClick={handleDeleteGoal}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
