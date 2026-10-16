import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, pantryCreateSchema } from "@/lib/validations";
import { normalizeName } from "@/lib/pantry/names";
import { defaultMultiplyQuantity, isKnownUnit } from "@/lib/pantry/units";
import { requireUserId, withStock } from "@/lib/pantry/api-helpers";

/**
 * GET /api/pantry
 *
 * Devuelve la nevera con el estado de stock ya evaluado por producto
 * (`status`, `label`, `deficit`, `isLow`, `isOut`, `daysToExpiry`...), para que
 * la UI no tenga que recalcular ni pueda desincronizarse del servidor.
 *
 * Query params:
 *   ?status=out,low,expiring   filtra por cápsula
 *   ?location=nevera           filtra por ubicación
 *   ?category=dairy            filtra por categoría
 *   ?search=leche              busca por nombre
 *   ?includeInactive=1         incluye los dados de baja (soft delete)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const params = req.nextUrl.searchParams;
    const statusFilter = params.get("status")?.split(",").filter(Boolean) ?? [];
    const location = params.get("location");
    const category = params.get("category");
    const search = params.get("search")?.trim();
    const includeInactive = params.get("includeInactive") === "1";

    const items = await db.pantryItem.findMany({
      where: {
        userId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(location ? { location } : {}),
        ...(category ? { category } : {}),
        ...(search
          ? { nameNormalized: { contains: normalizeName(search) } }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { nameNormalized: "asc" }],
    });

    const evaluated = items.map(withStock);

    // El filtro por cápsula se aplica después de evaluar, porque el estado no
    // vive en la base (se deriva de cantidad, umbrales y fechas).
    const filtered =
      statusFilter.length > 0
        ? evaluated.filter((item) =>
            item.flags.some((flag) => statusFilter.includes(flag))
          )
        : evaluated;

    const lowStockItems = filtered.filter((item) => item.isLow);

    return NextResponse.json({
      items: filtered,
      lowStockItems,
      counts: {
        total: filtered.length,
        out: filtered.filter((i) => i.isOut).length,
        low: filtered.filter((i) => i.isLow).length,
        expiring: filtered.filter((i) => i.flags.includes("expiring")).length,
        expired: filtered.filter((i) => i.flags.includes("expired")).length,
        unused: filtered.filter((i) => i.flags.includes("unused")).length,
      },
    });
  } catch (error) {
    console.error("Get pantry items error:", error);
    return NextResponse.json({ error: "Error al obtener la nevera" }, { status: 500 });
  }
}

/**
 * POST /api/pantry
 *
 * Crea un producto en la nevera.
 *
 * Dos decisiones que valen la pena:
 *  1. **No duplica.** Si ya existe un producto con la misma clave normalizada y
 *     unidad, devuelve 409 con el existente para que el cliente pregunte
 *     "¿actualizar?" en vez de crear un duplicado en silencio (el bug de SoftList).
 *  2. **El stock entra por el ledger.** Si se declara una cantidad inicial y
 *     `recordInitialMovement` no es `false`, se crea un `PantryMovement` de tipo
 *     `in`, para que la cantidad siempre tenga respaldo auditable.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let body;
    try {
      body = await validateBody(req, pantryCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const unit = body.unit || "unit";
    const nameNormalized = normalizeName(name);

    // ── Guardia de duplicados ──
    const existing = await db.pantryItem.findFirst({
      where: { userId, nameNormalized, unit },
      select: { id: true, name: true, quantity: true, unit: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "duplicate",
          message: `"${existing.name}" ya está en la nevera con ${existing.quantity} ${existing.unit}. ¿Deseas actualizar?`,
          existing,
        },
        { status: 409 }
      );
    }

    // El mínimo se fija en el PRIMER registro a partir de la cantidad inicial si
    // no se indica otro (§4.5). Editable después.
    const quantity = body.quantity ?? 0;
    const minStock = body.minStock ?? (quantity > 0 ? quantity : null);

    const created = await db.$transaction(async (tx) => {
      const item = await tx.pantryItem.create({
        data: {
          userId,
          name,
          nameNormalized,
          category: body.category || "other",
          quantity,
          unit,
          location: body.location ?? "nevera",
          expirationDate: body.expirationDate
            ? createColombiaDate(body.expirationDate.split("T")[0])
            : null,
          purchaseDate: body.purchaseDate
            ? createColombiaDate(body.purchaseDate.split("T")[0])
            : null,
          purchasePrice: body.purchasePrice ?? null,
          minStock,
          targetQuantity: body.targetQuantity ?? null,
          unitWeightFactor: body.unitWeightFactor ?? null,
          priceUnitId: body.priceUnitId ?? null,
          defaultUnitId: body.defaultUnitId ?? (isKnownUnit(unit) ? unit : null),
          multiplyQuantity: body.multiplyQuantity ?? defaultMultiplyQuantity(unit),
          isFavorite: body.isFavorite ?? false,
          notes: body.notes ?? "",
          sortOrder: body.sortOrder ?? 1,
        },
      });

      // Cantidad inicial declarada ⇒ movimiento de entrada, no escritura directa.
      if (quantity > 0 && body.recordInitialMovement !== false) {
        await tx.pantryMovement.create({
          data: {
            itemId: item.id,
            userId,
            type: "in",
            quantity,
            unit,
            note: body.note ?? "Carga inicial",
            unitPrice: body.purchasePrice ?? null,
            occurredAt: new Date(),
          },
        });
      }

      return item;
    });

    return NextResponse.json(withStock(created), { status: 201 });
  } catch (error) {
    console.error("Create pantry item error:", error);
    return NextResponse.json({ error: "Error al crear el producto" }, { status: 500 });
  }
}
