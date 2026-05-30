import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { createFinanceEntry, getTransportDescription } from "@/lib/transport-finance";
import { applyCreditInstallmentBudgetImpact } from "@/lib/budget-impact";
import {
  parsePreviousProposal,
  updateTransactionProposal,
  executeTransactionProposal,
} from "./tools/registrar_transaccion";
import {
  parsePreviousFuelProposal,
  updateFuelProposal,
  executeFuelProposal,
} from "./tools/registrar_tanqueo";

export type CoreMessage = { role: "user" | "assistant" | "system" | "data"; content: string };

export const AURA_MODEL = process.env.AURA_MODEL || "hermes3:8b";
const OLLAMA_API_BASE = process.env.OLLAMA_URL || "http://localhost:11434/api";
const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

type AuraAction =
  | "consultar_saldos"
  | "consultar_gastos"
  | "consultar_ingresos"
  | "consultar_transferencias"
  | "consultar_flujo"
  | "consultar_recurrentes"
  | "consultar_planner"
  | "consultar_metas"
  | "consultar_cdts"
  | "consultar_deudas"
  | "consultar_presupuestos"
  | "consultar_vehiculos"
  | "consultar_salud"
  | "consultar_despensa"
  | "registrar_transaccion"
  | "confirmar_recurrente"
  | "chat";

type AuraStructuredAction =
  | {
      type: "proposal";
      tool: "registrar_transaccion" | "registrar_tanqueo";
      payload: Record<string, unknown>;
      requiresConfirmation: true;
    }
  | {
      type: "executed";
      tool: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "select_account";
      choices: Array<{ name: string; id: string; kind: "account" | "subAccount" | "debt" }>;
    };

type AuraToolResult = {
  text: string;
  action?: AuraStructuredAction;
};

type AccountChoice = {
  id: string;
  name: string;
  balance: number;
  kind: "account" | "subAccount";
  parentAccountId?: string;
  parentAccountName?: string;
};

type PendingRecurring = {
  id: string;
  description: string;
  amount: number;
  type: string;
  scheduledDate: Date;
  accountId: string | null;
  subAccountId: string | null;
  category: string | null;
  subCategory: string | null;
};

type DebtChoice = {
  id: string;
  name: string;
  currentBalance: number;
  kind: "debt";
};

type DateRange = {
  start: Date;
  end: Date;
  label: string;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lastUserText(messages: CoreMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content.trim() || "";
}

function getBasicConversationFallback(text: string) {
  const normalized = normalize(text);
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|holi)\b/.test(normalized)) {
    return "Hola. Aquí estoy. Puedo ayudarte a registrar movimientos, revisar tus cuentas, ver pendientes o conversar un rato. ¿Qué tienes en mente?";
  }
  if (/\b(que haces|como estas|quien eres)\b/.test(normalized)) {
    return "Soy Aura, tu asistente dentro de QUID. Estoy aquí para ayudarte a organizar finanzas, pendientes y tu información diaria. También podemos conversar con calma.";
  }
  return null;
}

function resolveActionText(messages: CoreMessage[]) {
  const lastText = lastUserText(messages);
  if (isConfirmationText(lastText)) {
    const previousUsers = [...messages]
      .reverse()
      .filter((message) => message.role === "user" && !isConfirmationText(message.content))
      .slice(0, 3)
      .reverse()
      .map((message) => message.content.trim())
      .filter(Boolean);
    if (previousUsers.length > 0) return `${previousUsers.join(". ")}. CONFIRMAR`;
  }

  const lastIndex = messages.map((message) => message.role).lastIndexOf("user");
  if (lastIndex <= 0) return lastText;

  const previousAssistant = [...messages.slice(0, lastIndex)]
    .reverse()
    .find((message) => message.role === "assistant")?.content || "";
  const previousUser = [...messages.slice(0, lastIndex)]
    .reverse()
    .find((message) => message.role === "user")?.content || "";

  if (
    /\b(me falta|faltan datos|responde con esos datos|puedo registrar)\b/i.test(previousAssistant) &&
    inferAction(previousUser) === "registrar_transaccion"
  ) {
    return `${previousUser}. ${lastText}`;
  }

  return lastText;
}

function isConfirmationText(text: string) {
  const normalized = normalize(text);
  return /^(si|sí|confirmo|confirmar|confirma|guardar|guardalo|guárdalo|registralo|regístralo|ok|dale|listo)\b/.test(normalized);
}

function isCancellationText(text: string) {
  const normalized = normalize(text);
  return /^(no|cancelar|cancela|descartar|descartalo|descártalo|olvidalo|olvídalo)\b/.test(normalized);
}

function hasRecentAuraProposal(messages: CoreMessage[]) {
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  
  if (!lastAssistantMessage) return false;
  
  return /resumen para confirmar|responde confirmar/i.test(lastAssistantMessage.content);
}

function inferAction(text: string): AuraAction {
  const normalized = normalize(text);
  if (/\b(cuanto|cuanta|cuantos|cuantas|cuánto|cuánta|cuántos|cuántas)\b/.test(normalized)) {
    if (/\b(ingresos?\s+(vs|versus|contra)\s+gastos?|gastos?\s+(vs|versus|contra)\s+ingresos?|balance del mes|flujo)\b/.test(normalized)) return "consultar_flujo";
    if (/\b(gaste|gastado|gastos|egresos)\b/.test(normalized)) return "consultar_gastos";
    if (/\b(ingrese|ingresado|ingresos|recibi|recibido)\b/.test(normalized)) return "consultar_ingresos";
    if (/\b(transferi|transferido|transferencias)\b/.test(normalized)) return "consultar_transferencias";
  }
  if (/\b(ingresos?\s+(vs|versus|contra)\s+gastos?|gastos?\s+(vs|versus|contra)\s+ingresos?|flujo|balance del mes)\b/.test(normalized)) return "consultar_flujo";
  if (/\b(gaste|compre|pague|registre|registra|anota|anote)\b/.test(normalized)) {
    if (/\b(recurrente|pendiente|programado|programada)\b/.test(normalized)) return "confirmar_recurrente";
    return "registrar_transaccion";
  }
  if (/\b(confirma|confirmar|marcar|marca)\b/.test(normalized) && /\b(pago|ingreso|recurrente|pendiente)\b/.test(normalized)) {
    return "confirmar_recurrente";
  }
  if (/\b(cuanto tengo|saldo|saldos|balance|dinero disponible|plata)\b/.test(normalized)) return "consultar_saldos";
  if (/\b(cdt|cdts|certificado|certificados)\b/.test(normalized)) return "consultar_cdts";
  if (/\b(meta|metas|ahorro|ahorros|objetivo|objetivos)\b/.test(normalized)) return "consultar_metas";
  if (/\b(deuda|deudas|tarjeta|tarjetas|credito|crédito|prestamo|préstamo)\b/.test(normalized)) return "consultar_deudas";
  if (/\b(presupuesto|presupuestos|budget|sobregiro|sobregirado)\b/.test(normalized)) return "consultar_presupuestos";
  if (/\b(vehiculo|vehículos|vehiculo|vehiculos|moto|carro|transporte|tanqueo|mantenimiento|soat|placa)\b/.test(normalized)) return "consultar_vehiculos";
  if (/\b(salud|medicamento|medicamentos|cita|citas medicas|médicas|doctor|medico|médico)\b/.test(normalized)) return "consultar_salud";
  if (/\b(despensa|mercado|nevera|producto|productos|inventario|comida)\b/.test(normalized)) return "consultar_despensa";
  if (/\b(transferencias|transferi|transferido|movimientos entre cuentas)\b/.test(normalized)) return "consultar_transferencias";
  if (/\b(ingresos|ingrese|ingresado|recibi|recibido|nomina|sueldo|salario)\b/.test(normalized)) return "consultar_ingresos";
  if (/\b(gastos|gaste|gastado|egresos|ingresos vs gastos|acumulado)\b/.test(normalized)) return "consultar_gastos";
  if (/\b(recurrentes|pagos pendientes|pagos programados|nomina|nómina)\b/.test(normalized)) return "consultar_recurrentes";
  if (/\b(pendiente hoy|pendientes hoy|planner|radar|agenda|que tengo hoy|qué tengo hoy)\b/.test(normalized)) return "consultar_planner";
  return "chat";
}

