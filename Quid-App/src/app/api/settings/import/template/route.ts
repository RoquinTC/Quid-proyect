import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Get template type from query params
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "movimientos";

    const wb = XLSX.utils.book_new();

    if (type === "movimientos") {
      // ===== SHEET 1: INGRESOS =====
      const ingresosHeaders = [
        "fecha",
        "descripcion",
        "monto",
        "categoria",
        "subcategoria",
        "cuenta",
        "subcuenta",
        "notas",
      ];
      const ingresosExample = [
        [
          "2025-01-15",
          "Sueldo mensual",
          3500000,
          "Sueldo",
          "",
          "Bancolombia Ahorros",
          "",
          "Pago enero",
        ],
        [
          "2025-01-20",
          "Freelance proyecto web",
          800000,
          "Freelance",
          "Desarrollo",
          "Nequi",
          "Bolsillo Freelance",
          "",
        ],
      ];
      const ingresosData = [ingresosHeaders, ...ingresosExample];
      const wsIngresos = XLSX.utils.aoa_to_sheet(ingresosData);

      // Set column widths
      wsIngresos["!cols"] = [
        { wch: 14 }, // fecha
        { wch: 30 }, // descripcion
        { wch: 14 }, // monto
        { wch: 20 }, // categoria
        { wch: 18 }, // subcategoria
        { wch: 25 }, // cuenta
        { wch: 20 }, // subcuenta
        { wch: 25 }, // notas
      ];

      XLSX.utils.book_append_sheet(wb, wsIngresos, "Ingresos");

      // ===== SHEET 2: GASTOS =====
      const gastosHeaders = [
        "fecha",
        "descripcion",
        "monto",
        "categoria",
        "subcategoria",
        "cuenta",
        "subcuenta",
        "notas",
      ];
      const gastosExample = [
        [
          "2025-01-15",
          "Almuerzo restaurante",
          35000,
          "Alimentación",
          "Almuerzos",
          "Nequi",
          "",
          "",
        ],
        [
          "2025-01-16",
          "Recarga celular",
          20000,
          "Comunicación",
          "Celular",
          "Nequi",
          "Bolsillo Servicios",
          "Plan mensual",
        ],
        [
          "2025-01-17",
          "Gasolina",
          50000,
          "Transporte",
          "Combustible",
          "Bancolombia Ahorros",
          "",
          "",
        ],
      ];
      const gastosData = [gastosHeaders, ...gastosExample];
      const wsGastos = XLSX.utils.aoa_to_sheet(gastosData);
      wsGastos["!cols"] = [
        { wch: 14 },
        { wch: 30 },
        { wch: 14 },
        { wch: 20 },
        { wch: 18 },
        { wch: 25 },
        { wch: 20 },
        { wch: 25 },
      ];
      XLSX.utils.book_append_sheet(wb, wsGastos, "Gastos");

      // ===== SHEET 3: TRANSFERENCIAS =====
      const transferenciasHeaders = [
        "fecha",
        "descripcion",
        "monto",
        "cuenta_origen",
        "subcuenta_origen",
        "cuenta_destino",
        "subcuenta_destino",
        "notas",
      ];
      const transferenciasExample = [
        [
          "2025-01-15",
          "Aporte meta emergencias",
          500000,
          "Bancolombia Ahorros",
          "",
          "Caja de Ahorros",
          "Fondo Emergencias",
          "Meta: Fondo emergencias",
        ],
        [
          "2025-01-20",
          "Traslado a Nequi",
          300000,
          "Bancolombia Ahorros",
          "",
          "Nequi",
          "",
          "",
        ],
      ];
      const transferenciasData = [
        transferenciasHeaders,
        ...transferenciasExample,
      ];
      const wsTransferencias = XLSX.utils.aoa_to_sheet(transferenciasData);
      wsTransferencias["!cols"] = [
        { wch: 14 },
        { wch: 30 },
        { wch: 14 },
        { wch: 25 },
        { wch: 20 },
        { wch: 25 },
        { wch: 20 },
        { wch: 25 },
      ];
      XLSX.utils.book_append_sheet(wb, wsTransferencias, "Transferencias");
    } else if (type === "presupuestos") {
      const headers = [
        "categoria",
        "subcategoria",
        "tipo",
        "monto",
        "periodo",
      ];
      const examples = [
        ["Alimentación", "", "gasto", 1500000, "mensual"],
        ["Transporte", "", "gasto", 600000, "mensual"],
        ["Sueldo", "", "ingreso", 3500000, "mensual"],
        ["Almuerzos", "Alimentación", "gasto", 400000, "mensual"],
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
      ws["!cols"] = [
        { wch: 20 },
        { wch: 20 },
        { wch: 12 },
        { wch: 14 },
        { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Presupuestos");
    } else if (type === "deudas") {
      const headers = [
        "nombre",
        "tipo",
        "monto_total",
        "saldo_actual",
        "tasa_interes",
        "banco",
        "dia_corte",
        "dia_pago",
        "cuota_mensual",
        "pagos_restantes",
      ];
      const examples = [
        [
          "Tarjeta Éxito",
          "tarjeta_credito",
          8000000,
          4500000,
          29.9,
          "Éxito",
          15,
          25,
          "",
          "",
        ],
        [
          "Préstamo vehículo",
          "prestamo",
          35000000,
          28000000,
          14.5,
          "Bancolombia",
          "",
          "",
          1200000,
          24,
        ],
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
      ws["!cols"] = [
        { wch: 22 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 18 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Deudas");
    } else if (type === "metas") {
      const headers = [
        "nombre",
        "descripcion",
        "monto_objetivo",
        "monto_actual",
        "tipo",
        "fecha_meta",
        "frecuencia",
      ];
      const examples = [
        [
          "Fondo emergencias",
          "3 meses de gastos",
          10000000,
          2000000,
          "fondo_emergencia",
          "2026-06-01",
          "mensual",
        ],
        [
          "Viaje Cancún",
          "Vacaciones diciembre",
          5000000,
          500000,
          "viaje",
          "2026-12-01",
          "quincenal",
        ],
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
      ws["!cols"] = [
        { wch: 22 },
        { wch: 25 },
        { wch: 16 },
        { wch: 14 },
        { wch: 18 },
        { wch: 14 },
        { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Metas de Ahorro");
    } else if (type === "cdt") {
      const headers = [
        "banco",
        "monto",
        "tasa_efectiva_anual",
        "plazo_dias",
        "fecha_inicio",
        "fecha_vencimiento",
        "cuenta_rendimientos",
        "meta_vinculada",
      ];
      const examples = [
        [
          "Bancolombia",
          10000000,
          11.5,
          180,
          "2025-01-15",
          "2025-07-14",
          "Bancolombia Ahorros",
          "Fondo emergencias",
        ],
        [
          "Davivienda",
          5000000,
          12.3,
          360,
          "2025-02-01",
          "2026-01-31",
          "Davivienda Ahorros",
          "",
        ],
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
      ws["!cols"] = [
        { wch: 18 },
        { wch: 14 },
        { wch: 20 },
        { wch: 12 },
        { wch: 14 },
        { wch: 18 },
        { wch: 22 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "CDT");
    }

    // Generate buffer
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Return as downloadable file
    const filename = `quid-plantilla-${type}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Template generation error:", error);
    return NextResponse.json(
      { error: "Error al generar la plantilla" },
      { status: 500 }
    );
  }
}
