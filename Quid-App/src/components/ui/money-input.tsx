"use client";

import { useRef } from "react";
import type { ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { maskAmountInput } from "@/lib/format/money-input";

/**
 * F-51b · Campo de dinero con separador de miles en vivo.
 *
 * Escribe "1000" y se ve "1.000"; agrega una coma y pasa a decimales
 * ("1.000,50"). El cursor se mantiene donde estaba: al insertar puntos delante
 * se recoloca contando los dígitos que había antes de la posición actual, no
 * los caracteres (si no, el cursor salta al final en cada tecla).
 */

type MoneyInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function MoneyInput({ value, onValueChange, ...rest }: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const element = event.target;
    const caret = element.selectionStart ?? element.value.length;

    // Cuántos dígitos había antes del cursor: es lo que hay que conservar.
    const digitsBefore = element.value.slice(0, caret).replace(/\D/g, "").length;

    const masked = maskAmountInput(element.value);
    onValueChange(masked);

    // Se recoloca después del re-render, cuando el campo ya muestra la máscara.
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;

      let seen = 0;
      let position = masked.length;
      for (let i = 0; i < masked.length; i += 1) {
        if (/\d/.test(masked[i])) seen += 1;
        if (seen === digitsBefore) {
          position = i + 1;
          break;
        }
      }
      if (digitsBefore === 0) position = 0;
      input.setSelectionRange(position, position);
    });
  };

  return (
    <Input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={handleChange}
    />
  );
}
