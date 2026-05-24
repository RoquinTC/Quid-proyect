import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const items = await prisma.maintenanceItem.findMany({
      where: {
        maintenanceRecord: {
          vehicle: {
            userId: session.user.id
          }
        }
      },
      select: { name: true },
      distinct: ['name']
    });

    const names = items.map(i => i.name);
    return NextResponse.json(names);
  } catch (error) {
    console.error("[CUSTOM_MAINTENANCE_ITEMS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
