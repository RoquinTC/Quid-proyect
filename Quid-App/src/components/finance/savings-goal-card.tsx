"use client";

import { useState, useEffect, useRef } from "react";
import { formatCurrency, calcPercentage } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { PiggyBank, Calendar, Plus, Pencil, Trash2, Trophy, Sparkles } from "lucide-react";
import { GoalCelebration } from "./goal-celebration";

interface SavingsGoalCardProps {
  goal: {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    deadline?: string | null;
    type: string;
    color: string;
    icon?: string | null;
    frequency?: string;
  };
  onContribute?: () => void;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const frequencyLabels: Record<string, string> = {
  mensual: "Mensual",
  quincenal: "Quincenal",
  semanal: "Semanal",
};

export function SavingsGoalCard({ goal, onContribute, onClick, onEdit, onDelete }: SavingsGoalCardProps) {
  const percentage = calcPercentage(goal.currentAmount, goal.targetAmount);
  const isCompleted = percentage >= 100;
  const prevPercentageRef = useRef(percentage);
  const [showCelebration, setShowCelebration] = useState(false);

  const daysRemaining = goal.deadline
    ? Math.max(
        0,
        Math.ceil(
          (new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : null;

  // Detect when goal goes from <100% to >=100% (celebration trigger)
  useEffect(() => {
    if (prevPercentageRef.current < 100 && percentage >= 100) {
      setShowCelebration(true);
    }
    prevPercentageRef.current = percentage;
  }, [percentage]);

  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  const typeLabels: Record<string, string> = {
    emergency_fund: "Fondo de emergencia",
    education: "Educación",
    travel: "Viaje",
    general: "General",
  };

  return (
    <>
      <GoalCelebration
        active={showCelebration}
        goalName={goal.name}
        onComplete={() => setShowCelebration(false)}
      />

      <motion.div
        className="w-full text-left"
        whileTap={{ scale: 0.98 }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        <div
          className={`bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md border transition-all duration-500 ${
            isCompleted
              ? "border-amber-200 dark:border-amber-800 shadow-amber-100 dark:shadow-amber-900/30"
              : "border-gray-100 dark:border-gray-700"
          }`}
        >
          <div className="flex items-start gap-4">
            {/* Circular Progress */}
            <div
              className="relative size-20 flex-shrink-0 cursor-pointer"
              onClick={onClick}
            >
              <svg className="size-20 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  className="text-gray-100 dark:text-gray-700"
                />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={isCompleted ? "#F59E0B" : goal.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                />
                {/* Glow effect when completed */}
                {isCompleted && (
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={0}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="blur-sm"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {isCompleted ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, delay: 0.5 }}
                  >
                    <Trophy className="size-6 text-amber-500" />
                  </motion.div>
                ) : (
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {percentage}%
                  </span>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="size-6 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${isCompleted ? "#F59E0B" : goal.color}20` }}
                >
                  {isCompleted ? (
                    <Sparkles className="size-3.5 text-amber-500" />
                  ) : (
                    <PiggyBank className="size-3.5" style={{ color: goal.color }} />
                  )}
                </div>
                <h3
                  className="text-sm font-semibold text-gray-900 dark:text-white truncate cursor-pointer hover:underline"
                  onClick={onClick}
                >
                  {goal.name}
                </h3>
                {isCompleted && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full"
                  >
                    COMPLETADA
                  </motion.span>
                )}
                {/* Edit button */}
                {onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    className="p-1 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors shrink-0"
                    title="Editar meta"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
                {/* Delete button */}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors shrink-0"
                    title="Eliminar meta"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>

              <span className="text-[10px] text-gray-400">
                {typeLabels[goal.type] || goal.type}
                {goal.frequency && ` · ${frequencyLabels[goal.frequency] || goal.frequency}`}
              </span>

              <div className="mt-2 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {formatCurrency(goal.currentAmount)}
                  </span>
                  <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                    {formatCurrency(goal.targetAmount)}
                  </span>
                </div>
                {/* Animated progress bar */}
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mt-1 relative">
                  <motion.div
                    className="h-full rounded-full relative overflow-hidden"
                    style={{
                      backgroundColor: isCompleted ? "#F59E0B" : goal.color,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(percentage, 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  >
                    {/* Shimmer effect for in-progress goals */}
                    {!isCompleted && (
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                        animate={{ x: ["-100%", "200%"] }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          repeatDelay: 3,
                          ease: "easeInOut",
                        }}
                      />
                    )}
                    {/* Sparkle effect for completed goals */}
                    {isCompleted && (
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                        animate={{ x: ["-100%", "200%"] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          repeatDelay: 2,
                          ease: "easeInOut",
                        }}
                      />
                    )}
                  </motion.div>
                </div>
              </div>

              {daysRemaining !== null && !isCompleted && (
                <div className="flex items-center gap-1 mt-2">
                  <Calendar className="size-3 text-gray-400" />
                  <span className="text-[10px] text-gray-400">
                    {daysRemaining} día{daysRemaining !== 1 ? "s" : ""} restante{daysRemaining !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Contribute button (hidden when completed) */}
          <AnimatePresence>
            {!isCompleted && onContribute && (
              <motion.button
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onContribute();
                }}
                className="w-full mt-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="size-3" />
                Aportar
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