function dateOnly(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function startOfWeek(value: Date) {
  const date = dateOnly(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function parseDateRange(text: string): DateRange {
  const normalized = normalize(text);
  const today = dateOnly(new Date());

  if (/\b(antes de ayer|antier|anteayer)\b/.test(normalized)) {
    const day = addDays(today, -2);
    return { start: day, end: addDays(day, 1), label: "antes de ayer" };
  }

  if (/\bayer\b/.test(normalized)) {
    const day = addDays(today, -1);
    return { start: day, end: addDays(day, 1), label: "ayer" };
  }

  if (/\bhoy\b/.test(normalized)) {
    return { start: today, end: addDays(today, 1), label: "hoy" };
  }

  const lastDays = normalized.match(/\b(?:ultimos|ultimas|últimos|últimas)\s+(\d+)\s+dias\b/);
  if (lastDays) {
    const days = Math.max(1, Number(lastDays[1]));
    return { start: addDays(today, -days + 1), end: addDays(today, 1), label: `los últimos ${days} días` };
  }

  if (/\bsemana pasada\b/.test(normalized)) {
    const thisWeek = startOfWeek(today);
    return { start: addDays(thisWeek, -7), end: thisWeek, label: "la semana pasada" };
  }

  if (/\b(esta semana|semana actual)\b/.test(normalized)) {
    return { start: startOfWeek(today), end: addDays(today, 1), label: "esta semana" };
  }

  if (/\b(mes anterior|mes pasado)\b/.test(normalized)) {
    const startThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { start: startLastMonth, end: startThisMonth, label: "el mes anterior" };
  }

  if (/\b(este mes|mes actual)\b/.test(normalized)) {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: addDays(today, 1), label: "este mes" };
  }

  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: addDays(today, 1), label: "este mes" };
}

function parseRecordDate(text: string) {
  const normalized = normalize(text);
  const today = dateOnly(new Date());

  if (/\b(antes de ayer|antier|anteayer)\b/.test(normalized)) return addDays(today, -2);
  if (/\bayer\b/.test(normalized)) return addDays(today, -1);
  return today;
}

function parseAmount(text: string) {
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

function inferTransactionType(text: string): "income" | "expense" {
  const normalized = normalize(text);
  if (/\b(recibi|ingreso|me pagaron|consigne|depositaron|salario|nomina|sueldo)\b/.test(normalized)) {
    return "income";
  }
  return "expense";
}

function inferCategory(text: string, type: "income" | "expense") {
  const normalized = normalize(text);
  if (type === "income") {
    if (/\b(sueldo|salario|nomina)\b/.test(normalized)) return "Sueldo";
    return "Otros";
  }
  if (/\b(gasolina|tanqueo|combustible)\b/.test(normalized)) return "Transporte";
  if (/\b(mercado|supermercado|comida|despensa)\b/.test(normalized)) return "Alimentación";
  if (/\b(medicina|medico|cita|salud)\b/.test(normalized)) return "Salud";
  if (/\b(arriendo|renta|servicio|internet|luz|agua|gas)\b/.test(normalized)) return "Gastos fijos";
  return "Otros";
}

export async function getSmartCategory(text: string, userId: string, type: "income" | "expense"): Promise<{ category: string, subCategory: string | null }> {
  const defaultIncomeCategories = ["Salario", "Freelance", "Inversiones", "Ventas", "Otros"];
  const defaultExpenseCategories = [
    "Alimentación", "Transporte", "Vivienda", "Salud", "Entretenimiento", 
    "Educación", "Ropa", "Servicios", "Deudas", "Ahorros", "Suscripciones", 
    "Otros"
  ];

  const [budgets, customCats] = await Promise.all([
    db.budget.findMany({
      where: { userId, type },
      select: { category: true, subCategory: true },
    }),
    db.category.findMany({
      where: { userId, type, hidden: false },
      select: { name: true },
    }),
  ]);

  const normalized = normalize(text);

  // 1. Check for category: <cat> or subcategory: <sub> matches in message
  const categoryMatch = text.match(/categor[ií]a:\s*([^/]+?)(?:\s*\/\s*(.+))?$/i) || text.match(/^categor[ií]a\s+([^/]+?)(?:\s*\/\s*(.+))?$/i);
  if (categoryMatch) {
    const cat = categoryMatch[1].trim();
    const sub = categoryMatch[2] ? categoryMatch[2].trim() : null;
    return { category: cat, subCategory: sub };
  }

  // 2. Exact or partial match on budget subcategory
  for (const b of budgets) {
    if (b.subCategory) {
      const combined = normalize(`${b.category} / ${b.subCategory}`);
      const subNorm = normalize(b.subCategory);
      if (normalized.includes(combined) || normalized.includes(subNorm)) {
        return { category: b.category, subCategory: b.subCategory };
      }
    }
  }

  // 3. Exact or partial match on budget main category
  for (const b of budgets) {
    const catNorm = normalize(b.category);
    if (normalized.includes(catNorm)) {
      return { category: b.category, subCategory: null };
    }
  }

  // 4. Exact or partial match on custom categories
  for (const cc of customCats) {
    const ccNorm = normalize(cc.name);
    if (normalized.includes(ccNorm)) {
      return { category: cc.name, subCategory: null };
    }
  }

  // 5. Contextual keyword mapping for standard categories
  if (type === "income") {
    if (/\b(sueldo|salario|nomina|nómina)\b/.test(normalized)) return { category: "Salario", subCategory: null };
    if (/\b(freelance|honorarios|proyecto|contrato)\b/.test(normalized)) return { category: "Freelance", subCategory: null };
    if (/\b(inversion|inversiones|dividendos|cdt)\b/.test(normalized)) return { category: "Inversiones", subCategory: null };
    if (/\b(venta|ventas|negocio)\b/.test(normalized)) return { category: "Ventas", subCategory: null };
  } else {
    if (/\b(gasolina|tanqueo|combustible|peaje|peajes|transporte|moto|carro|uber|didi|cabify|taxi|soat)\b/.test(normalized)) {
      const isFuel = /\b(gasolina|tanqueo|combustible)\b/.test(normalized);
      return { category: "Transporte", subCategory: isFuel ? "Combustible" : null };
    }
    if (/\b(papeleria|papelería|cuaderno|esfero|lapiz|impresion|impresiones|copias)\b/.test(normalized)) {
      return { category: "Otros", subCategory: "Papelería" };
    }
    if (/\b(mercado|supermercado|comida|despensa|restaurante|almuerzo|cena|desayuno|pan|leche|cafe|cafeteria|domicilio|rappicard|rappi)\b/.test(normalized)) {
      const isRest = /\b(restaurante|almuerzo|cena|desayuno|cafe|cafeteria|domicilio)\b/.test(normalized);
      return { category: "Alimentación", subCategory: isRest ? "Restaurantes" : "Supermercado" };
    }
    if (/\b(medicina|medico|médico|cita|salud|drogueria|farmacia|pastillas|eps|clinica|hospital)\b/.test(normalized)) return { category: "Salud", subCategory: null };
    if (/\b(arriendo|renta|servicio|internet|luz|agua|gas|hogar|casa|apartamento)\b/.test(normalized)) return { category: "Servicios", subCategory: null };
    if (/\b(cine|pelicula|concierto|bar|cerveza|cervezas|fiesta|rumba|juego|juegos|netflix|spotify|disney|hbo|streaming)\b/.test(normalized)) return { category: "Entretenimiento", subCategory: null };
    if (/\b(ropa|camisa|pantalon|zapatos|vestido|chaqueta|tienda)\b/.test(normalized)) return { category: "Ropa", subCategory: null };
    if (/\b(cuota|tarjeta|prestamo|préstamo|banco|intereses)\b/.test(normalized)) return { category: "Deudas", subCategory: null };
    if (/\b(ahorro|ahorrar|inversion|alcancia|bolsillo)\b/.test(normalized)) return { category: "Ahorros", subCategory: null };
  }

  return { category: "Otros", subCategory: null };
}

function isFuelIntent(text: string) {
  return /\b(gasolina|tanqueo|combustible|galon|galones|galón)\b/.test(normalize(text));
}

function parseKm(text: string) {
  const normalized = normalize(text);
  const match = normalized.match(/\b(?:km|kilometraje|odometro|odómetro)\s*(?:en|de|actual)?\s*(\d+(?:[.,]\d+)?)\b/) || normalized.match(/\b(\d+(?:[.,]\d+)?)\s*km\b/);
  if (!match) return null;
  const km = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(km) ? km : null;
}

function parsePricePerGallon(text: string) {
  const normalized = normalize(text);
  const match =
    normalized.match(/\b(?:galon|galón)\s*(?:a|en|de)?\s*(\d+(?:[.,]\d{3})*(?:[.,]\d+)?)\b/) ||
    normalized.match(/\bprecio\s*(?:del)?\s*(?:galon|galón)?\s*(\d+(?:[.,]\d{3})*(?:[.,]\d+)?)\b/);
  if (!match) return null;
  const price = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(price) ? price : null;
}

function transactionDescription(text: string, category: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 80) return cleaned;
  return `${category} registrado por Aura`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(date: Date) {
  const today = startOfToday();
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(value);
}

function formatDateRange(range: DateRange) {
  return `${range.label} (${range.start.toLocaleDateString("es-CO")} - ${addDays(range.end, -1).toLocaleDateString("es-CO")})`;
}

async function getAccountChoices(userId: string): Promise<AccountChoice[]> {
  const accounts = await db.account.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { subAccounts: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
  });

  return accounts.flatMap((account) => [
    {
      id: account.id,
      name: account.name,
      balance: toNumber(account.balance),
      kind: "account" as const,
    },
    ...account.subAccounts.map((subAccount) => ({
      id: subAccount.id,
      name: `${account.name} / ${subAccount.name}`,
      balance: toNumber(subAccount.balance),
      kind: "subAccount" as const,
      parentAccountId: account.id,
      parentAccountName: account.name,
    })),
  ]);
}

function findMentionedAccount(text: string, accounts: AccountChoice[]) {
  const normalized = normalize(text);
  return accounts.find((account) => {
    const accountName = normalize(account.name);
    const parts = accountName.split(" / ");
    return normalized.includes(accountName) || parts.some((part) => part.length >= 4 && normalized.includes(part));
  });
}

async function getDebtChoices(userId: string): Promise<DebtChoice[]> {
  const debts = await db.debt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, bank: true, currentBalance: true },
  });

  return debts.map((debt) => ({
    id: debt.id,
    name: debt.bank ? `${debt.name} ${debt.bank}` : debt.name,
    currentBalance: toNumber(debt.currentBalance),
    kind: "debt" as const,
  }));
}

