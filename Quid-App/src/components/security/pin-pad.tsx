"use client";

import { useState, useCallback } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { motion, AnimatePresence } from "framer-motion";
import { Delete } from "lucide-react";

interface PinPadProps {
  onComplete: (pin: string) => void;
  error?: string;
  title?: string;
  subtitle?: string;
}

export function PinPad({ onComplete, error, title = "Ingresa tu PIN", subtitle = "4 dígitos" }: PinPadProps) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  const handlePinChange = useCallback((value: string) => {
    const sanitized = value.replace(/\D/g, "").slice(0, 4);
    setPin(sanitized);

    if (sanitized.length === 4) {
      onComplete(sanitized);
    }
  }, [onComplete]);

  const handleKeyPress = useCallback((digit: string) => {
    setPin((prev) => {
      const next = (prev + digit).slice(0, 4);
      if (next.length === 4) {
        // Small delay so the last dot animates before callback
        setTimeout(() => onComplete(next), 100);
      }
      return next;
    });
  }, [onComplete]);

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleError = useCallback(() => {
    setShake(true);
    setTimeout(() => {
      setPin("");
      setShake(false);
    }, 500);
  }, []);

  // Expose error handling to parent
  // If error prop changes, shake and clear
  if (error && pin.length === 4) {
    handleError();
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Title */}
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>

      {/* PIN Dots */}
      <motion.div
        animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="flex justify-center"
      >
        <InputOTP
          maxLength={4}
          value={pin}
          onChange={handlePinChange}
          containerClassName="gap-4"
        >
          <InputOTPGroup className="gap-4">
            {[0, 1, 2, 3].map((index) => (
              <InputOTPSlot
                key={index}
                index={index}
                className="size-14 rounded-2xl border-2 border-gray-200 dark:border-gray-700 data-[active=true]:border-emerald-500 data-[active=true]:ring-emerald-500/20 data-[active=true]:ring-4 text-2xl font-bold text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-sm"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="text-xs text-red-500 font-medium"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Numeric Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {keys.map((key, i) => {
          if (key === "") {
            return <div key={i} />;
          }
          if (key === "del") {
            return (
              <button
                key={i}
                onClick={handleBackspace}
                className="size-16 rounded-2xl flex items-center justify-center active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
                aria-label="Borrar"
              >
                <Delete className="size-5 text-gray-400" />
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => handleKeyPress(key)}
              className="size-16 rounded-2xl flex items-center justify-center text-xl font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-emerald-50 dark:active:bg-emerald-900/30 active:text-emerald-600 dark:active:text-emerald-400 transition-all shadow-sm"
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
