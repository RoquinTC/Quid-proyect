"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { SavingsGoalCard } from "./savings-goal-card";
import { SavingsGoalForm } from "./savings-goal-form";
import { SavingsContributeForm } from "./savings-contribute-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, PiggyBank, Sparkles, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

interface SavingsGoal {
  id: string;
  name: string;
  description?: string | null;
  targetAmount: number;
  currentAmount: number;
  deadline?: string | null;
  type: string;
  color: string;
  icon?: string | null;
  aiSuggestion?: string | null;
  isActive: boolean;
  frequency?: string;
  monthlyDay?: number | null;
  biweeklyDays?: string | null;
  weeklyDay?: number | null;
  periodAmounts?: string | null;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
  contributions: Array<{
    id: string;
    amount: number;
    date: string;
    description?: string | null;
  }>;
  cdts?: Array<{
    id: string;
    amount: number;
    termDays: number;
    effectiveRate: number;
    bank: string;
    status: string;
  }>;
  linkedAccounts?: Array<{
    id: string;
    accountId: string;
    subAccountId?: string | null;
    account: {
      id: string;
      name: string;
      type: string;
      color: string;
      balance: number;
    };
    subAccount?: {
      id: string;
      name: string;
      balance: number;
    } | null;
  }>;
}

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
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [contributeGoalId, setContributeGoalId] = useState<string | null>(null);
  const [contributeGoalName, setContributeGoalName] = useState("");

  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      const data = await apiFetch<SavingsGoal[]>("/api/savings");
      setGoals(data);
    } catch (error) {
      console.error("Error fetching savings goals:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);

  const handleContribute = (goalId: string, goalName: string) => {
    setContributeGoalId(goalId);
    setContributeGoalName(goalName);
  };

  const handleDeleteGoal = (goalId: string) => {
    setDeleteGoalId(goalId);
  };

  const confirmDeleteGoal = async () => {
    if (!deleteGoalId) return;
    try {
      await apiFetch(`/api/savings/${deleteGoalId}`, { method: 'DELETE' });
      fetchGoals();
    } catch (error) {
      console.error('Error deleting goal:', error);
    }
    setDeleteGoalId(null);
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

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
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
      className="p-4 space-y-4 pb-24"
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
              <p className="text-[10px] text-purple-200 mt-1">
                Meta total: {formatCurrency(totalTarget)}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

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
                onContribute={() => handleContribute(goal.id, goal.name)}
                onClick={() => handleGoalClick(goal.id)}
                onEdit={() => handleEditGoal(goal)}
                onDelete={() => handleDeleteGoal(goal.id)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* FAB */}
      {goals.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Button
            onClick={handleCreateNew}
            className="size-14 rounded-full bg-gradient-to-br from-purple-600 to-violet-500 shadow-lg shadow-purple-500/30"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      {/* Goal Form Dialog */}
      <SavingsGoalForm
        open={showGoalForm}
        onOpenChange={handleFormClose}
        editingGoal={editingGoal}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Goal Dialog */}
      <AlertDialog open={!!deleteGoalId} onOpenChange={() => setDeleteGoalId(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta meta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la meta y todo su historial. Los CDTs vinculados se desvincularán. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteGoal}
              className="rounded-xl bg-red-500 hover:bg-red-600"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contribute Sheet */}
      {contributeGoalId && (
        <SavingsContributeForm
          open={!!contributeGoalId}
          onOpenChange={(open) => {
            if (!open) {
              setContributeGoalId(null);
              setContributeGoalName("");
            }
          }}
          goalId={contributeGoalId}
          goalName={contributeGoalName}
          onSuccess={fetchGoals}
        />
      )}
    </motion.div>
  );
}