export async function createCreditCardPurchaseFromAura(params: {
  userId: string;
  debtId: string;
  amount: number;
  description: string;
  category: string;
  subCategory?: string | null;
  date: Date;
}) {
  const debt = await db.debt.findUnique({
    where: { id: params.debtId },
    select: { id: true, paymentDate: true, type: true },
  });

  if (!debt) throw new Error("No encontré la tarjeta o deuda indicada.");

  const nextPaymentDate = new Date(params.date);
  nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
  if (debt.paymentDate) {
    const lastDay = new Date(nextPaymentDate.getFullYear(), nextPaymentDate.getMonth() + 1, 0).getDate();
    nextPaymentDate.setDate(Math.min(debt.paymentDate, lastDay));
  }

  const installment = await db.$transaction(async (tx) => {
    const createdInstallment = await tx.installment.create({
      data: {
        debtId: debt.id,
        description: params.description,
        totalAmount: params.amount,
        totalInstallments: 1,
        currentInstallment: 1,
        installmentAmount: params.amount,
        remainingBalance: params.amount,
        purchaseDate: params.date,
        nextPaymentDate,
        category: params.category,
        subCategory: params.subCategory ?? null,
        sourceModule: "aura",
        sourceId: debt.id,
      },
    });

    await tx.debt.update({
      where: { id: debt.id },
      data: { currentBalance: { increment: params.amount } },
    });

    return createdInstallment;
  });

  await applyCreditInstallmentBudgetImpact({
    userId: params.userId,
    debtType: debt.type,
    category: installment.category,
    subCategory: installment.subCategory,
    installmentAmount: Number(installment.installmentAmount),
    nextPaymentDate: installment.nextPaymentDate,
  });
}

