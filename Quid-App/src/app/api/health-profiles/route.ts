import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, healthProfileCreateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const profiles = await db.healthProfile.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(profiles);
  } catch (error) {
    console.error("Get health profiles error:", error);
    return NextResponse.json({ error: "Error al obtener perfiles de salud" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, healthProfileCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { name, type, diseases, restrictions, aiRestrictions } = body;

    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const profile = await db.healthProfile.create({
      data: {
        userId: session.user.id,
        name,
        type: type || "owner",
        diseases: diseases ? JSON.stringify(diseases) : null,
        restrictions: restrictions ? JSON.stringify(restrictions) : null,
        aiRestrictions: aiRestrictions ? JSON.stringify(aiRestrictions) : null,
      },
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    console.error("Create health profile error:", error);
    return NextResponse.json({ error: "Error al crear perfil de salud" }, { status: 500 });
  }
}
