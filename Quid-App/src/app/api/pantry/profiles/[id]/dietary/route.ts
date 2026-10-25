import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/pantry/api-helpers";

/**
 * GET/PUT /api/pantry/profiles/[id]/dietary
 *
 * Perfil alimenticio de un perfil de salud, con los **tres niveles** de la
 * especificación:
 *
 *   - `restrictions` (DURAS): bloquean. Intolerancias, alergias, celiaquía.
 *   - `preferences` (BLANDAS): advierten. Diabetes, hipertensión, artritis.
 *   - `avoid` (lo que el usuario no quiere ver): gana sobre lo demás.
 *
 * Además se gestionan las `conditions` (diagnósticos) porque de ellas sale la
 * restricción: sin condición no hay perfil que aplicar.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const profile = await db.healthProfile.findFirst({
      where: { id, userId: auth.userId },
      include: { dietaryProfile: true, conditions: true },
    });
    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    const dietary = profile.dietaryProfile;
    return NextResponse.json({
      profileId: profile.id,
      name: profile.name,
      conditions: profile.conditions.map((c) => ({
        id: c.id,
        name: c.name,
        severity: c.severity,
        origin: c.origin,
      })),
      restrictions: asStringArray(dietary?.restrictions),
      preferences: asStringArray(dietary?.preferences),
      avoid: asStringArray(dietary?.avoid),
      notes: dietary?.aiSummary ?? "",
    });
  } catch (error) {
    console.error("Get dietary profile error:", error);
    return NextResponse.json({ error: "Error al obtener el perfil" }, { status: 500 });
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .flat()
      .filter((v): v is string => typeof v === "string");
  }
  return [];
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const profile = await db.healthProfile.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    }

    const clean = (value: unknown): string[] =>
      Array.isArray(value)
        ? value
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter(Boolean)
        : [];

    const restrictions = clean(body?.restrictions);
    const preferences = clean(body?.preferences);
    const avoid = clean(body?.avoid);

    // ── Condiciones: se reemplazan las manuales, se conservan las de medicación ──
    const conditions = clean(body?.conditions);
    if (Array.isArray(body?.conditions)) {
      await db.healthCondition.deleteMany({
        where: { profileId: id, userId: auth.userId, origin: "manual" },
      });
      for (const name of conditions) {
        await db.healthCondition.create({
          data: { userId: auth.userId, profileId: id, name, origin: "manual" },
        });
      }
    }

    const data = {
      restrictions,
      preferences,
      avoid,
      // `allowOverrides` son las excepciones del usuario; se dejan intactas.
      generatedAt: new Date(),
    };

    const existing = await db.dietaryProfile.findUnique({ where: { profileId: id } });
    if (existing) {
      await db.dietaryProfile.update({ where: { profileId: id }, data });
    } else {
      await db.dietaryProfile.create({ data: { profileId: id, ...data } });
    }

    return NextResponse.json({ success: true, restrictions, preferences, avoid });
  } catch (error) {
    console.error("Update dietary profile error:", error);
    return NextResponse.json({ error: "No se pudo guardar el perfil" }, { status: 500 });
  }
}