function findMentionedDebt(text: string, debts: DebtChoice[]) {
  const normalized = normalize(text);
  return debts.find((debt) => {
    const debtName = normalize(debt.name);
    return normalized.includes(debtName) || debtName.split(" ").some((part) => part.length >= 4 && normalized.includes(part));
  });
}

async function getBalanceSnapshot(userId: string) {
  const accounts = await getAccountChoices(userId);
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  return { totalBalance, currency: "COP", accounts };
}

async function getExpenseSnapshot(userId: string) {
  return getMovementSnapshot(userId, "expense", parseDateRange("este mes"));
}

async function getMovementSnapshot(userId: string, type: "expense" | "income" | "transfer", range: DateRange) {
  const whereType = type === "transfer" ? "transfer" : type;

  const transactions = await db.transaction.findMany({
    where: { userId, type: whereType, date: { gte: range.start, lt: range.end } },
    orderBy: { date: "desc" },
    select: { type: true, amount: true, category: true, description: true, date: true },
  });

  const total = transactions.reduce((sum, tx) => sum + toNumber(tx.amount), 0);
  const byCategory = transactions.reduce<Record<string, number>>((acc, tx) => {
    const key = tx.category || "Sin categoría";
    acc[key] = (acc[key] || 0) + toNumber(tx.amount);
    return acc;
  }, {});

  return { total, count: transactions.length, byCategory, transactions, range };
}

async function getPendingRecurring(userId: string): Promise<PendingRecurring[]> {
  return db.recurringPayment
    .findMany({
      where: { userId, status: "pending" },
      orderBy: { scheduledDate: "asc" },
      take: 10,
      select: {
        id: true,
        description: true,
        amount: true,
        actualAmount: true,
        type: true,
        scheduledDate: true,
        accountId: true,
        subAccountId: true,
        category: true,
        subCategory: true,
      },
    })
    .then((items) =>
      items.map((item) => ({
        ...item,
        amount: toNumber(item.actualAmount ?? item.amount),
      }))
    );
}

async function getPlannerSnapshot(userId: string) {
  const recurring = await getPendingRecurring(userId);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 7);

  const appointments = await db.medicalAppointment.findMany({
    where: { userId, status: "scheduled", date: { lte: horizon } },
    orderBy: { date: "asc" },
    take: 8,
    select: { specialty: true, doctorName: true, date: true, location: true },
  });

  return {
    recurring: recurring.slice(0, 8),
    appointments,
  };
}

async function getSavingsSnapshot(userId: string) {
  const goals = await db.savingsGoal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      sourceAccount: { select: { name: true } },
      destinationAccount: { select: { name: true } },
      cdts: { select: { amount: true, bank: true, status: true } },
    },
  });

  return goals.map((goal) => ({
    name: goal.name,
    status: goal.status,
    targetAmount: toNumber(goal.targetAmount),
    currentAmount: toNumber(goal.currentAmount),
    progress: toNumber(goal.targetAmount) > 0 ? Math.round((toNumber(goal.currentAmount) / toNumber(goal.targetAmount)) * 100) : 0,
    deadline: goal.deadline,
    sourceAccount: goal.sourceAccount?.name,
    destinationAccount: goal.destinationAccount?.name,
    cdtsTotal: goal.cdts.reduce((sum, cdt) => sum + toNumber(cdt.amount), 0),
  }));
}

async function getCdtSnapshot(userId: string) {
  const cdts = await db.cDT.findMany({
    where: { userId },
    orderBy: { endDate: "asc" },
    include: {
      goal: { select: { name: true } },
      account: { select: { name: true } },
    },
  });

  return cdts.map((cdt) => ({
    bank: cdt.bank,
    amount: toNumber(cdt.amount),
    effectiveRate: toNumber(cdt.effectiveRate),
    interestEarned: toNumber(cdt.interestEarned),
    status: cdt.status,
    endDate: cdt.endDate,
    goal: cdt.goal?.name,
    account: cdt.account?.name,
  }));
}

async function getDebtSnapshot(userId: string) {
  const debts = await db.debt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      installments: {
        where: { isPaid: false },
        orderBy: { nextPaymentDate: "asc" },
        take: 3,
      },
    },
  });

  return debts.map((debt) => ({
    name: debt.bank ? `${debt.name} ${debt.bank}` : debt.name,
    type: debt.type,
    currentBalance: toNumber(debt.currentBalance),
    totalAmount: toNumber(debt.totalAmount),
    paymentDate: debt.paymentDate,
    installmentsPending: debt.installments.length,
  }));
}

async function getBudgetSnapshot(userId: string) {
  const budgets = await db.budget.findMany({
    where: { userId },
    orderBy: [{ type: "asc" }, { category: "asc" }],
  });

  return budgets.map((budget) => {
    const amount = toNumber(budget.amount);
    const spent = toNumber(budget.spent);
    return {
      category: budget.subCategory ? `${budget.category} / ${budget.subCategory}` : budget.category,
      type: budget.type,
      amount,
      spent,
      remaining: amount - spent,
      usage: amount > 0 ? Math.round((spent / amount) * 100) : 0,
    };
  });
}

async function getVehicleSnapshot(userId: string) {
  const vehicles = await db.vehicle.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      fuelLogs: { orderBy: { date: "desc" }, take: 1 },
      maintenanceRecords: {
        where: { reminderEnabled: true },
        orderBy: [{ nextDueDate: "asc" }, { nextDueKm: "asc" }],
        take: 3,
      },
      documents: {
        where: { reminderEnabled: true },
        orderBy: { expiryDate: "asc" },
        take: 3,
      },
      reminders: {
        where: { isActive: true },
        orderBy: [{ dueDate: "asc" }, { dueKm: "asc" }],
        take: 3,
      },
    },
  });

  return vehicles.map((vehicle) => ({
    name: vehicle.name,
    plate: vehicle.plate,
    currentKm: vehicle.currentKm,
    lastFuelAmount: vehicle.fuelLogs[0] ? toNumber(vehicle.fuelLogs[0].amount) : null,
    documents: vehicle.documents.map((doc) => ({
      type: doc.type,
      expiryDate: doc.expiryDate,
      daysUntil: daysUntil(doc.expiryDate),
    })),
    maintenance: vehicle.maintenanceRecords.map((record) => ({
      type: record.type,
      description: record.description,
      nextDueKm: record.nextDueKm,
      nextDueDate: record.nextDueDate,
    })),
    reminders: vehicle.reminders.map((reminder) => ({
      title: reminder.title,
      dueDate: reminder.dueDate,
      dueKm: reminder.dueKm,
    })),
  }));
}

