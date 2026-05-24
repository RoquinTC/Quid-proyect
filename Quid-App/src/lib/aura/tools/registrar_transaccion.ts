import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { createCreditCardPurchaseFromAura } from "../index"; // We can export this or define it here

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export type TransactionProposalState = {
  type: "income" | "expense";
  amount: number | null;
  category: string | null;
  subCategory: string | null;
  dateText: string | null;
  accountName: string | null;
  debtName: string | null;
};

// Normalizar texto para comparación
function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extraer el valor numérico (dinero) del texto
export function parseAmount(text: string): number | null {
  const normalized = normalize(text);
  const moneyMatch = normalized.match(/(?:\$|cop\s*)?\s*(\d+(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(mil|k|millones|millon)?/);
  if (!moneyMatch) return null;

  const rawNumber = moneyMatch[1];
  const suffix = moneyMatch[2];
  let amount = Number(rawNumber.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  if (suffix === "mil" || suffix === "k") amount *= 1000;
  if (suffix === "millon" || suffix === "millones") amount *= 1_000_000;
  return Math.round(amount);
}

// Formatear fecha
function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(value);
}

// Parsear fecha del registro
export function parseRecordDate(text: string): Date {
  const normalized = normalize(text);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (/\b(antes de ayer|antier|anteayer)\b/.test(normalized)) {
    const d = new Date(today);
    d.setDate(today.getDate() - 2);
    return d;
  }
  if (/\bayer\b/.test(normalized)) {
    const d = new Date(today);
    d.setDate(today.getDate() - 1);
    return d;
  }
  return today;
}

// Buscar coincidencia de cuentas o tarjetas en los presupuestos del usuario
async function findCategoryAndSubcategoryFromText(text: string, userId: string) {
  const [budgets, customCats] = await Promise.all([
    db.budget.findMany({
      where: { userId },
      select: { category: true, subCategory: true },
    }),
    db.category.findMany({
      where: { userId, hidden: false },
      select: { name: true },
    }),
  ]);

  const normalized = normalize(text);

  // 1. Intentar coincidencia exacta con categoría / subcategoría de presupuestos
  for (const b of budgets) {
    if (b.subCategory) {
      const combined = normalize(`${b.category} / ${b.subCategory}`);
      const subNorm = normalize(b.subCategory);
      if (normalized.includes(combined) || normalized.includes(subNorm)) {
        return { category: b.category, subCategory: b.subCategory };
      }
    }
  }

  // 2. Intentar coincidencia con categoría principal de presupuestos
  for (const b of budgets) {
    const catNorm = normalize(b.category);
    if (normalized.includes(catNorm)) {
      return { category: b.category, subCategory: null };
    }
  }

  // 3. Intentar coincidencia con categorías personalizadas
  for (const cc of customCats) {
    const ccNorm = normalize(cc.name);
    if (normalized.includes(ccNorm)) {
      return { category: cc.name, subCategory: null };
    }
  }

  // 4. Intentar coincidencia con categorías estándar
  const standardCats = [
    "Alimentación", "Transporte", "Vivienda", "Salud", "Entretenimiento", 
    "Educación", "Ropa", "Servicios", "Deudas", "Ahorros", "Suscripciones", 
    "Otros", "Salario", "Freelance", "Inversiones", "Ventas"
  ];
  for (const sc of standardCats) {
    const scNorm = normalize(sc);
    if (normalized.includes(scNorm)) {
      return { category: sc, subCategory: null };
    }
  }

  return null;
}

// Analizar la propuesta previa a partir del texto del asistente
export function parsePreviousProposal(content: string): TransactionProposalState {
  const lines = content.split("\n");
  let type: "income" | "expense" = "expense";
  let accountName: string | null = null;
  let debtName: string | null = null;
  let amount: number | null = null;
  let category: string | null = null;
  let subCategory: string | null = null;
  let dateText: string | null = null;

  if (content.toLowerCase().includes("confirmar el ingreso")) {
    type = "income";
  }

  for (const line of lines) {
    if (line.includes("- Cuenta:")) {
      accountName = line.replace("- Cuenta:", "").trim();
    } else if (line.includes("- Tarjeta/deuda:")) {
      debtName = line.replace("- Tarjeta/deuda:", "").trim();
    } else if (line.includes("- Valor:")) {
      const valStr = line.replace("- Valor:", "").replace(/[^\d]/g, "").trim();
      amount = parseInt(valStr, 10) || null;
    } else if (line.includes("- Categoría:")) {
      const catVal = line.replace("- Categoría:", "").trim();
      if (catVal.includes(" / ")) {
        const parts = catVal.split(" / ");
        category = parts[0].trim();
        subCategory = parts[1].trim();
      } else {
        category = catVal;
      }
    } else if (line.includes("- Fecha:")) {
      dateText = line.replace("- Fecha:", "").trim();
    }
  }

  return { type, accountName, debtName, amount, category, subCategory, dateText };
}

// Actualizar propuesta aplicando correcciones del usuario
export async function updateTransactionProposal(
  userId: string,
  prevProposal: TransactionProposalState,
  lastUserMsg: string,
  accounts: any[],
  debts: any[]
) {
  const normalized = normalize(lastUserMsg);

  // 1. Detectar tipo
  let type = prevProposal.type;
  if (/\b(ingreso|ingrese|recibi|recibido)\b/.test(normalized)) {
    type = "income";
  } else if (/\b(gasto|gaste|compre|pague|deuda|egreso)\b/.test(normalized)) {
    type = "expense";
  }

  // 2. Detectar valor
  let amount = prevProposal.amount;
  const parsedAmt = parseAmount(lastUserMsg);
  if (parsedAmt !== null) {
    amount = parsedAmt;
  }

  // 3. Detectar cuenta o tarjeta
  let accountName = prevProposal.accountName;
  let debtName = prevProposal.debtName;

  // Buscar si menciona una cuenta
  const matchedAccount = accounts.find((acc) => {
    const accName = normalize(acc.name);
    const parts = accName.split(" / ");
    return normalized.includes(accName) || parts.some((part) => part.length >= 4 && normalized.includes(part));
  });

  // Buscar si menciona una tarjeta/deuda
  const matchedDebt = debts.find((debt) => {
    const dName = normalize(debt.name);
    return normalized.includes(dName) || dName.split(" ").some((part) => part.length >= 4 && normalized.includes(part));
  });

  if (matchedAccount) {
    accountName = matchedAccount.name;
    debtName = null;
  } else if (matchedDebt) {
    debtName = matchedDebt.name;
    accountName = null;
  }

  // 4. Detectar categoría y subcategoría
  let category = prevProposal.category;
  let subCategory = prevProposal.subCategory;
  const categoryMatch = lastUserMsg.match(/categor[ií]a:\s*([^/]+?)(?:\s*\/\s*(.+))?$/i) || lastUserMsg.match(/^categor[ií]a\s+([^/]+?)(?:\s*\/\s*(.+))?$/i);
  if (categoryMatch) {
    category = categoryMatch[1].trim();
    subCategory = categoryMatch[2] ? categoryMatch[2].trim() : null;
  } else {
    const matchedCat = await findCategoryAndSubcategoryFromText(lastUserMsg, userId);
    if (matchedCat) {
      category = matchedCat.category;
      subCategory = matchedCat.subCategory;
    }
  }

  // 5. Detectar fecha
  let dateText = prevProposal.dateText;
  if (/\b(ayer|hoy|antier|anteayer|fecha|dia)\b/.test(normalized)) {
    const date = parseRecordDate(lastUserMsg);
    dateText = new Intl.DateTimeFormat("es-CO", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date);
  }

  // Generar la respuesta del resumen actualizado
  const paymentMethodLine = debtName
    ? `- Tarjeta/deuda: ${debtName}`
    : `- Cuenta: ${accountName || "No especificada"}`;

  const categoryDisplay = subCategory ? `${category} / ${subCategory}` : (category || "Otros");

  return {
    text: [
      `He actualizado el resumen con tus correcciones:`,
      `Resumen para confirmar el ${type === "income" ? "ingreso" : "gasto"}:`,
      paymentMethodLine,
      `- Valor: ${COP.format(amount || 0)}`,
      `- Categoría: ${categoryDisplay}`,
      `- Fecha: ${dateText || "Hoy"}`,
      "",
      "¿Está todo correcto ahora? Responde CONFIRMAR para guardarlo o CANCELAR para descartarlo.",
    ].join("\n"),
    action: {
      type: "proposal" as const,
      tool: "registrar_transaccion" as const,
      requiresConfirmation: true,
      payload: {
        type,
        amount,
        category,
        subCategory,
        accountName,
        debtName,
        dateText,
      },
    },
  };
}

// Ejecutar transacción confirmada
export async function executeTransactionProposal(
  userId: string,
  proposal: TransactionProposalState,
  accounts: any[],
  debts: any[]
) {
  const { type, amount, category, subCategory, accountName, debtName, dateText } = proposal;

  if (!amount) throw new Error("Falta especificar el valor del movimiento.");

  const date = dateText ? parseRecordDate(dateText) : new Date();

  if (debtName) {
    const debt = debts.find((d) => normalize(d.name) === normalize(debtName));
    if (!debt) throw new Error(`No encontré la tarjeta de crédito o deuda "${debtName}".`);

    // Crear la compra con tarjeta
    await createCreditCardPurchaseFromAura({
      userId,
      debtId: debt.id,
      amount,
      description: `${category || "Gasto"} registrado por Aura`,
      category: category || "Otros",
      subCategory,
      date,
    });

    return {
      text: `Listo, guardé la compra en ${debt.name}: ${COP.format(amount)}, categoría ${subCategory ? `${category} / ${subCategory}` : (category || "Otros")}.`,
      action: {
        type: "executed" as const,
        tool: "registrar_transaccion",
        payload: { debtId: debt.id, amount, category, subCategory },
      },
    };
  }

  const account = accounts.find((acc) => normalize(acc.name) === normalize(accountName || ""));
  if (!account) throw new Error(`Falta especificar la cuenta para registrar el movimiento.`);

  const balanceChange = type === "income" ? amount : -amount;
  const description = `${category || (type === "income" ? "Ingreso" : "Gasto")} registrado por Aura`;

  const transaction = await db.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        type,
        amount,
        description,
        category: category || "Otros",
        subCategory,
        date,
        accountId: account.kind === "account" ? account.id : account.parentAccountId,
        subAccountId: account.kind === "subAccount" ? account.id : null,
        sourceModule: "aura",
        notes: "Registrado desde Aura",
      },
    });

    if (account.kind === "subAccount") {
      await tx.subAccount.update({ where: { id: account.id }, data: { balance: { increment: balanceChange } } });
    } else {
      await tx.account.update({ where: { id: account.id }, data: { balance: { increment: balanceChange } } });
    }

    const budget = await tx.budget.findFirst({ where: { userId, type, category: category || "Otros", subCategory: subCategory ?? null } });
    if (budget) {
      await tx.budget.update({ where: { id: budget.id }, data: { spent: { increment: amount } } });
    }

    return created;
  });

  const verb = type === "income" ? "ingreso" : "gasto";
  return {
    text: `Listo, guardé el ${verb} en ${account.name}: ${COP.format(amount)}, categoría ${subCategory ? `${category} / ${subCategory}` : (category || "Otros")}.`,
    action: {
      type: "executed" as const,
      tool: "registrar_transaccion",
      payload: { transactionId: transaction.id, amount, type, category, subCategory },
    },
  };
}
