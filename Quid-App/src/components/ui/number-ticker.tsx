"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";

interface NumberTickerProps {
  value: number;
  direction?: "up" | "down";
  delay?: number;
  className?: string;
  formatOptions?: Intl.NumberFormatOptions;
  locale?: string;
}

export function NumberTicker({
  value,
  direction = "up",
  delay = 0,
  className,
  formatOptions,
  locale = "es-CO",
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(direction === "down" ? value : 0);
  const springValue = useSpring(motionValue, {
    damping: 50,
    stiffness: 90,
    restDelta: 0.5,
  });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  useEffect(() => {
    if (isInView) {
      const timeout = setTimeout(() => {
        motionValue.set(direction === "down" ? 0 : value);
      }, delay * 1000);
      return () => clearTimeout(timeout);
    }
  }, [motionValue, isInView, delay, value, direction]);

  useEffect(() => {
    return springValue.on("change", (latest) => {
      if (ref.current) {
        // preserve decimal accuracy if required by format options
        const isDecimal = formatOptions?.minimumFractionDigits && formatOptions.minimumFractionDigits > 0;
        const numberVal = isDecimal ? Number(latest.toFixed(2)) : Math.round(latest);
        ref.current.textContent = Intl.NumberFormat(locale, formatOptions).format(numberVal);
      }
    });
  }, [springValue, formatOptions, locale]);

  return <span className={className} ref={ref} />;
}