async function getHealthSnapshot(userId: string) {
  const horizon = addDays(startOfToday(), 30);
  const [appointments, medications] = await Promise.all([
    db.medicalAppointment.findMany({
      where: { userId, status: "scheduled", date: { lte: horizon } },
      orderBy: { date: "asc" },
      take: 8,
    }),
    db.medication.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return { appointments, medications };
}

async function getPantrySnapshot(userId: string) {
  const today = startOfToday();
  const soon = addDays(today, 14);
  const items = await db.pantryItem.findMany({
    where: { userId },
    orderBy: [{ expirationDate: "asc" }, { name: "asc" }],
    take: 30,
  });

  const expiring = items.filter((item) => item.expirationDate && item.expirationDate <= soon);
  const lowStock = items.filter((item) => item.minStock != null && item.quantity <= item.minStock);
  return { totalItems: items.length, expiring, lowStock };
}

async function registerFuelFromAura(userId: string, text: string, amount: number, options: { commit?: boolean } = {}): Promise<AuraToolResult> {
  const vehicles = await db.vehicle.findMany({
    where: { userId },
    include: { paymentDefault: true },
    orderBy: { createdAt: "desc" },
  });
  const normalized = normalize(text);
  const vehicle = vehicles.find((item) => {
    const values = [item.name, item.plate, item.brand, item.model].filter(Boolean).map((value) => normalize(String(value)));
    return values.some((value) => value.length >= 3 && normalized.includes(value));
  }) || (vehicles.length === 1 ? vehicles[0] : null);

  const pricePerGallon = parsePricePerGallon(text);
  const km = parseKm(text);
  const debts = await getDebtChoices(userId);
  const debt = findMentionedDebt(text, debts);
  const accounts = await getAccountChoices(userId);
  const account = findMentionedAccount(text, accounts);

  const missing: string[] = [];
  if (!vehicle) missing.push("vehículo");
  if (!pricePerGallon) missing.push("precio por galón");
  if (!km && vehicle) missing.push(`kilometraje actual de ${vehicle.name}`);
  if (!debt && !account && !vehicle?.paymentDefault) missing.push("método de pago o cuenta");

  if (missing.length > 0) {
    const vehiclesText = vehicles.length > 0 ? `\nVehículos: ${vehicles.map((item) => item.name).join(", ")}` : "";
    const debtsText = debts.length > 0 ? `\nTarjetas/deudas: ${debts.map((item) => item.name).join(", ")}` : "";
    const accountsText = accounts.length > 0 ? `\nCuentas: ${accounts.slice(0, 5).map((item) => item.name).join(", ")}` : "";
    return {
      text: `Puedo registrar ese tanqueo, pero me falta: ${missing.join(", ")}. Responde con esos datos y preparo el resumen antes de guardar.${vehiclesText}${debtsText}${accountsText}`,
    };
  }

  const paymentDefault = vehicle!.paymentDefault;
  const paymentType = debt || paymentDefault?.paymentType === "credit_card" ? "credit_card" : "account";
  const accountId = account?.kind === "account" ? account.id : paymentDefault?.accountId ?? null;
  const subAccountId = account?.kind === "subAccount" ? account.id : paymentDefault?.subAccountId ?? null;
  const debtId = debt?.id ?? paymentDefault?.debtId ?? null;
  const gallons = Math.round((amount / pricePerGallon!) * 100) / 100;
  const recordDate = parseRecordDate(text);
  const paidWith = debt ? `con ${debt.name}` : account ? `desde ${account.name}` : "con el método predeterminado";

  if (!options.commit) {
    return {
      text: [
        "Resumen para confirmar el tanqueo:",
        `- Vehículo: ${vehicle!.name}`,
        `- Valor: ${COP.format(amount)}`,
        `- Galones: ${gallons}`,
        `- Precio por galón: ${COP.format(pricePerGallon!)}`,
        `- Kilometraje: ${km!.toLocaleString("es-CO")} km`,
        `- Método: ${paidWith}`,
        "",
        "Responde CONFIRMAR para guardarlo o CANCELAR para descartarlo.",
      ].join("\n"),
      action: {
        type: "proposal",
        tool: "registrar_tanqueo",
        requiresConfirmation: true,
        payload: {
          vehicleId: vehicle!.id,
          amount,
          gallons,
          pricePerGallon,
          km,
          accountId,
          subAccountId,
          debtId,
          date: recordDate.toISOString(),
        },
      },
    };
  }

  const fuelLog = await db.fuelLog.create({
    data: {
      vehicleId: vehicle!.id,
      date: recordDate,
      km: km!,
      amount,
      pricePerGallon: pricePerGallon!,
      gallons,
      isFullTank: true,
      accountId,
      subAccountId,
      debtId,
      installmentCount: paymentDefault?.installmentCount ?? null,
      notes: "Registrado desde Aura",
    },
  });

  if (km! > vehicle!.currentKm) {
    await db.vehicle.update({ where: { id: vehicle!.id }, data: { currentKm: km! } });
  }

  await createFinanceEntry({
    userId,
    amount,
    description: getTransportDescription("fuel", vehicle!.name),
    category: "Transporte",
    subCategory: "Combustible",
    date: recordDate,
    sourceModule: "transport",
    sourceId: fuelLog.id,
    paymentType,
    accountId,
    subAccountId,
    debtId,
    installmentCount: paymentDefault?.installmentCount ?? null,
    notes: `Registrado desde Aura. ${gallons} gal a ${COP.format(pricePerGallon!)}/gal`,
    vehicleName: vehicle!.name,
  });

  return {
    text: `Listo, registré el tanqueo de ${vehicle!.name}: ${COP.format(amount)}, ${gallons} galones, km ${km!.toLocaleString("es-CO")}, ${paidWith}.`,
    action: {
      type: "executed",
      tool: "registrar_tanqueo",
      payload: { fuelLogId: fuelLog.id, vehicleId: vehicle!.id, amount },
    },
  };
}

async function createTransactionFromAura(userId: string, text: string, options: { commit?: boolean } = {}): Promise<AuraToolResult> {
  const amount = parseAmount(text);
  if (!amount) {
    return { text: "Claro. ¿Por cuánto valor fue el movimiento? Puedes responder algo como: “25 mil”." };
  }

  if (isFuelIntent(text)) {
    return registerFuelFromAura(userId, text, amount, options);
  }

  const accounts = await getAccountChoices(userId);
  const account = findMentionedAccount(text, accounts);
  const debts = await getDebtChoices(userId);
  const debt = findMentionedDebt(text, debts);
  if (!account) {
    if (debt) {
      const type = inferTransactionType(text);
      if (type === "income") return { text: "Ese movimiento parece ingreso, pero mencionaste una tarjeta/deuda. ¿Lo registro en una cuenta o es un abono?" };
      const { category, subCategory } = await getSmartCategory(text, userId, type);
      const date = parseRecordDate(text);
      if (!options.commit) {
        const categoryDisplay = subCategory ? `${category} / ${subCategory}` : category;
        return {
          text: [
            "Resumen para confirmar la compra:",
            `- Tarjeta/deuda: ${debt.name}`,
            `- Valor: ${COP.format(amount)}`,
            `- Categoría: ${categoryDisplay}`,
            `- Fecha: ${formatDate(date)}`,
            "",
            "Responde CONFIRMAR para guardarla o CANCELAR para descartarla. O cambia la categoría con el botón ✏️ Categoría abajo.",
          ].join("\n"),
          action: {
            type: "proposal",
            tool: "registrar_transaccion",
            requiresConfirmation: true,
            payload: { debtId: debt.id, amount, category, subCategory, date: date.toISOString() },
          },
        };
      }
      await createCreditCardPurchaseFromAura({
        userId,
        debtId: debt.id,
        amount,
        description: transactionDescription(text, category),
        category,
        subCategory,
        date,
      });
      return {
        text: `Listo, lo guardé como compra en ${debt.name}: ${COP.format(amount)}, categoría ${subCategory ? `${category} / ${subCategory}` : category}.`,
        action: { type: "executed", tool: "registrar_transaccion", payload: { debtId: debt.id, amount, category, subCategory } },
      };
    }
    const accountOptions = accounts.slice(0, 6).map((item) => `• ${item.name}: ${COP.format(item.balance)}`).join("\n");
    const debtOptions = debts.slice(0, 5).map((item) => `• ${item.name}: saldo ${COP.format(item.currentBalance)}`).join("\n");
    return {
      text: `Puedo guardarlo, pero me falta la cuenta o tarjeta. ¿Desde cuál lo registro?\n${accountOptions}${debtOptions ? `\n${debtOptions}` : ""}`,
      action: {
        type: "select_account" as const,
        choices: [
          ...accounts.slice(0, 6).map((a) => ({ name: a.name, id: a.id, kind: a.kind })),
          ...debts.slice(0, 5).map((d) => ({ name: d.name, id: d.id, kind: d.kind })),
        ],
      },
    };
  }

  const type = inferTransactionType(text);
  const { category, subCategory } = await getSmartCategory(text, userId, type);
  const description = transactionDescription(text, category);
  const balanceChange = type === "income" ? amount : -amount;

  if (!options.commit) {
    const categoryDisplay = subCategory ? `${category} / ${subCategory}` : category;
    return {
      text: [
        `Resumen para confirmar el ${type === "income" ? "ingreso" : "gasto"}:`,
        `- Cuenta: ${account.name}`,
        `- Valor: ${COP.format(amount)}`,
        `- Categoría: ${categoryDisplay}`,
        `- Fecha: ${formatDate(parseRecordDate(text))}`,
        "",
        "Responde CONFIRMAR para guardarlo o CANCELAR para descartarlo. O cambia la categoría con el botón ✏️ Categoría abajo.",
      ].join("\n"),
      action: {
        type: "proposal",
        tool: "registrar_transaccion",
        requiresConfirmation: true,
        payload: {
          accountId: account.kind === "account" ? account.id : account.parentAccountId,
          subAccountId: account.kind === "subAccount" ? account.id : null,
          type,
          amount,
          category,
          subCategory,
          date: parseRecordDate(text).toISOString(),
        },
      },
    };
  }

  const transaction = await db.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        type,
        amount,
        description,
        category,
        subCategory,
        date: parseRecordDate(text),
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

    const budget = await tx.budget.findFirst({ where: { userId, type, category, subCategory: subCategory ?? null } });
    if (budget) {
      await tx.budget.update({ where: { id: budget.id }, data: { spent: { increment: amount } } });
    }

    return created;
  });

  const verb = type === "income" ? "ingreso" : "gasto";
  const categoryDisplay = subCategory ? `${category} / ${subCategory}` : category;
  return {
    text: `Listo, lo guardé como ${verb}: ${COP.format(amount)} en ${account.name}, categoría ${categoryDisplay}. ID: ${transaction.id}.`,
    action: { type: "executed", tool: "registrar_transaccion", payload: { transactionId: transaction.id, amount, type, category, subCategory } },
  };
}

