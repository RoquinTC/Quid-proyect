"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Inbox, RefreshCw } from "lucide-react";

interface ShoppingListDetailSkeletonProps {
  /** true = mostra el esqueleto de carga; false = estado de error */
  loading?: boolean;
  /** mensaje opcional del error (por defecto uno claro) */
  errorMessage?: string;
  /** se llama al tocar "Reintentar" (o back) */
  onRetry?: () => void;
  /** se llama al tocar la flecha atrás */
  onBack?: () => void;
}

/**
 * Estado visual de ShoppingListDetail:
 * - `loading=true`: esqueleto sutil mientras se hace el GET.
 * - `loading=false`: pantalla de error clara + botón de reintentar.
 * Nunca una pantalla en negro: si la lista no cargó, siempre hay feedback.
 */
export function ShoppingListDetailSkeleton({
  loading = true,
  errorMessage = "No pudimos cargar la lista de mercado.",
  onRetry,
  onBack,
}: ShoppingListDetailSkeletonProps) {
  return (
    <div className="p-4 space-y-4 pb-safe">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="size-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
          aria-label="Volver"
        >
          <ArrowLeft className="size-4 text-gray-600 dark:text-gray-400" />
        </button>
        <div className="flex-1">
          {loading ? (
            <div className="space-y-2">
              <div className="h-5 w-1/3 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
              <div className="h-3 w-1/2 rounded-md bg-gray-100 dark:bg-gray-800 animate-pulse" />
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Lista de mercado</h2>
              <span className="text-xs text-gray-400">No se pudo cargar</span>
            </div>
          )}
        </div>
        {loading && (
          <div className="size-9 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        )}
      </div>

      {/* Cuerpo */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6 text-center">
          <Inbox className="size-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-300">{errorMessage}</p>
          <p className="text-xs text-gray-400 mt-1">
            Revisa tu conexión e inténtalo de nuevo.
          </p>
          {onRetry && (
            <Button
              onClick={onRetry}
              variant="outline"
              className="mt-4 rounded-xl border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
            >
              <RefreshCw className="size-4 mr-2" />
              Reintentar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}