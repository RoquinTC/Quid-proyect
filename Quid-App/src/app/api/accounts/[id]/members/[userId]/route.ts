import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: accountId, userId: memberUserId } = await params;

    // Verify the account exists and current user is the owner
    const account = await db.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    if (account.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Solo el propietario puede remover miembros" },
        { status: 403 }
      );
    }

    // Verify the shared user exists
    const sharedUser = await db.sharedAccountUser.findUnique({
      where: {
        accountId_userId: {
          accountId,
          userId: memberUserId,
        },
      },
    });

    if (!sharedUser) {
      return NextResponse.json(
        { error: "El usuario no es miembro de esta cuenta" },
        { status: 404 }
      );
    }

    // Delete the SharedAccountUser record
    await db.sharedAccountUser.delete({
      where: {
        accountId_userId: {
          accountId,
          userId: memberUserId,
        },
      },
    });

    // Create notification for the removed user
    await db.appNotification.create({
      data: {
        userId: memberUserId,
        type: "member_removed",
        title: "Acceso removido",
        message: `Has sido removido de la cuenta compartida '${account.name}'`,
        data: JSON.stringify({ accountId }),
      },
    });

    // Check if there are no more shared users — if so, set isShared to false
    const remainingSharedUsers = await db.sharedAccountUser.count({
      where: { accountId },
    });

    if (remainingSharedUsers === 0) {
      await db.account.update({
        where: { id: accountId },
        data: { isShared: false },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Miembro removido correctamente",
    });
  } catch (error) {
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "Error al remover miembro" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: accountId, userId: memberUserId } = await params;
    const body = await req.json();
    const { role } = body as { role: string };

    if (!role || (role !== "viewer" && role !== "editor")) {
      return NextResponse.json(
        { error: "El rol debe ser 'viewer' o 'editor'" },
        { status: 400 }
      );
    }

    // Verify the account exists and current user is the owner
    const account = await db.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    if (account.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Solo el propietario puede cambiar roles" },
        { status: 403 }
      );
    }

    // Verify the shared user exists
    const sharedUser = await db.sharedAccountUser.findUnique({
      where: {
        accountId_userId: {
          accountId,
          userId: memberUserId,
        },
      },
    });

    if (!sharedUser) {
      return NextResponse.json(
        { error: "El usuario no es miembro de esta cuenta" },
        { status: 404 }
      );
    }

    // Update the role
    const updatedMember = await db.sharedAccountUser.update({
      where: {
        accountId_userId: {
          accountId,
          userId: memberUserId,
        },
      },
      data: { role },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Create notification for the user whose role changed
    const roleLabel = role === "viewer" ? "visualizador" : "editor";
    await db.appNotification.create({
      data: {
        userId: memberUserId,
        type: "role_changed",
        title: "Rol actualizado",
        message: `Tu rol en la cuenta '${account.name}' ha cambiado a ${roleLabel}`,
        data: JSON.stringify({ accountId, newRole: role }),
      },
    });

    return NextResponse.json(updatedMember);
  } catch (error) {
    console.error("Change role error:", error);
    return NextResponse.json(
      { error: "Error al cambiar el rol del miembro" },
      { status: 500 }
    );
  }
}