function findRecurringMatch(text: string, items: PendingRecurring[]) {
  const normalized = normalize(text);
  return items.find((item) => {
    const description = normalize(item.description);
    return description.length > 3 && normalized.includes(description);
  }) || (items.length === 1 ? items[0] : null);
}

async function confirmRecurringFromAura(userId: string, text: string) {
  const items = await getPendingRecurring(userId);
  if (items.length === 0) return "No encuentro pagos o ingresos recurrentes pendientes para confirmar.";

  const match = findRecurringMatch(text, items);
  if (!match) {
    const options = items
      .slice(0, 6)
      .map((item) => `• ${item.description}: ${COP.format(item.amount)} (${formatDate(item.scheduledDate)})`)
      .join("\n");
    return `¿Cuál recurrente quieres confirmar?\n${options}`;
  }

  const amount = parseAmount(text) ?? match.amount;
  const type = match.type === "income" ? "income" : "expense";
  const balanceChange = type === "income" ? amount : -amount;

  await db.$transaction(async (tx) => {
    await tx.recurringPayment.update({
      where: { id: match.id },
      data: { status: "confirmed", actualAmount: amount, confirmedDate: new Date() },
    });

    await tx.transaction.create({
      data: {
        userId,
        type,
        amount,
        description: match.description,
        category: match.category,
        subCategory: match.subCategory,
        date: new Date(),
        accountId: match.accountId,
        subAccountId: match.subAccountId,
        sourceModule: "recurring",
        sourceId: match.id,
        isRecurring: true,
        notes: "Confirmado desde Aura",
      },
    });

    if (match.subAccountId) {
      await tx.subAccount.update({ where: { id: match.subAccountId }, data: { balance: { increment: balanceChange } } });
    } else if (match.accountId) {
      await tx.account.update({ where: { id: match.accountId }, data: { balance: { increment: balanceChange } } });
    }
  });

  return `Confirmado: ${match.description} por ${COP.format(amount)}. Ya quedó registrado en Quid.`;
}

