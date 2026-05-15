"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Loader2 } from "lucide-react";

interface ExportMenuProps {
  /** Use "onGradient" for dark/gradient backgrounds where white icon is needed */
  variant?: "default" | "onGradient";
  className?: string;
}

export function ExportMenu({ variant = "default", className }: ExportMenuProps) {
  const [exporting, setExporting] = useState(false);

  const iconColor = variant === "onGradient" ? "text-white/70" : "text-gray-500";
  const hoverClass = variant === "onGradient" ? "hover:bg-white/10" : "hover:bg-gray-100 dark:hover:bg-gray-700";

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/finance/export/balances");
      if (!response.ok) throw new Error("Error al exportar");

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `quid-datos-${new Date().toISOString().split("T")[0]}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) filename = match[1].replace(/['"]/g, "");
      }
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`size-8 rounded-lg ${hoverClass} ${className || ""}`}
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className={`size-4 animate-spin ${iconColor}`} />
          ) : (
            <Download className={`size-4 ${iconColor}`} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem onClick={handleExport}>
          <Download className="size-3.5 mr-2" />
          Exportar todo a Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
