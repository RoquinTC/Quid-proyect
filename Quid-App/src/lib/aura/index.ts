import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { requestAiCompletion } from "@/lib/ai/llm";
import {
  createPendingAction,
  getLatestPendingAction,
  getPendingActionForUser,
  markActionCancelled,
  markActionConfirmed,
} from "@/lib/aura/pending-actions";
import { executeConfirmedTool } from "@/lib/aura/tools/execute-confirmed";
import { createFinanceEntry, getTransportDescription } from "@/lib/transport-finance";
import { applyCreditInstallmentBudgetImpact } from "@/lib/budget-impact";
import { getCreditCardNextPaymentDate } from "@/lib/credit-card-cycle";
import { calculateFuelLevel } from "@/lib/fuel-level";
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
import {
  addDays,
  dateOnly,
  daysInMonth,
  daysUntil,
  formatDate,
  formatDateRange,
  monthsUntil,
  normalize,
  parseDateRange,
  startOfToday,
  startOfWeek,
  type DateRange,
} from "@/lib/aura/utils";
import {
  AccountChoice,
  PendingRecurring,
  DebtChoice,
  getAccountChoices,
  findMentionedAccount,
  getDebtChoices,
  getBalanceSnapshot,
  getExpenseSnapshot,
  getMovementSnapshot,
  getPendingRecurring,
  getPlannerSnapshot,
  getSavingsSnapshot,
  getCdtSnapshot,
  getDebtSnapshot,
  getBudgetSnapshot,
  getFinancialRadar,
  getVehicleSnapshot,
  getTransportRadar,
  getHealthSnapshot,
  getPantrySnapshot,
} from "@/lib/aura/snapshots";

export type CoreMessage = { role: "user" | "assistant" | "system" | "data"; content: string };

/**
 * Modelo de Aura. Se mantiene exportado por compatibilidad con quien lo
 * consuma; el valor real lo resuelve `getAiModel()` en `@/lib/ai/llm`.
 */
export const AURA_MODEL = process.env.AURA_MODEL || "hermes3:8b";
const ODYSSEUS_API_URL = process.env.ODYSSEUS_API_URL || "";
const ODYSSEUS_API_TOKEN = process.env.ODYSSEUS_API_TOKEN || "";
const ODYSSEUS_SESSION_ID = process.env.ODYSSEUS_SESSION_ID || "";
const ODYSSEUS_ENABLED = (process.env.ODYSSEUS_ENABLED || "false").toLowerCase() === "true";
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
  | "consultar_radar_financiero"
  | "consultar_radar_transporte"
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






