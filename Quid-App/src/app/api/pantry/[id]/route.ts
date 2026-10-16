import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, pantryUpdateSchema } from "@/lib/validations";
import { normalizeName } from "@/lib/pantry/names";
import { defaultMultiplyQuantity } from "@/lib/pantry/units";
import { requireUserId, withStock } from "@/lib/pantry/api-helpers";

/** GET /api/pantry/[id] — un producto con su estado de stock y sus movimientos recientes. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const item = await db.pantryItem.findFirst({
      where: { id, userId: auth.userId },
      include: {
        movements: {
          orderBy: { occurredAt: "desc" },
          take: 25,
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const { movements, ...rest } = item;
    return NextResponse.json({ ...withStock(rest), movements });
  } catch (error) {
    console.error("Get pantry item error:", error);
    return NextResponse.json({ error: "Error al obtener el producto" }, { status: 500 });
  }
}

/**
 * PUT /api/pantry/[id]
 *
 * Actualiza la ficha del producto.
 *
 * OJO: **`quantity` no se actualiza aquí.** La cantidad solo cambia por el
 * ledger (`/adjust`, `/consume`, confirmaciones de compra o recetas), para que
 * todo cambio de stock tenga un movimiento que lo explique. Si se envía
 * `quantity`, se ignora a propósito y se avisa en la respuesta.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    let body;
    try {
      body = await validateBody(req, pantryUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const existing = await db.pantryItem.findFirst({
      where: { id, userId: auth.userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updateData.name = body.name;
      // La clave de deduplicación debe seguir al nombre, o el índice único
      // quedaría apuntando a un nombre que ya no existe.
      updateData.nameNormalized = normalizeName(body.name);
    }
    if (body.category !== undefined) updateData.category = body.category;
    if (body.unit !== undefined) {
      updateData.unit = body.unit;
      // Si el usuario no fijó explícitamente multiplicar, se re-deriva de la
      // unidad nueva (g/ml dejan de multiplicar).
      if (body.multiplyQuantity === undefined) {
        updateData.multiplyQuantity = defaultMultiplyQuantity(body.unit);
      }
    }
    if (body.expirationDate !== undefined) {
      updateData.expirationDate = body.expirationDate
        ? createColombiaDate(body.expirationDate.split("T")[0])
        : null;
    }
    if (body.purchaseDate !== undefined) {
      updateData.purchaseDate = body.purchaseDate
        ? createColombiaDate(body.purchaseDate.split("T")[0])
        : null;
    }
    if (body.purchasePrice !== undefined) updateData.purchasePrice = body.purchasePrice;
    if (body.minStock !== undefined) updateData.minStock = body.minStock;
    if (body.targetQuantity !== undefined) updateData.targetQuantity = body.targetQuantity;
    if (body.unitWeightFactor !== undefined) updateData.unitWeightFactor = body.unitWeightFactor;
    if (body.priceUnitId !== undefined) updateData.priceUnitId = body.priceUnitId;
    if (body.defaultUnitId !== undefined) updateData.defaultUnitId = body.defaultUnitId;
    if (body.multiplyQuantity !== undefined) updateData.multiplyQuantity = body.multiplyQuantity;
    if (body.isFavorite !== undefined) updateData.isFavorite = body.isFavorite;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
    if (body.location !== undefined) updateData.location = body.location;

    const item = await db.pantryItem.update({ where: { id }, data: updateData });

    return NextResponse.json({
      ...withStock(item),
      // Transparencia: si el cliente intentó cambiar la cantidad por esta vía,
      // se le dice explícitamente que no se aplicó y por dónde sí.
      ...(body.quantity !== undefined
        ? {
            warning:
              "La cantidad no se modifica desde aquí. Usa /adjust para un recuento o /consume para un consumo.",
          }
        : {}),
    });
  } catch (error) {
    console.error("Update pantry item error:", error);
    return NextResponse.json({ error: "Error al actualizar el producto" }, { status: 500 });
  }
}

/**
 * DELETE /api/pantry/[id]
 *
 * **Baja lógica** (`isActive = false`), no borrado físico.
 *
 * Razón: borrar el producto arrastraría en cascada sus `PantryMovement` y su
 * `PriceHistory` — es decir, destruiría el historial de compras y el
 * seguimiento de precios. Con baja lógica el producto desaparece de la nevera
 * pero su historia se conserva.
 *
 * Query param `?hard=1` fuerza el borrado físico, para casos de limpieza
 * explícita (por ejemplo, un producto creado por error y nunca usado).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const existing = await db.pantryItem.findFirst({
      where: { id, userId: auth.userId },
      include: { _count: { select: { movements: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const hard = req.nextUrl.searchParams.get("hard") === "1";

    if (!hard) {
      await db.pantryItem.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({
        success: true,
        mode: "soft",
        message: `"${existing.name}" salió de la nevera. Su historial de ${existing._count.movements} movimiento(s) se conserva.`,
      });
    }

    // Borrado físico: se exige que no haya historia que destruir.
    if (existing._count.movements > 0) {
      return NextResponse.json(
        {
          error: "has_history",
          message: `"${existing.name}" tiene ${existing._count.movements} movimiento(s) en su historial. Borrarlo destruiría el seguimiento de precios y compras. Usa la baja lógica.`,
        },
        { status: 409 }
      );
    }

    await db.pantryItem.delete({ where: { id } });
    return NextResponse.json({ success: true, mode: "hard" });
  } catch (error) {
    console.error("Delete pantry item error:", error);
    return NextResponse.json({ error: "Error al eliminar el producto" }, { status: 500 });
  }
}
