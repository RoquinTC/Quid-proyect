import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, categoryUpdateSchema, categoryDeleteSchema, categoryCreateSchema } from "@/lib/validations";

// Default categories that always appear
const defaultIncomeCategories = ["Salario", "Freelance", "Inversiones", "Ventas", "Otros"];
const defaultExpenseCategories = [
  "Alimentación",
  "Transporte",
  "Vivienda",
  "Salud",
  "Entretenimiento",
  "Educación",
  "Ropa",
  "Servicios",
  "Deudas",
  "Ahorros",
  "Suscripciones",
  "Otros",
];

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "income" or "expense"

    // Get all unique (category, subCategory) pairs from user's budgets
    const budgets = await db.budget.findMany({
      where: {
        userId: session.user.id,
        ...(type ? { type } : {}),
      },
      select: { category: true, subCategory: true, type: true },
      distinct: ["category", "subCategory"],
    });

    // Get all unique (category, subCategory) pairs from user's transactions
    const transactions = await db.transaction.findMany({
      where: {
        userId: session.user.id,
        category: { not: null },
        ...(type ? { type } : {}),
      },
      select: { category: true, subCategory: true, type: true },
      distinct: ["category", "subCategory"],
    });

    // Get custom categories (including hidden flags for defaults)
    const customCategories = await db.category.findMany({
      where: {
        userId: session.user.id,
        ...(type ? { type } : {}),
      },
    });

    // Build a set of hidden default category names for this user
    const hiddenDefaults = new Set(
      customCategories
        .filter((c) => c.hidden)
        .map((c) => c.name)
    );

    // Build a map of category -> Set of subcategories
    const categoryMap: Record<string, Record<string, Set<string>>> = {
      income: {},
      expense: {},
    };

    // Add defaults (excluding hidden ones)
    for (const cat of defaultIncomeCategories) {
      if (!hiddenDefaults.has(cat)) categoryMap.income[cat] = new Set();
    }
    for (const cat of defaultExpenseCategories) {
      if (!hiddenDefaults.has(cat)) categoryMap.expense[cat] = new Set();
    }

    // Merge custom categories (excluding hidden ones — those are defaults the user removed)
    for (const cc of customCategories) {
      if (cc.hidden) continue;
      const t = cc.type as "income" | "expense";
      if (!categoryMap[t]) categoryMap[t] = {};
      if (!categoryMap[t][cc.name]) categoryMap[t][cc.name] = new Set();
    }

    // Merge budget categories
    for (const b of budgets) {
      const t = b.type as "income" | "expense";
      if (!categoryMap[t]) categoryMap[t] = {};
      if (!categoryMap[t][b.category]) categoryMap[t][b.category] = new Set();
      if (b.subCategory) categoryMap[t][b.category].add(b.subCategory);
    }

    // Merge transaction categories
    for (const tx of transactions) {
      if (!tx.category) continue;
      const t = (tx.type as "income" | "expense") || "expense";
      if (!categoryMap[t]) categoryMap[t] = {};
      if (!categoryMap[t][tx.category]) categoryMap[t][tx.category] = new Set();
      if (tx.subCategory) categoryMap[t][tx.category].add(tx.subCategory);
    }

    // Convert Sets to sorted arrays
    const result: Record<string, Array<{ name: string; subcategories: string[] }>> = {
      income: Object.entries(categoryMap.income)
        .map(([name, subs]) => ({ name, subcategories: Array.from(subs).sort() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      expense: Object.entries(categoryMap.expense)
        .map(([name, subs]) => ({ name, subcategories: Array.from(subs).sort() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get categories error:", error);
    return NextResponse.json({ error: "Error al obtener categorías" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await validateBody(req, categoryCreateSchema);
    const { type, name, icon, color } = body;

    if (!type || !name) {
      return NextResponse.json({ error: "Tipo y nombre son requeridos" }, { status: 400 });
    }

    const category = await db.category.create({
      data: {
        userId: session.user.id,
        type,
        name,
        icon: icon || null,
        color: color || null,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error: unknown) {
    // Handle unique constraint violation
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre y tipo" }, { status: 409 });
    }
    console.error("Create category error:", error);
    return NextResponse.json({ error: "Error al crear categoría" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, categoryUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { type, oldCategory, oldSubCategory, newCategory, newSubCategory } = body;

    if (!type || !oldCategory || !newCategory) {
      return NextResponse.json({ error: "Tipo, categoría antigua y nueva categoría son requeridos" }, { status: 400 });
    }

    let updatedTransactions = 0;
    let updatedBudgets = 0;
    let updatedInstallments = 0;

    // Update transactions
    const txWhere: Record<string, unknown> = {
      userId: session.user.id,
      type,
      category: oldCategory,
    };
    if (oldSubCategory !== undefined && oldSubCategory !== null) {
      txWhere.subCategory = oldSubCategory;
    }

    const txUpdateData: Record<string, unknown> = {
      category: newCategory,
    };
    if (newSubCategory !== undefined) {
      txUpdateData.subCategory = newSubCategory || null;
    }

    updatedTransactions = await db.transaction.updateMany({
      where: txWhere,
      data: txUpdateData,
    }).then((r) => r.count);

    // Update budgets
    const budgetWhere: Record<string, unknown> = {
      userId: session.user.id,
      type,
      category: oldCategory,
    };
    if (oldSubCategory !== undefined && oldSubCategory !== null) {
      budgetWhere.subCategory = oldSubCategory;
    }

    const budgetUpdateData: Record<string, unknown> = {
      category: newCategory,
    };
    if (newSubCategory !== undefined) {
      budgetUpdateData.subCategory = newSubCategory || null;
    }

    updatedBudgets = await db.budget.updateMany({
      where: budgetWhere,
      data: budgetUpdateData,
    }).then((r) => r.count);

    // Update installments
    const instWhere: Record<string, unknown> = {
      category: oldCategory,
    };
    if (oldSubCategory !== undefined && oldSubCategory !== null) {
      instWhere.subCategory = oldSubCategory;
    }

    const instUpdateData: Record<string, unknown> = {
      category: newCategory,
    };
    if (newSubCategory !== undefined) {
      instUpdateData.subCategory = newSubCategory || null;
    }

    // Only update installments belonging to the user's debts
    const userDebtIds = await db.debt.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });
    const debtIds = userDebtIds.map((d) => d.id);

    if (debtIds.length > 0) {
      updatedInstallments = await db.installment.updateMany({
        where: {
          ...instWhere,
          debtId: { in: debtIds },
        },
        data: instUpdateData,
      }).then((r) => r.count);
    }

    // Also update custom category name if it exists
    await db.category.updateMany({
      where: {
        userId: session.user.id,
        type,
        name: oldCategory,
      },
      data: {
        name: newCategory,
      },
    });

    return NextResponse.json({
      updatedTransactions,
      updatedBudgets,
      updatedInstallments,
    });
  } catch (error) {
    console.error("Update categories error:", error);
    return NextResponse.json({ error: "Error al actualizar categorías" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, categoryDeleteSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { type, category, subCategory } = body;

    if (!type || !category) {
      return NextResponse.json({ error: "Tipo y categoría son requeridos" }, { status: 400 });
    }

    let updatedTransactions = 0;
    let deletedBudgets = 0;
    let updatedInstallments = 0;

    // For transactions: set category/subCategory to null (don't delete the transaction)
    const txWhere: Record<string, unknown> = {
      userId: session.user.id,
      type,
      category,
    };
    if (subCategory) {
      txWhere.subCategory = subCategory;
    }

    updatedTransactions = await db.transaction.updateMany({
      where: txWhere,
      data: {
        category: null,
        subCategory: null,
      },
    }).then((r) => r.count);

    // For budgets: delete the budget entries matching the criteria
    const budgetWhere: Record<string, unknown> = {
      userId: session.user.id,
      type,
      category,
    };
    if (subCategory) {
      budgetWhere.subCategory = subCategory;
    }

    deletedBudgets = await db.budget.deleteMany({
      where: budgetWhere,
    }).then((r) => r.count);

    // For installments: set category/subCategory to null
    const instWhere: Record<string, unknown> = {
      category,
    };
    if (subCategory) {
      instWhere.subCategory = subCategory;
    }

    // Only update installments belonging to the user's debts
    const userDebtIds = await db.debt.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });
    const debtIds = userDebtIds.map((d) => d.id);

    if (debtIds.length > 0) {
      updatedInstallments = await db.installment.updateMany({
        where: {
          ...instWhere,
          debtId: { in: debtIds },
        },
        data: {
          category: null,
          subCategory: null,
        },
      }).then((r) => r.count);
    }

    // Also handle default category deletion: mark as hidden instead of deleting
    const defaultNames = new Set([...defaultIncomeCategories, ...defaultExpenseCategories]);
    if (defaultNames.has(category) && !subCategory) {
      // This is a default category the user wants to remove — mark it as hidden
      await db.category.upsert({
        where: {
          userId_type_name: {
            userId: session.user.id,
            type,
            name: category,
          },
        },
        create: {
          userId: session.user.id,
          type,
          name: category,
          hidden: true,
        },
        update: {
          hidden: true,
        },
      });
    } else {
      // Custom category — actually delete the record
      await db.category.deleteMany({
        where: {
          userId: session.user.id,
          type,
          name: category,
        },
      });
    }

    return NextResponse.json({
      updatedTransactions,
      deletedBudgets,
      updatedInstallments,
    });
  } catch (error) {
    console.error("Delete categories error:", error);
    return NextResponse.json({ error: "Error al eliminar categorías" }, { status: 500 });
  }
}
