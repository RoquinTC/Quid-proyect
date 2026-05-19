import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: invitationId } = await params;

    // Find the invitation
    const invitation = await db.accountInvitation.findUnique({
      where: { id: invitationId },
      include: {
        account: { select: { id: true, name: true } },
        invitee: { select: { id: true, name: true } },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitación no encontrada" },
        { status: 404 }
      );
    }

    // Verify the current user is the invitee
    if (invitation.inviteeId !== session.user.id) {
      return NextResponse.json(
        { error: "No tienes permiso para aceptar esta invitación" },
        { status: 403 }
      );
    }

    // Verify the invitation is still pending
    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: "Esta invitación ya no está pendiente" },
        { status: 400 }
      );
    }

    // Update invitation status
    await db.accountInvitation.update({
      where: { id: invitationId },
      data: { status: "accepted" },
    });

    // Create SharedAccountUser record
    await db.sharedAccountUser.create({
      data: {
        accountId: invitation.accountId,
        userId: session.user.id,
        role: invitation.role,
      },
    });

    // Create notification for the inviter
    const inviteeName = invitation.invitee.name || "Un usuario";
    await db.appNotification.create({
      data: {
        userId: invitation.inviterId,
        type: "invitation_accepted",
        title: "Invitación aceptada",
        message: `${inviteeName} ha aceptado tu invitación a la cuenta '${invitation.account.name}'`,
        data: JSON.stringify({
          accountId: invitation.accountId,
          invitationId,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Invitación aceptada correctamente",
    });
  } catch (error) {
    console.error("Accept invitation error:", error);
    return NextResponse.json(
      { error: "Error al aceptar la invitación" },
      { status: 500 }
    );
  }
}
