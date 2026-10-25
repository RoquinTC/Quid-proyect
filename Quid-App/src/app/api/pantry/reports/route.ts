import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/pantry/api-helpers";
import { toNumber } from "@/lib/decimal-serializer";
import { lineTotal } from "@/lib/pantry/line-total";
import { convertQuantity } from "@/lib/pantry/units";

/**
 * GET /api/pantry/reports?days=90
 *
 * Los **tres reportes derivados** de la especificación (§10). No se construye
 * maquinaria nueva: se consultan `PriceHistory`, `PantryMovement` y
 * `PantryItem`, que el flujo ya escribe.
 *
 *   1. `priceVariation`   — variación de precio por producto.
 *   2. `spendingByCategory` — gasto del mercado por categoría.
 *   3. `storeComparison`  — comparación de precios entre tiendas.
 *
 * Todos los importes pasan por `lineTotal`, el mismo motor de la lista: si se
 * calculara aquí a mano, los gramos contra kilos volverían a inflar las cifras.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 90, 7), 730);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [items, history, movements] = await Promise.all([
      db.pantryItem.findMany({
        where: { userId: auth.userId },
        select: { id: true, name: true, unit: true, category: true, priceUnitId: true },
      }),
      db.priceHistory.findMany({
        where: { userId: auth.userId, date: { gte: since } },
        orderBy: { date: "asc" },
        select: {
          itemId: true,
          price: true,
          quantity: true,
          unit: true,
          date: true,
          storeName: true,
          sourceStore: true,
        },
      }),
      db.pantryMovement.findMany({
        where: { userId: auth.userId, type: "in", occurredAt: { gte: since } },
        select: {
          itemId: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          sourceStore: true,
          occurredAt: true,
        },
      }),
    ]);

    const itemById = new Map(items.map((i) => [i.id, i]));

    // ── 1. Variación de precio por producto ──
    // El precio se normaliza a "por unidad del producto" dividiendo el importe
    // real entre la cantidad, para que una compra en gramos y otra en kilos del
    // mismo producto sean comparables.
    const byItem = new Map<string, { date: string; unitPrice: number; store: string | null }[]>();
    for (const h of history) {
      const item = itemById.get(h.itemId);
      if (!item) continue;
      const qty = toNumber(h.quantity);
      if (qty <= 0) continue;
      const amount = lineTotal({
        quantity: qty,
        price: toNumber(h.price),
        unit: h.unit ?? item.unit,
        priceUnitId: item.priceUnitId,
      });
      if (amount <= 0) continue;

      // Se divide entre la cantidad expresada en **la unidad en que la tienda
      // cobra** (o en la del producto si no hay). Así el café se lee
      // 34.000/kg y no 34 por gramo —correcto pero ilegible— y la papa
      // 2.600/kg en vez de 2,6.
      const targetUnit = item.priceUnitId || item.unit;
      const converted = convertQuantity(qty, h.unit ?? item.unit, targetUnit);
      const qtyInItemUnit = converted.converted ? converted.quantity : qty;
      if (qtyInItemUnit <= 0) continue;

      const unitPrice = amount / qtyInItemUnit;
      const list = byItem.get(h.itemId) ?? [];
      list.push({
        date: h.date.toISOString().slice(0, 10),
        unitPrice: Math.round(unitPrice * 100) / 100,
        store: h.sourceStore ?? null,
      });
      byItem.set(h.itemId, list);
    }

    const priceVariation = [...byItem.entries()]
      .map(([itemId, series]) => {
        const item = itemById.get(itemId)!;
        const first = series[0].unitPrice;
        const last = series[series.length - 1].unitPrice;
        const values = series.map((s) => s.unitPrice);
        const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
        return {
          itemId,
          name: item.name,
          unit: item.unit,
          // Unidad en la que se expresa el precio (la de cobro si existe):
          // sin esto la UI mostraba "$34,00" para el café en vez de "$34.000/kg".
          priceUnit: item.priceUnitId || item.unit,
          category: item.category,
          series,
          first,
          last,
          min: Math.min(...values),
          max: Math.max(...values),
          changePct: Math.round(changePct * 10) / 10,
          purchases: series.length,
        };
      })
      // Solo tiene sentido reportar lo que se compró más de una vez.
      .filter((r) => r.purchases >= 2)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

    // ── 2. Gasto por categoría ──
    const byCategory = new Map<string, { total: number; purchases: number }>();
    for (const m of movements) {
      const item = itemById.get(m.itemId);
      if (!item) continue;
      const amount = lineTotal({
        quantity: toNumber(m.quantity),
        price: m.unitPrice === null ? null : toNumber(m.unitPrice),
        unit: m.unit ?? item.unit,
        priceUnitId: item.priceUnitId,
      });
      if (amount <= 0) continue;
      const key = item.category || "otros";
      const acc = byCategory.get(key) ?? { total: 0, purchases: 0 };
      acc.total += amount;
      acc.purchases += 1;
      byCategory.set(key, acc);
    }

    const spendingByCategory = [...byCategory.entries()]
      .map(([category, v]) => ({
        category,
        total: Math.round(v.total * 100) / 100,
        purchases: v.purchases,
      }))
      .sort((a, b) => b.total - a.total);

    // ── 3. Comparación entre tiendas ──
    const storeBuckets = new Map<string, Map<string, number[]>>();
    for (const [itemId, series] of byItem.entries()) {
      for (const entry of series) {
        if (!entry.store) continue;
        const store = entry.store;
        const perItem = storeBuckets.get(itemId) ?? new Map<string, number[]>();
        perItem.set(store, [...(perItem.get(store) ?? []), entry.unitPrice]);
        storeBuckets.set(itemId, perItem);
      }
    }

    const storeComparison = [...storeBuckets.entries()]
      .map(([itemId, byStore]) => {
        const item = itemById.get(itemId)!;
        const stores = [...byStore.entries()]
          .map(([store, prices]) => ({
            store,
            avgPrice:
              Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
            minPrice: Math.min(...prices),
            visits: prices.length,
          }))
          .sort((a, b) => a.avgPrice - b.avgPrice);
        const cheapest = stores[0];
        const dearest = stores[stores.length - 1];
        // "Cuánto ahorras comprando en la más barata": se calcula sobre el
        // precio CARO, no sobre el barato. Antes dividía entre el barato y el
        // mensaje mentía: 2.800 contra 3.200 es 12,5 % más barato, no 14,3 %.
        const spreadPct =
          dearest.avgPrice > 0
            ? ((dearest.avgPrice - cheapest.avgPrice) / dearest.avgPrice) * 100
            : 0;
        return {
          itemId,
          name: item.name,
          unit: item.unit,
          priceUnit: item.priceUnitId || item.unit,
          stores,
          cheapestStore: cheapest.store,
          spreadPct: Math.round(spreadPct * 10) / 10,
        };
      })
      // Comparar necesita al menos dos tiendas.
      .filter((r) => r.stores.length >= 2)
      .sort((a, b) => b.spreadPct - a.spreadPct);

    const totalSpent = Math.round(
      spendingByCategory.reduce((sum, c) => sum + c.total, 0) * 100
    ) / 100;

    return NextResponse.json({
      days,
      since: since.toISOString().slice(0, 10),
      totalSpent,
      priceVariation: priceVariation.slice(0, 15),
      spendingByCategory,
      storeComparison: storeComparison.slice(0, 15),
      // Honestidad sobre los límites: los reportes solo ven lo confirmado.
      limitations: [
        "Solo incluye compras confirmadas en el módulo (no gastos sueltos de Finanzas).",
        "La variación necesita al menos dos compras del mismo producto.",
        "La comparación entre tiendas necesita el mismo producto en dos tiendas.",
      ],
    });
  } catch (error) {
    console.error("Pantry reports error:", error);
    return NextResponse.json({ error: "No se pudieron calcular los reportes" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