async function answerWithQuidData(userId: string, action: AuraAction, text: string) {
  if (action === "consultar_saldos") {
    const snapshot = await getBalanceSnapshot(userId);
    const requested = findMentionedAccount(text, snapshot.accounts);
    if (requested) return `En ${requested.name} tienes ${COP.format(requested.balance)}.`;
    const topAccounts = snapshot.accounts
      .slice(0, 6)
      .map((account) => `• ${account.name}: ${COP.format(account.balance)}`)
      .join("\n");
    return `Tu balance total visible es ${COP.format(snapshot.totalBalance)}.\n${topAccounts}`;
  }

  if (action === "consultar_gastos") {
    const snapshot = await getMovementSnapshot(userId, "expense", parseDateRange(text));
    const categories = Object.entries(snapshot.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => `• ${category}: ${COP.format(amount)}`)
      .join("\n");
    return `En ${formatDateRange(snapshot.range)} llevas ${COP.format(snapshot.total)} en gastos (${snapshot.count} movimiento${snapshot.count === 1 ? "" : "s"}).${categories ? `\n${categories}` : ""}`;
  }

  if (action === "consultar_ingresos") {
    const snapshot = await getMovementSnapshot(userId, "income", parseDateRange(text));
    const categories = Object.entries(snapshot.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => `• ${category}: ${COP.format(amount)}`)
      .join("\n");
    return `En ${formatDateRange(snapshot.range)} recibiste ${COP.format(snapshot.total)} en ingresos (${snapshot.count} movimiento${snapshot.count === 1 ? "" : "s"}).${categories ? `\n${categories}` : ""}`;
  }

  if (action === "consultar_transferencias") {
    const snapshot = await getMovementSnapshot(userId, "transfer", parseDateRange(text));
    return `En ${formatDateRange(snapshot.range)} registraste ${COP.format(snapshot.total)} en transferencias (${snapshot.count} movimiento${snapshot.count === 1 ? "" : "s"}).`;
  }

  if (action === "consultar_flujo") {
    const range = parseDateRange(text);
    const [income, expenses] = await Promise.all([
      getMovementSnapshot(userId, "income", range),
      getMovementSnapshot(userId, "expense", range),
    ]);
    const net = income.total - expenses.total;
    return `En ${formatDateRange(range)} tu flujo va así:\n• Ingresos: ${COP.format(income.total)} (${income.count})\n• Gastos: ${COP.format(expenses.total)} (${expenses.count})\n• Neto: ${COP.format(net)}${net >= 0 ? " a favor" : " por debajo"}.`;
  }

  if (action === "consultar_recurrentes") {
    const recurring = await getPendingRecurring(userId);
    if (recurring.length === 0) return "No tienes recurrentes pendientes en este momento.";
    return recurring
      .slice(0, 8)
      .map((item) => {
        const delta = daysUntil(item.scheduledDate);
        const when = delta <= 0 ? "hoy o vencido" : `en ${delta} día${delta === 1 ? "" : "s"}`;
        return `• ${item.description}: ${COP.format(item.amount)} (${when})`;
      })
      .join("\n");
  }

  if (action === "consultar_planner") {
    const planner = await getPlannerSnapshot(userId);
    const rows = [
      ...planner.recurring.map((item) => `• ${item.description}: ${COP.format(item.amount)} - ${formatDate(item.scheduledDate)}`),
      ...planner.appointments.map((item) => `• ${item.specialty || "Cita médica"}${item.doctorName ? ` con ${item.doctorName}` : ""} - ${formatDate(item.date)}`),
    ];
    return rows.length > 0 ? `Esto aparece en tu radar cercano:\n${rows.join("\n")}` : "Tu radar cercano está tranquilo: no veo pagos, ingresos o citas próximas.";
  }

  if (action === "consultar_metas") {
    const goals = await getSavingsSnapshot(userId);
    if (goals.length === 0) return "No tienes metas de ahorro registradas todavía.";
    return goals
      .slice(0, 8)
      .map((goal) => `• ${goal.name}: ${COP.format(goal.currentAmount)} de ${COP.format(goal.targetAmount)} (${goal.progress}%)${goal.deadline ? `, vence ${formatDate(goal.deadline)}` : ""}`)
      .join("\n");
  }

  if (action === "consultar_cdts") {
    const cdts = await getCdtSnapshot(userId);
    if (cdts.length === 0) return "No tienes CDTs registrados todavía.";
    const total = cdts.reduce((sum, cdt) => sum + cdt.amount, 0);
    const rows = cdts
      .slice(0, 8)
      .map((cdt) => `• ${cdt.bank}: ${COP.format(cdt.amount)} al ${cdt.effectiveRate}% EA, vence ${formatDate(cdt.endDate)} (${cdt.status})`)
      .join("\n");
    return `Tienes ${COP.format(total)} en CDTs.\n${rows}`;
  }

  if (action === "consultar_deudas") {
    const debts = await getDebtSnapshot(userId);
    if (debts.length === 0) return "No tienes deudas o tarjetas registradas todavía.";
    const total = debts.reduce((sum, debt) => sum + debt.currentBalance, 0);
    const rows = debts
      .slice(0, 8)
      .map((debt) => `• ${debt.name}: saldo ${COP.format(debt.currentBalance)}${debt.paymentDate ? `, pago día ${debt.paymentDate}` : ""}`)
      .join("\n");
    return `Tu saldo total en deudas/tarjetas es ${COP.format(total)}.\n${rows}`;
  }

  if (action === "consultar_presupuestos") {
    const budgets = await getBudgetSnapshot(userId);
    if (budgets.length === 0) return "No tienes presupuestos configurados todavía.";
    const rows = budgets
      .slice(0, 10)
      .map((budget) => `• ${budget.category}: ${COP.format(budget.spent)} de ${COP.format(budget.amount)} (${budget.usage}%)`)
      .join("\n");
    return `Así van tus presupuestos:\n${rows}`;
  }

  if (action === "consultar_vehiculos") {
    const vehicles = await getVehicleSnapshot(userId);
    if (vehicles.length === 0) return "No tienes vehículos registrados todavía.";
    return vehicles
      .slice(0, 5)
      .map((vehicle) => {
        const docs = vehicle.documents.length > 0
          ? ` Documentos: ${vehicle.documents.map((doc) => `${doc.type.toUpperCase()} ${doc.daysUntil <= 0 ? "vencido/hoy" : `en ${doc.daysUntil}d`}`).join(", ")}.`
          : "";
        const reminders = vehicle.reminders.length > 0
          ? ` Recordatorios: ${vehicle.reminders.map((reminder) => reminder.title).join(", ")}.`
          : "";
        return `• ${vehicle.name}${vehicle.plate ? ` (${vehicle.plate})` : ""}: ${Math.round(vehicle.currentKm).toLocaleString("es-CO")} km.${docs}${reminders}`;
      })
      .join("\n");
  }

  if (action === "consultar_salud") {
    const health = await getHealthSnapshot(userId);
    const rows = [
      ...health.appointments.slice(0, 5).map((item) => `• Cita: ${item.specialty || "general"}${item.doctorName ? ` con ${item.doctorName}` : ""} - ${formatDate(item.date)}`),
      ...health.medications.slice(0, 5).map((item) => `• Medicamento: ${item.name} (${item.dosage})`),
    ];
    return rows.length > 0 ? `Esto tengo registrado en salud:\n${rows.join("\n")}` : "No veo citas próximas ni medicamentos activos registrados.";
  }

  if (action === "consultar_despensa") {
    const pantry = await getPantrySnapshot(userId);
    const expiring = pantry.expiring.slice(0, 5).map((item) => `• ${item.name}: vence ${item.expirationDate ? formatDate(item.expirationDate) : "sin fecha"}`);
    const lowStock = pantry.lowStock.slice(0, 5).map((item) => `• ${item.name}: quedan ${item.quantity} ${item.unit}`);
    const rows = [...expiring, ...lowStock];
    if (rows.length === 0) return `Tienes ${pantry.totalItems} producto(s) en despensa y no veo vencimientos cercanos ni bajo stock crítico.`;
    return `Tienes ${pantry.totalItems} producto(s) en despensa. Atención:\n${rows.join("\n")}`;
  }

  return null;
}