function parseLocaleNumber(rawValue: string) {
  const compact = rawValue.replace(/\s+/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const decimalSeparator =
    lastComma > lastDot ? "," : lastDot > lastComma ? "." : null;

  if (decimalSeparator) {
    const parts = compact.split(decimalSeparator);
    const decimalPart = parts.at(-1) || "";
    const integerPart = parts.slice(0, -1).join(decimalSeparator);

    if (decimalPart.length === 3 && /^\d+$/.test(integerPart.replace(/[.,]/g, ""))) {
      const value = Number(compact.replace(/[.,]/g, ""));
      return Number.isFinite(value) ? value : null;
    }

    const normalized = `${integerPart.replace(/[.,]/g, "")}.${decimalPart}`;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  const value = Number(compact.replace(/[^\d]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function readNumberAfter(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  return parseLocaleNumber(match[1]);
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

/**
 * ¿El usuario quiere descartar la propuesta?
 *
 * CUIDADO CON "no": en español, un mensaje que EMPIEZA con "no" casi nunca es un
 * "descarta esto" seco. Lo habitual es que sea una CORRECCIÓN:
 *
 *   "no, fueron 2222"          → quiere cambiar el monto
 *   "no, mejor desde Bold"     → quiere cambiar la cuenta
 *   "no"                       → esto sí es descartar
 *
 * La versión anterior matcheaba cualquier mensaje que empezara con "no", así que
 * tratar una corrección como cancelación: se descartaba la propuesta y el usuario
 * perdía lo que estaba registrando. Ahora, si el mensaje trae un dato nuevo (un
 * número, o una mención de cuenta/categoría), NO se considera cancelación y sigue
 * el camino de corrección.
 */
function isCancellationText(text: string) {
  const normalized = normalize(text);

  const startsWithCancelWord =
    /^(no|cancelar|cancela|descartar|descartalo|descártalo|olvidalo|olvídalo)\b/.test(normalized);
  if (!startsWithCancelWord) return false;

  // Un mensaje que sólo descarta no aporta datos nuevos.
  const hasNumber = /\d/.test(normalized);
  const mentionsTarget =
    /\b(cuenta|bolsillo|tarjeta|deuda|banco|efectivo|categoria|categoría|desde|con)\b/.test(normalized);

  return !hasNumber && !mentionsTarget;
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
  if (/\b(gaste|compre|pague|registre|registra|anota|anote|tanquee|tanque|tanquear|tanqueado|recargue|recargar|recarga)\b/.test(normalized)) {
    if (/\b(recurrente|pendiente|programado|programada)\b/.test(normalized)) return "confirmar_recurrente";
    return "registrar_transaccion";
  }
  if (/\b(confirma|confirmar|marcar|marca)\b/.test(normalized) && /\b(pago|ingreso|recurrente|pendiente)\b/.test(normalized)) {
    return "confirmar_recurrente";
  }
  if (/\b(cuanto tengo|saldo|saldos|balance|dinero disponible|plata)\b/.test(normalized)) return "consultar_saldos";
  if (/\b(radar transporte|radar de transporte|transporte al dia|transporte al día|como esta mi moto|cómo está mi moto|como esta el carro|cómo está el carro|autonomia|autonomía|combustible restante)\b/.test(normalized)) return "consultar_radar_transporte";
  if (/\b(radar financiero|radar|como voy|cómo voy|diagnostico|diagnóstico|analisis financiero|análisis financiero|revision financiera|revisión financiera|panorama financiero)\b/.test(normalized)) return "consultar_radar_financiero";
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





function parseRecordDate(text: string) {
  const normalized = normalize(text);
  const today = dateOnly(new Date());

  if (/\b(antes de ayer|antier|anteayer)\b/.test(normalized)) return addDays(today, -2);
  if (/\bayer\b/.test(normalized)) return addDays(today, -1);
  return today;
}

function parseAmount(text: string) {
  const normalized = normalize(text);
  const moneyMatch =
    text.match(/(?:\$|cop\s*)?\s*(\d[\d.,\s]*)\s*(mil|k|millones|mill[oó]n|pesos?)?/i) ||
    normalized.match(/(?:cop\s*)?\s*(\d[\d\s]*)\s*(mil|k|millones|millon|pesos?)?/i);
  if (!moneyMatch) return null;

  const rawNumber = moneyMatch[1];
  const suffix = normalize(moneyMatch[2] || "");
  let amount = parseLocaleNumber(rawNumber);
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  if ((suffix === "mil" || suffix === "k") && amount < 1000) amount *= 1000;
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
  return /\b(gasolina|tanqueo|tanquee|tanque|tanquear|tanqueado|recarga|recargue|combustible|galon|galones|galón)\b/.test(normalize(text));
}

function parseKm(text: string) {
  const normalized = normalize(text);
  const km =
    readNumberAfter(text, /(?:km|kilometraje|kil[oó]metros?|od[oó]metro)\s*(?:en|de|actual|est[aá]\s*en)?\s*([\d.,\s]+)/i) ??
    readNumberAfter(text, /([\d.,\s]+)\s*(?:km|kil[oó]metros?)\b/i) ??
    readNumberAfter(normalized, /(?:km|kilometraje|kilometros?|odometro)\s*(?:en|de|actual|esta en)?\s*([\d\s]+)/i) ??
    readNumberAfter(normalized, /([\d\s]+)\s*(?:km|kilometros?)\b/i);
  return Number.isFinite(km) ? km : null;
}

function parsePricePerGallon(text: string) {
  const normalized = normalize(text);
  const price =
    readNumberAfter(text, /(?:gal[oó]n|galones)\s*(?:costaba|cuesta|a|en|de|estaba\s*a)?\s*([\d.,\s]+)/i) ??
    readNumberAfter(text, /precio\s*(?:del|por)?\s*(?:gal[oó]n|galones)?\s*(?:es|era|a|de)?\s*([\d.,\s]+)/i) ??
    readNumberAfter(normalized, /(?:galon|galones)\s*(?:costaba|cuesta|a|en|de|estaba a)?\s*([\d\s]+)/i) ??
    readNumberAfter(normalized, /precio\s*(?:del|por)?\s*(?:galon|galones)?\s*(?:es|era|a|de)?\s*([\d\s]+)/i);
  return Number.isFinite(price) ? price : null;
}

function transactionDescription(text: string, category: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 80) return cleaned;
  return `${category} registrado por Aura`;
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
    select: { id: true, cutoffDate: true, paymentDate: true, type: true },
  });

  if (!debt) throw new Error("No encontré la tarjeta o deuda indicada.");

  const nextPaymentDate = getCreditCardNextPaymentDate({
    purchaseDate: params.date,
    cutoffDate: debt.cutoffDate,
    paymentDate: debt.paymentDate,
  });

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

















function getDefaultPaymentLabel(
  paymentDefault: { paymentType?: string | null; accountId?: string | null; subAccountId?: string | null; debtId?: string | null } | null | undefined,
  accounts: AccountChoice[],
  debts: DebtChoice[]
) {
  if (!paymentDefault) return "sin método de pago";

  if (paymentDefault.paymentType === "credit_card" && paymentDefault.debtId) {
    const debt = debts.find((item) => item.id === paymentDefault.debtId);
    return debt ? `con tarjeta ${debt.name}` : "con tarjeta predeterminada";
  }

  const account = accounts.find((item) => item.kind === "account" && item.id === paymentDefault.accountId);
  const subAccount = paymentDefault.subAccountId
    ? accounts.find((item) => item.kind === "subAccount" && item.id === paymentDefault.subAccountId)
    : null;

  if (account && subAccount) return `desde ${account.name} / ${subAccount.name}`;
  if (account) return `desde ${account.name}`;
  return "desde cuenta predeterminada";
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
  const paidWith = debt
    ? `con tarjeta ${debt.name}`
    : account
      ? `desde ${account.name}`
      : getDefaultPaymentLabel(paymentDefault, accounts, debts);

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
        `- Categoría: Transporte`,
        `- Subcategoría: Combustible`,
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
    return `Tienes ${COP.format(snapshot.availableBalance)} disponible${
      snapshot.apartado > 0
        ? ` (más ${COP.format(snapshot.apartado)} apartado, que no cuento)`
        : ""
    }.\n${topAccounts}`;
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

  if (action === "consultar_radar_financiero") {
    const radar = await getFinancialRadar(userId);
    return [
      "Radar financiero de Aura:",
      `• Disponible: ${COP.format(radar.balance.availableBalance)}${
        radar.balance.apartado > 0 ? ` (apartado ${COP.format(radar.balance.apartado)})` : ""
      }`,
      `• Este mes: ingresos ${COP.format(radar.income.total)}, gastos ${COP.format(radar.expenses.total)}.`,
      `• Si sigues igual, el gasto cerraría cerca de ${COP.format(radar.projectedExpenses)}.`,
      ...radar.alerts.map((alert) => `• ${alert}`),
      "",
      `Mi jugada sugerida: ${radar.move}`,
    ].join("\n");
  }

  if (action === "consultar_metas") {
    const goals = await getSavingsSnapshot(userId);
    if (goals.length === 0) return "No tienes metas de ahorro registradas todavía.";
    const rows = goals
      .slice(0, 5)
      .map((goal) => {
        const missing = Math.max(0, goal.targetAmount - goal.currentAmount);
        const monthly = goal.deadline && missing > 0 ? Math.ceil(missing / monthsUntil(goal.deadline)) : null;
        const advice = monthly
          ? ` Necesitas aprox. ${COP.format(monthly)}/mes.`
          : missing > 0
            ? ` Faltan ${COP.format(missing)}; ponle fecha para que pueda presionarte bien.`
            : " Meta completada: no la dejes dormida, decide si cierras o subes objetivo.";
        return `• ${goal.name}: ${goal.progress}% (${COP.format(goal.currentAmount)} de ${COP.format(goal.targetAmount)}).${advice}`;
      });
    return `Así veo tus ahorros, sin endulzarlo:\n${rows.join("\n")}`;
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
    const sortedDebts = [...debts].sort((a, b) => b.currentBalance - a.currentBalance);
    const rows = sortedDebts
      .slice(0, 8)
      .map((debt, index) => `• ${debt.name}: ${COP.format(debt.currentBalance)}${debt.paymentDate ? `, pago día ${debt.paymentDate}` : ""}${index === 0 ? " ← prioridad si vas a abonar extra" : ""}`)
      .join("\n");
    return `Tu saldo total en deudas/tarjetas es ${COP.format(total)}.\n${rows}\n\nMi lectura: ataca primero la más pesada si buscas bajar estrés mensual; si quieres motivación rápida, paga una pequeña completa y la sacamos del tablero.`;
  }

  if (action === "consultar_presupuestos") {
    const budgets = await getBudgetSnapshot(userId);
    if (budgets.length === 0) return "No tienes presupuestos configurados todavía.";
    const risky = budgets.filter((budget) => budget.type === "expense" && budget.amount > 0).sort((a, b) => b.usage - a.usage);
    const rows = risky
      .slice(0, 10)
      .map((budget) => {
        const tone = budget.usage >= 100 ? "pasado" : budget.usage >= 80 ? "en zona roja" : budget.usage >= 60 ? "vigílalo" : "tranquilo";
        return `• ${budget.category}: ${COP.format(budget.spent)} de ${COP.format(budget.amount)} (${budget.usage}%, ${tone})`;
      })
      .join("\n");
    const worst = risky[0];
    return `Así van tus presupuestos, ordenados por riesgo:\n${rows}${worst && worst.usage >= 80 ? `\n\nMi orden: pausa ${worst.category} hasta que entre más flujo o cambie el mes.` : ""}`;
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
        const fuel = vehicle.tankCapacity
          ? ` Combustible: ${vehicle.fuelLevel}% (${vehicle.estimatedRange} km aprox.${vehicle.daysUntilRefuel !== null ? `, tanqueo en ${vehicle.daysUntilRefuel}d` : ""}).`
          : "";
        const maintenance = vehicle.maintenance.length > 0
          ? ` Mantenimiento: ${vehicle.maintenance.slice(0, 2).map((item) => item.kmRemaining !== null ? `${item.description} ${item.kmRemaining <= 0 ? "pasado" : `en ${item.kmRemaining} km`}` : item.description).join(", ")}.`
          : "";
        const reminders = vehicle.reminders.length > 0
          ? ` Recordatorios: ${vehicle.reminders.map((reminder) => reminder.title).join(", ")}.`
          : "";
        return `• ${vehicle.name}${vehicle.plate ? ` (${vehicle.plate})` : ""}: ${Math.round(vehicle.currentKm).toLocaleString("es-CO")} km.${fuel}${docs}${maintenance}${reminders}`;
      })
      .join("\n");
  }

  if (action === "consultar_radar_transporte") {
    const radar = await getTransportRadar(userId);
    if (radar.vehicles.length === 0) return "No tienes vehículos registrados todavía. Registra uno y Aura puede vigilar combustible, documentos y mantenimiento.";
    const rows = radar.vehicles.slice(0, 4).map((vehicle) => {
      const docRisk = vehicle.documents.find((doc) => doc.daysUntil <= 30);
      const maintenanceRisk = vehicle.maintenance.find((item) => (item.kmRemaining !== null && item.kmRemaining <= 300) || (item.nextDueDate && daysUntil(item.nextDueDate) <= 14));
      return `• ${vehicle.name}${vehicle.plate ? ` (${vehicle.plate})` : ""}: ${Math.round(vehicle.currentKm).toLocaleString("es-CO")} km, combustible ${vehicle.fuelLevel}% (${vehicle.estimatedRange} km)${docRisk ? `, ${docRisk.type.toUpperCase()} ${docRisk.daysUntil <= 0 ? "vencido/hoy" : `en ${docRisk.daysUntil}d`}` : ""}${maintenanceRisk ? `, ${maintenanceRisk.description} ${maintenanceRisk.kmRemaining !== null ? (maintenanceRisk.kmRemaining <= 0 ? "pasado" : `en ${maintenanceRisk.kmRemaining} km`) : ""}` : ""}.`;
    });
    return [
      "Radar de transporte de Aura:",
      ...rows,
      ...(radar.alerts.length > 0 ? ["", "Alertas:", ...radar.alerts.map((alert) => `• ${alert}`)] : []),
      "",
      `Mi orden: ${radar.move}`,
    ].join("\n");
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

async function askAiBackend(messages: CoreMessage[], context: unknown) {
  const systemPrompt = `Eres Aura, la IA integrada de Quid. Responde en español, natural y claro.
Tienes una visual resumida de la app cuando aparece "Contexto interno de Quid".
No inventes datos financieros. Si falta información para guardar algo, pide solo lo que falta.
No menciones herramientas internas ni detalles técnicos.`;

  // El backend puede ser Ollama nativo o un router OpenAI-compatible; el helper
  // normaliza ambos. Ver @/lib/ai/llm.
  const conversation = messages
    .filter((message) => message.role !== "data")
    .map((message) => `${message.role === "user" ? "Usuario" : message.role === "assistant" ? "Aura" : "Sistema"}: ${message.content}`)
    .join("\n\n");

  const completion = await requestAiCompletion({
    system: `${systemPrompt}\n\nContexto interno de Quid: ${JSON.stringify(context)}`,
    user: conversation,
    timeoutMs: 10_000,
  });

  return {
    text: completion.text || "No pude generar una respuesta clara.",
    usage: {
      completionTokens: completion.usage.completionTokens,
      promptTokens: completion.usage.promptTokens,
    },
  };
}

async function askOdysseus(messages: CoreMessage[], context: unknown) {
  if (!ODYSSEUS_ENABLED || !ODYSSEUS_API_URL || !ODYSSEUS_API_TOKEN || !ODYSSEUS_SESSION_ID) {
    return null;
  }

  const recentConversation = messages
    .slice(-10)
    .filter((message) => message.role === "user" || message.role === "assistant" || message.role === "system")
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  const prompt = `Eres Aura, la asistente conversacional de Quid. Responde en español latinoamericano, cálida, breve y útil.
Puedes conversar, explicar, orientar, planear y usar las capacidades disponibles en Odysseus cuando aplique.
No inventes datos financieros, médicos ni de salud guardados en Quid. Si el usuario pregunta por saldos, gastos, compras, citas, medicamentos o registros exactos, indica que eso debe revisarse en Quid.

Contexto resumido de Quid, solo para orientar conversación general:
${JSON.stringify(context)}

Conversación reciente:
${recentConversation}`;

  const response = await fetch(`${ODYSSEUS_API_URL.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ODYSSEUS_API_TOKEN}`,
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      session: ODYSSEUS_SESSION_ID,
      message: prompt,
      use_web: false,
      use_research: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Odysseus respondió con estado ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as { response?: string };
  return {
    text: result.response?.trim() || "No pude generar una respuesta clara.",
  };
}

/**
 * Compara los argumentos de una propuesta guardada contra el payload nuevo.
 *
 * Se comparan sólo los campos que definen QUÉ se va a escribir: el monto, el
 * tipo, la categoría y el destino. No se comparan los ids internos, porque la
 * propuesta guardada ya los tradujo a nombres (`accountName`) mientras que el
 * payload nuevo todavía trae ids (`accountId`).
 *
 * Ante la duda se considera DISTINTA: crear una propuesta de más es inofensivo
 * (el usuario ve la nueva y confirma), mientras que reutilizar una vieja con
 * datos obsoletos registra un monto equivocado.
 */
function sameProposalArgs(
  stored: Record<string, unknown>,
  payload: Record<string, unknown>
): boolean {
  const asText = (value: unknown) =>
    value === null || value === undefined ? null : String(value).trim();
  const asNumber = (value: unknown) => {
    const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };

  // Campos donde el nombre puede variar entre el payload y lo guardado.
  const equivalent = (candidates: unknown[], storedValue: unknown) => {
    const storedText = asText(storedValue);
    if (storedText === null) return true; // no había nada que comparar
    return candidates.some((candidate) => {
      const text = asText(candidate);
      return text !== null && text === storedText;
    });
  };

  if (asNumber(stored.amount) !== asNumber(payload.amount)) return false;
  if (!equivalent([payload.type, payload.transactionType], stored.type)) return false;
  if (!equivalent([payload.category], stored.category)) return false;
  if (!equivalent([payload.subCategory], stored.subCategory)) return false;

  // Destino: puede venir como id (nuevo) o como nombre (guardado). Si el payload
  // trae destino y lo guardado también, deben referirse al mismo: se comparan
  // ambos candidatos contra ambos campos guardados.
  const payloadHasDestination =
    payload.accountId !== undefined || payload.debtId !== undefined;
  const storedHasDestination =
    stored.accountName !== undefined || stored.debtName !== undefined;

  if (payloadHasDestination && storedHasDestination) {
    const matchesAccount = equivalent([payload.accountId, payload.accountName], stored.accountName);
    const matchesDebt = equivalent([payload.debtId, payload.debtName], stored.debtName);
    if (!matchesAccount || !matchesDebt) return false;
  }

  return true;
}

/**
 * Busca el id de propuesta que un mensaje del asistente haya referenciado.
 *
 * El bot de Telegram recibe `payload.proposalId` del engine y lo guarda en su
 * historial, así que al confirmar se puede apuntar a ESA propuesta en vez de a
 * "la más reciente". Se recorre desde el final porque interesa la referencia más
 * nueva que siga en la conversación.
 */
function extractProposalIdFromMessages(messages: CoreMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message.content !== "string") continue;
    const match = message.content.match(/"proposalId"\s*:\s*"([A-Za-z0-9_-]{10,})"/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Agrega el id de la propuesta al payload de una acción.
 *
 * Se expone en la respuesta para que el bot arme un botón que confirme ESA
 * propuesta y no "la última pendiente". Es la diferencia entre apuntar a un
 * registro concreto y depender de un orden implícito.
 */
function withProposalId(action: unknown, proposalId: string | null): unknown {
  if (!proposalId || !action || typeof action !== "object") return action;
  const typed = action as { payload?: Record<string, unknown> };
  return {
    ...typed,
    payload: { ...(typed.payload ?? {}), proposalId },
  };
}

/**
 * Guarda como propuesta pendiente la acción que Aura acaba de proponer.
 *
 * POR QUÉ EXISTE
 *
 * Los creadores (`createTransactionFromAura`, `registerFuelFromAura`) ya devuelven
 * una acción tipada con su payload estructurado. Antes ese payload se usaba solo
 * para construir botones y luego se descartaba: al confirmar había que
 * reconstruirlo parseando el texto del resumen.
 *
 * Acá se aprovecha ese payload tal cual, antes de que se pierda. Es el punto que
 * convierte la propuesta en algo verificable.
 *
 * Los nombres de campo se normalizan para que coincidan con los parámetros
 * declarados en el registro de herramientas, porque los creadores usan ids
 * (`accountId`) mientras que las herramientas usan nombres (`accountName`),
 * que es lo que un modelo puede producir de forma confiable.
 */
async function persistProposalFromAction(userId: string, action: unknown): Promise<string | null> {
  try {
    const proposal = action as
      | { type?: string; tool?: string; requiresConfirmation?: boolean; payload?: Record<string, unknown> }
      | undefined;

    if (
      !proposal ||
      proposal.type !== "proposal" ||
      proposal.requiresConfirmation !== true ||
      typeof proposal.tool !== "string"
    ) {
      return null;
    }

    const payload = proposal.payload ?? {};

    // Reutilizar la propuesta vigente SOLO si es idéntica.
    //
    // El error que esto evita: al reutilizar cualquier propuesta pendiente de la
    // misma herramienta, los argumentos nuevos se DESCARTABAN. Si el usuario
    // decía "gasté 1111" y después corregía "no, fueron 2222", la propuesta
    // guardada seguía siendo la de 1111 y la corrección se perdía en silencio:
    // confirmaba un monto equivocado.
    //
    // Por eso, si los argumentos son distintos, se cancela la anterior y se crea
    // una nueva. La regla es simple: manda lo último que el usuario dijo.
    const existing = await getLatestPendingAction(userId);
    if (existing && existing.tool === proposal.tool) {
      if (sameProposalArgs(existing.args, payload)) {
        return existing.id;
      }
      await markActionCancelled(existing.id);
    }

    const args: Record<string, unknown> = {};

    if (proposal.tool === "registrar_transaccion") {
      args.type = payload.type;
      args.amount = payload.amount;
      args.category = payload.category ?? undefined;
      args.subCategory = payload.subCategory ?? undefined;

      // El destino puede venir de dos formas según el origen:
      //  - los CREADORES mandan ids (`accountId`, `debtId`)
      //  - las CORRECCIONES mandan nombres (`accountName`, `debtName`)
      // Hay que aceptar ambas. Mirar solo los ids dejaba la propuesta corregida
      // sin cuenta, y al confirmar fallaba con "falta indicar desde qué cuenta".
      if (typeof payload.accountName === "string" && payload.accountName.trim()) {
        args.accountName = payload.accountName.trim();
      } else if (typeof payload.accountId === "string") {
        const account = await db.account.findFirst({
          where: { id: payload.accountId, userId },
          select: { name: true },
        });
        if (account) args.accountName = account.name;
      }

      // El bolsillo se resuelve DESPUÉS de la cuenta: su nombre compuesto
      // ("Cuenta / Bolsillo") tiene prioridad sobre el de la cuenta padre.
      if (typeof payload.subAccountId === "string") {
        const sub = await db.subAccount.findFirst({
          where: { id: payload.subAccountId, account: { userId } },
          select: { name: true, account: { select: { name: true } } },
        });
        if (sub) args.accountName = `${sub.account.name} / ${sub.name}`;
      }

      if (typeof payload.debtName === "string" && payload.debtName.trim()) {
        args.debtName = payload.debtName.trim();
      } else if (typeof payload.debtId === "string") {
        const debt = await db.debt.findFirst({
          where: { id: payload.debtId, userId },
          select: { name: true, bank: true },
        });
        if (debt) args.debtName = debt.bank ? `${debt.name} ${debt.bank}` : debt.name;
      }
    } else if (proposal.tool === "registrar_tanqueo") {
      args.amount = payload.amount;
      args.gallons = payload.gallons;
      args.pricePerGallon = payload.pricePerGallon ?? payload.pricePerGallonCop;
      args.km = payload.km;
      args.isFullTank = payload.isFullTank;
      if (typeof payload.vehicleName === "string" && payload.vehicleName.trim()) {
        args.vehicleName = payload.vehicleName.trim();
      } else if (typeof payload.vehicleId === "string") {
        const vehicle = await db.vehicle.findFirst({
          where: { id: payload.vehicleId, userId },
          select: { name: true },
        });
        if (vehicle) args.vehicleName = vehicle.name;
      }
    } else {
      // Herramienta sin normalización conocida: se guarda el payload tal cual y
      // la validación de la herramienta decidirá si sirve.
      Object.assign(args, payload);
    }

    // Se descartan las claves sin valor para no guardar `undefined` serializado.
    for (const key of Object.keys(args)) {
      if (args[key] === undefined) delete args[key];
    }

    await createPendingAction({
      userId,
      tool: proposal.tool,
      args,
      description: `Propuesta de ${proposal.tool}`,
      source: "telegram",
    });

    return (await getLatestPendingAction(userId))?.id ?? null;
  } catch (error) {
    // No debe tumbar la respuesta al usuario: si no se pudo persistir, el flujo
    // de respaldo por texto sigue funcionando.
    console.error("[Aura] No pude persistir la propuesta:", error);
    return null;
  }
}

export async function askAura(userId: string, messages: CoreMessage[]) {  const lastUserMsg = lastUserText(messages);
  const hasProposal = hasRecentAuraProposal(messages);
  const isCancel = isCancellationText(lastUserMsg) && hasProposal;
  const isConfirm = isConfirmationText(lastUserMsg) && hasProposal;

  try {
    // 1. Manejar Cancelación
    if (isCancel) {
      // Si hay una propuesta persistida, se marca como cancelada: así no queda
      // una fila "pending" que otra confirmación tardía pudiera ejecutar.
      const pending = await getLatestPendingAction(userId);
      if (pending) {
        await markActionCancelled(pending.id);
      }
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
            // CAMINO PRINCIPAL (nuevo): ejecutar la propuesta persistida.
            //
            // Antes esto NO existía y la única vía era reparsear el texto del
            // asistente. Ahora, si hay una fila pendiente, se ejecuta
            // exactamente el payload que se guardó al proponer: el texto ya no
            // participa de la ejecución.
            //
            // Se prefiere la propuesta REFERENCIADA por el mensaje del asistente
            // (el bot mete `proposalId` en su payload) antes que "la más
            // reciente": apuntar a un registro concreto evita que una
            // confirmación tardía ejecute una propuesta distinta de la que el
            // usuario está viendo.
            const referencedId = extractProposalIdFromMessages(messages);
            let pending: Awaited<ReturnType<typeof getLatestPendingAction>> = null;
            if (referencedId) {
              try {
                pending = await getPendingActionForUser(referencedId, userId);
              } catch (error) {
                // Si la referenciada ya se resolvió o venció, se cae a la más
                // reciente en vez de fallar: el usuario igual quiso confirmar algo.
                console.warn(
                  `[Aura] La propuesta referenciada no está disponible (${referencedId}):`,
                  error instanceof Error ? error.message : error
                );
              }
            }
            if (!pending) {
              pending = await getLatestPendingAction(userId);
            }

            if (pending) {
              try {
                const outcome = await executeConfirmedTool(pending.tool, pending.args, { userId });
                await markActionConfirmed(pending.id, outcome.data ?? {});
                return {
                  text: outcome.text,
                  action: {
                    type: "executed" as const,
                    tool: pending.tool,
                    payload: outcome.data ?? {},
                  },
                  responseMessages: [...messages, { role: "assistant" as const, content: outcome.text }],
                };
              } catch (error) {
                // La propuesta queda pendiente a propósito: si falló por un dato
                // equivocado (una cuenta que ya no existe), el usuario puede
                // corregir y reintentar en vez de perder la propuesta.
                const message =
                  error instanceof Error ? error.message : "No pude ejecutar la acción.";
                const text = `No pude guardarlo: ${message}`;
                console.error("[Aura] Falló la ejecución de la propuesta:", error);
                return {
                  text,
                  action: "chat" as const,
                  responseMessages: [...messages, { role: "assistant" as const, content: text }],
                };
              }
            }

            // CAMINO DE RESPALDO: propuestas que quedaron del flujo viejo, donde
            // el estado solo existía en el texto. Se mantiene para no romper
            // conversaciones ya iniciadas.
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
          //
          // La corrección también debe PERSISTIRSE. Antes no se hacía, así que la
          // fila pendiente seguía con los valores viejos: el usuario corregía el
          // monto, veía el resumen actualizado, y al confirmar se guardaba el
          // valor ANTERIOR. Persistir acá cierra ese desfase entre lo que el
          // usuario ve y lo que se ejecuta.
          if (isFuel) {
            const vehicles = await db.vehicle.findMany({ where: { userId }, include: { paymentDefault: true } });
            const parsed = parsePreviousFuelProposal(lastAssistantProposalMsg.content);
            const result = await updateFuelProposal(userId, parsed, lastUserMsg, vehicles, accounts, debts);
            const proposalId = await persistProposalFromAction(userId, result.action);
            return {
              text: result.text,
              action: withProposalId(result.action, proposalId),
              responseMessages: [...messages, { role: "assistant" as const, content: result.text }],
            };
          } else {
            const parsed = parsePreviousProposal(lastAssistantProposalMsg.content);
            const result = await updateTransactionProposal(userId, parsed, lastUserMsg, accounts, debts);
            const proposalId = await persistProposalFromAction(userId, result.action);
            return {
              text: result.text,
              action: withProposalId(result.action, proposalId),
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
      // Persistir la propuesta antes de devolverla.
      //
      // Antes, la propuesta quedaba SOLO en el texto de `directAnswer.text` y al
      // confirmar se volvía a parsear. Ahora se guarda como fila y el texto pasa
      // a ser únicamente una descripción para el usuario: la ejecución usa la
      // fila, no el texto.
      const pendingId = await persistProposalFromAction(userId, directAnswer.action);

      return {
        text: directAnswer.text,
        action: withProposalId(directAnswer.action, pendingId) ?? action,
        responseMessages: [...messages, { role: "assistant" as const, content: directAnswer.text }],
      };
    }

    const [balance, expenses, planner] = await Promise.all([
      getBalanceSnapshot(userId),
      getExpenseSnapshot(userId),
      getPlannerSnapshot(userId),
    ]);
    const quidContext = { balance, expenses, planner };

    if (action === "chat") {
      try {
        const odysseus = await askOdysseus(messages, quidContext);
        if (odysseus?.text) {
          return {
            ...odysseus,
            action,
            responseMessages: [...messages, { role: "assistant" as const, content: odysseus.text }],
          };
        }
      } catch (error) {
        console.error("Error conectando con Odysseus desde Aura:", error);
      }
    }

    const conversationFallback = getBasicConversationFallback(lastUserMsg);
    if (conversationFallback) {
      return {
        text: conversationFallback,
        action,
        responseMessages: [...messages, { role: "assistant" as const, content: conversationFallback }],
      };
    }

    const llm = await askAiBackend(messages, quidContext);

    return {
      ...llm,
      action,
      responseMessages: [...messages, { role: "assistant" as const, content: llm.text }],
    };
  } catch (error) {
    console.error("Error en Aura Engine:", error);
    const text =
      error instanceof Error && (error.message.toLowerCase().includes("fetch") || error.name === "TimeoutError")
        ? "No pude contactar al servicio de IA. Revisa que el backend de Aura esté disponible y configurado."
        : "Tuve un problema procesando eso. Intenta de nuevo o revisa la configuración de IA de Quid.";
    return { text, action: "chat" as const, error: error instanceof Error ? error.message : String(error) };
  }
}

