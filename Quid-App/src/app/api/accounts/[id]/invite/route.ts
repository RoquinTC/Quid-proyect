import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAndPushNotification } from "@/lib/push";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: accountId } = await params;
    const body = await req.json();
    const { email, role } = body as { email: string; role: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "El correo electrónico es requerido" },
        { status: 400 }
      );
    }

    const validRole = role === "viewer" ? "viewer" : "editor";

    // Verify the current user is the account owner
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
        { error: "Solo el propietario de la cuenta puede enviar invitaciones" },
        { status: 403 }
      );
    }

    // Look up the target user by email
    const targetUser = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!targetUser) {
      return NextResponse.json(
        {
          error:
            "No se encontró un usuario con ese correo electrónico. El usuario debe estar registrado en Quid.",
        },
        { status: 404 }
      );
    }

    // Cannot invite yourself
    if (targetUser.id === session.user.id) {
      return NextResponse.json(
        { error: "No puedes invitarte a ti mismo" },
        { status: 400 }
      );
    }

    // Check if user is already a shared user
    const existingSharedUser = await db.sharedAccountUser.findUnique({
      where: {
        accountId_userId: {
          accountId,
          userId: targetUser.id,
        },
      },
    });

    if (existingSharedUser) {
      return NextResponse.json(
        { error: "Este usuario ya tiene acceso a esta cuenta" },
        { status: 400 }
      );
    }

    // Check if there's a pending invitation
    const pendingInvitation = await db.accountInvitation.findFirst({
      where: {
        accountId,
        inviteeId: targetUser.id,
        status: "pending",
      },
    });

    if (pendingInvitation) {
      return NextResponse.json(
        { error: "Ya existe una invitación pendiente para este usuario" },
        { status: 400 }
      );
    }

    // Get inviter name for the notification
    const inviter = await db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });

    // Create the invitation
    const invitation = await db.accountInvitation.create({
      data: {
        accountId,
        inviterId: session.user.id,
        inviteeId: targetUser.id,
        inviteeEmail: targetUser.email,
        role: validRole,
        status: "pending",
      },
      include: {
        account: { select: { id: true, name: true, color: true } },
        inviter: { select: { id: true, name: true, email: true } },
        invitee: { select: { id: true, name: true, email: true } },
      },
    });

    // Create notification for the invitee (+ push)
    await createAndPushNotification({
      userId: targetUser.id,
      type: "invitation_received",
      title: "Invitación a cuenta compartida",
      message: `${inviter?.name || "Alguien"} te ha invitado a compartir la cuenta '${account.name}'`,
      pushBody: `${inviter?.name || "Alguien"} te invitó a compartir "${account.name}"`,
      data: {
        accountId,
        invitationId: invitation.id,
      },
      url: "/",
    });

    // Set account as shared
    await db.account.update({
      where: { id: accountId },
      data: { isShared: true },
    });

    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    console.error("Send invitation error:", error);
    return NextResponse.json(
      { error: "Error al enviar la invitación" },
      { status: 500 }
    );
  }
}