async function askOllama(messages: CoreMessage[], context: unknown) {
  const systemPrompt = `Eres Aura, la IA integrada de Quid. Responde en español, natural y claro.
Tienes una visual resumida de la app cuando aparece "Contexto interno de Quid".
No inventes datos financieros. Si falta información para guardar algo, pide solo lo que falta.
No menciones herramientas internas ni detalles técnicos.`;

  const ollamaMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "system", content: `Contexto interno de Quid: ${JSON.stringify(context)}` },
  ];

  for (const message of messages) {
    if (message.role === "user" || message.role === "assistant" || message.role === "system") {
      ollamaMessages.push({ role: message.role, content: message.content });
    }
  }

  const response = await fetch(`${OLLAMA_API_BASE.replace(/\/$/, "")}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ model: AURA_MODEL, stream: false, keep_alive: -1, messages: ollamaMessages }),
  });

  if (!response.ok) {
    throw new Error(`Ollama respondió con estado ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as {
    message?: { content?: string };
    eval_count?: number;
    prompt_eval_count?: number;
  };

  return {
    text: result.message?.content?.trim() || "No pude generar una respuesta clara.",
    usage: {
      completionTokens: result.eval_count,
      promptTokens: result.prompt_eval_count,
    },
  };
}

export async function askAura(userId: string, messages: CoreMessage[]) {
  const lastUserMsg = lastUserText(messages);
  const hasProposal = hasRecentAuraProposal(messages);
  const isCancel = isCancellationText(lastUserMsg) && hasProposal;
  const isConfirm = isConfirmationText(lastUserMsg) && hasProposal;

  try {
    // 1. Manejar Cancelación
    if (isCancel) {
      return {
        text: "Listo, no guardé nada. Dejé esa propuesta descartada.",
        action: "chat",
        responseMessages: [...messages, { role: "assistant" as const, content: "Listo, no guardé nada. Dejé esa propuesta descartada." }],
      };
    }

    // 2. Manejar Interceptación de Propuestas Activas (Confirmar o Corregir)
    if (hasProposal) {
      const lastAssistantProposalMsg = [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && /resumen para confirmar|responde confirmar/i.test(message.content));

      if (lastAssistantProposalMsg) {
        const isFuel = lastAssistantProposalMsg.content.includes("confirmar el tanqueo");
        const isTx =
          lastAssistantProposalMsg.content.includes("confirmar el ingreso") ||
          lastAssistantProposalMsg.content.includes("confirmar el gasto") ||
          lastAssistantProposalMsg.content.includes("confirmar la compra");

        if (isFuel || isTx) {
          const accounts = await getAccountChoices(userId);
          const debts = await getDebtChoices(userId);

          // A. Ejecutar Confirmación
          if (isConfirm) {
            if (isFuel) {
              const vehicles = await db.vehicle.findMany({ where: { userId }, include: { paymentDefault: true } });
              const parsed = parsePreviousFuelProposal(lastAssistantProposalMsg.content);
              const result = await executeFuelProposal(userId, parsed, vehicles, accounts, debts);
              return {
                text: result.text,
                action: result.action,
                responseMessages: [...messages, { role: "assistant" as const, content: result.text }],
              };
            } else {
              const parsed = parsePreviousProposal(lastAssistantProposalMsg.content);
              const result = await executeTransactionProposal(userId, parsed, accounts, debts);
              return {
                text: result.text,
                action: result.action,
                responseMessages: [...messages, { role: "assistant" as const, content: result.text }],
              };
            }
          }

          // B. Procesar Corrección / Override en Caliente
          if (isFuel) {
            const vehicles = await db.vehicle.findMany({ where: { userId }, include: { paymentDefault: true } });
            const parsed = parsePreviousFuelProposal(lastAssistantProposalMsg.content);
            const result = await updateFuelProposal(userId, parsed, lastUserMsg, vehicles, accounts, debts);
            return {
              text: result.text,
              action: result.action,
              responseMessages: [...messages, { role: "assistant" as const, content: result.text }],
            };
          } else {
            const parsed = parsePreviousProposal(lastAssistantProposalMsg.content);
            const result = await updateTransactionProposal(userId, parsed, lastUserMsg, accounts, debts);
            return {
              text: result.text,
              action: result.action,
              responseMessages: [...messages, { role: "assistant" as const, content: result.text }],
            };
          }
        }
      }
    }

    // 3. Flujo Normal sin Propuestas Activas
    const text = resolveActionText(messages);
    const action = inferAction(text);
    let directAnswer: AuraToolResult | null = null;

    if (action === "registrar_transaccion") {
      directAnswer = await createTransactionFromAura(userId, text, { commit: false });
    } else if (action === "confirmar_recurrente") {
      directAnswer = { text: await confirmRecurringFromAura(userId, text), action: { type: "executed", tool: "confirmar_recurrente" } };
    } else {
      const answer = await answerWithQuidData(userId, action, text);
      directAnswer = answer ? { text: answer } : null;
    }

    if (directAnswer) {
      return {
        text: directAnswer.text,
        action: directAnswer.action ?? action,
        responseMessages: [...messages, { role: "assistant" as const, content: directAnswer.text }],
      };
    }

    const conversationFallback = getBasicConversationFallback(lastUserMsg);
    if (conversationFallback) {
      return {
        text: conversationFallback,
        action,
        responseMessages: [...messages, { role: "assistant" as const, content: conversationFallback }],
      };
    }

    const [balance, expenses, planner] = await Promise.all([
      getBalanceSnapshot(userId),
      getExpenseSnapshot(userId),
      getPlannerSnapshot(userId),
    ]);
    const llm = await askOllama(messages, { balance, expenses, planner });

    return {
      ...llm,
      action,
      responseMessages: [...messages, { role: "assistant" as const, content: llm.text }],
    };
  } catch (error) {
    console.error("Error en Aura Engine:", error);
    const text =
      error instanceof Error && (error.message.toLowerCase().includes("fetch") || error.name === "TimeoutError")
        ? "No pude contactar a Ollama. Verifica que Ollama esté abierto y que el modelo de Aura esté disponible."
        : "Tuve un problema procesando eso. Intenta de nuevo o revisa si Quid y Ollama están activos.";
    return { text, action: "chat" as const, error: error instanceof Error ? error.message : String(error) };
  }
}
