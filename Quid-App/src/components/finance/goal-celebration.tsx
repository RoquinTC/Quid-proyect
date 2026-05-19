"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy } from "lucide-react";
import confetti from "canvas-confetti";

interface GoalCelebrationProps {
  /** Whether to show the celebration */
  active: boolean;
  /** Goal name for the message */
  goalName: string;
  /** Called when celebration animation finishes */
  onComplete?: () => void;
}

/**
 * Celebration overlay that fires confetti + trophy animation
 * when a savings goal reaches 100%.
 */
export function GoalCelebration({ active, goalName, onComplete }: GoalCelebrationProps) {
  const hasFired = useRef(false);

  const fireConfetti = useCallback(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    // First burst - center
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#8B5CF6", "#A78BFA", "#C4B5FD", "#F59E0B", "#10B981"],
    });

    // Second burst - left
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        colors: ["#8B5CF6", "#EC4899", "#F59E0B"],
      });
    }, 200);

    // Third burst - right
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.65 },
        colors: ["#10B981", "#3B82F6", "#F59E0B"],
      });
    }, 400);

    // Stars burst
    setTimeout(() => {
      confetti({
        particleCount: 30,
        spread: 360,
        ticks: 60,
        gravity: 0.2,
        decay: 0.94,
        startVelocity: 20,
        shapes: ["star"],
        colors: ["#FBBF24", "#F59E0B", "#FCD34D"],
        origin: { x: 0.5, y: 0.4 },
      });
    }, 600);
  }, []);

  useEffect(() => {
    if (active) {
      fireConfetti();
      const timer = setTimeout(() => {
        onComplete?.();
      }, 4000);
      return () => clearTimeout(timer);
    } else {
      hasFired.current = false;
    }
  }, [active, fireConfetti, onComplete]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.3 }}
            className="flex flex-col items-center gap-3"
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, 10, -10, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                repeatType: "reverse",
              }}
              className="size-20 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-2xl shadow-amber-400/50"
            >
              <Trophy className="size-10 text-white" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md px-6 py-3 rounded-2xl shadow-xl"
            >
              <p className="text-lg font-bold text-gray-900 dark:text-white text-center">
                ¡Meta cumplida!
              </p>
              <p className="text-sm text-purple-600 dark:text-purple-400 text-center">
                {goalName}
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
