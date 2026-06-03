import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { createFinanceEntry, getTransportDescription } from "@/lib/transport-finance";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export type FuelProposalState = {
  vehicleName: string | null;
  amount: number | null;
  gallons: number | null;
  pricePerGallon: number | null;
  km: number | null;
  accountName: string | null;
  debtName: string | null;
  dateText: string | null;
};

// Normalizar texto
function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

// Parsear kilometraje
function parseKm(text: string) {
  const normalized = normalize(text);
  const fromOriginal =
    readNumberAfter(text, /(?:km|kilometraje|kil[oó]metros?|od[oó]metro)\s*(?:en|de|actual|est[aá]\s*en)?\s*([\d.,\s]+)/i) ??
    readNumberAfter(text, /([\d.,\s]+)\s*(?:km|kil[oó]metros?)\b/i);
  const km = fromOriginal ??
    readNumberAfter(normalized, /(?:km|kilometraje|kilometros?|odometro)\s*(?:en|de|actual|esta en)?\s*([\d\s]+)/i) ??
    readNumberAfter(normalized, /([\d\s]+)\s*(?:km|kilometros?)\b/i);
  return Number.isFinite(km) ? km : null;
}

// Parsear precio por galón
function parsePricePerGallon(text: string) {
  const normalized = normalize(text);
  const price =
    readNumberAfter(text, /(?:gal[oó]n|galones)\s*(?:costaba|cuesta|a|en|de|estaba\s*a)?\s*([\d.,\s]+)/i) ??
    readNumberAfter(text, /precio\s*(?:del|por)?\s*(?:gal[oó]n|galones)?\s*(?:es|era|a|de)?\s*([\d.,\s]+)/i) ??
    readNumberAfter(normalized, /(?:galon|galones)\s*(?:costaba|cuesta|a|en|de|estaba a)?\s*([\d\s]+)/i) ??
    readNumberAfter(normalized, /precio\s*(?:del|por)?\s*(?:galon|galones)?\s*(?:es|era|a|de)?\s*([\d\s]+)/i);
  return Number.isFinite(price) ? price : null;
}

// Parsear valor de compra
function parseAmount(text: string) {
  const normalized = normalize(text);
  const moneyMatch =
    text.match(/(?:\$|cop\s*)?\s*([\d.,\s]+)\s*(mil|k|millones|mill[oó]n|pesos?)?/i) ||
    normalized.match(/(?:cop\s*)?\s*([\d\s]+)\s*(mil|k|millones|millon|pesos?)?/i);
  if (!moneyMatch) return null;

  const rawNumber = moneyMatch[1];
  const suffix = normalize(moneyMatch[2] || "");
  let amount = parseLocaleNumber(rawNumber);
  if (amount == null || !Number.isFinite(amount)) return null;
  if ((suffix === "mil" || suffix === "k") && amount < 1000) amount *= 1000;
  if (suffix === "millon" || suffix === "millones") amount *= 1_000_000;
  return Math.round(amount);
}

// Parsear fecha
function parseRecordDate(text: string): Date {
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

// Analizar la propuesta previa
export function parsePreviousFuelProposal(content: string): FuelProposalState {
  const lines = content.split("\n");
  let vehicleName: string | null = null;
  let amount: number | null = null;
  let gallons: number | null = null;
  let pricePerGallon: number | null = null;
  let km: number | null = null;
  let accountName: string | null = null;
  let debtName: string | null = null;
  let dateText: string | null = null;

  for (const line of lines) {
    if (line.includes("- Vehículo:")) {
      vehicleName = line.replace("- Vehículo:", "").trim();
    } else if (line.includes("- Valor:")) {
      const valStr = line.replace("- Valor:", "").replace(/[^\d]/g, "").trim();
      amount = parseInt(valStr, 10) || null;
    } else if (line.includes("- Galones:")) {
      const galStr = line.replace("- Galones:", "").trim();
      gallons = parseFloat(galStr) || null;
    } else if (line.includes("- Precio por galón:")) {
      const ppgStr = line.replace("- Precio por galón:", "").replace(/[^\d]/g, "").trim();
      pricePerGallon = parseInt(ppgStr, 10) || null;
    } else if (line.includes("- Kilometraje:")) {
      const kmStr = line.replace("- Kilometraje:", "").replace(/[^\d]/g, "").trim();
      km = parseInt(kmStr, 10) || null;
    } else if (line.includes("- Método:")) {
      const methodStr = line.replace("- Método:", "").trim();
      if (methodStr.startsWith("con ")) {
        debtName = methodStr.replace("con ", "").replace(/^tarjeta\s+/i, "").trim();
      } else if (methodStr.startsWith("desde ")) {
        accountName = methodStr.replace("desde ", "").trim();
      }
    } else if (line.includes("- Fecha:")) {
      dateText = line.replace("- Fecha:", "").trim();
    }
  }

  return { vehicleName, amount, gallons, pricePerGallon, km, accountName, debtName, dateText };
}

function getDefaultPaymentLabel(paymentDefault: any, accounts: any[], debts: any[]) {
  if (!paymentDefault) return "sin método de pago";

  if (paymentDefault.paymentType === "credit_card" && paymentDefault.debtId) {
    const debt = debts.find((item) => item.id === paymentDefault.debtId);
    return debt ? `con tarjeta ${debt.name}` : "con tarjeta predeterminada";
  }

  const account = accounts.find((item) => item.id === paymentDefault.accountId);
  const subAccount = paymentDefault.subAccountId
    ? accounts.find((item) => item.id === paymentDefault.subAccountId)
    : null;

  if (account && subAccount) return `desde ${account.name} / ${subAccount.name}`;
  if (account) return `desde ${account.name}`;
  return "desde cuenta predeterminada";
}

// Actualizar propuesta de tanqueo
export async function updateFuelProposal(
  userId: string,
  prevProposal: FuelProposalState,
  lastUserMsg: string,
  vehicles: any[],
  accounts: any[],
  debts: any[]
) {
  const normalized = normalize(lastUserMsg);

  // 1. Detectar vehículo
  let vehicleName = prevProposal.vehicleName;
  const matchedVehicle = vehicles.find((v) => {
    const values = [v.name, v.plate, v.brand, v.model].filter(Boolean).map((val) => normalize(String(val)));
    return values.some((val) => val.length >= 3 && normalized.includes(val));
  });
  if (matchedVehicle) {
    vehicleName = matchedVehicle.name;
  }

  // 2. Detectar valor
  let amount = prevProposal.amount;
  const parsedAmt = parseAmount(lastUserMsg);
  if (parsedAmt !== null) {
    amount = parsedAmt;
  }

  // 3. Detectar precio por galón
  let pricePerGallon = prevProposal.pricePerGallon;
  const parsedPpg = parsePricePerGallon(lastUserMsg);
  if (parsedPpg !== null) {
    pricePerGallon = parsedPpg;
  }

  // 4. Detectar kilometraje
  let km = prevProposal.km;
  const parsedKm = parseKm(lastUserMsg);
  if (parsedKm !== null) {
    km = parsedKm;
  }

  // 5. Detectar método de pago
  let accountName = prevProposal.accountName;
  let debtName = prevProposal.debtName;

  const matchedAccount = accounts.find((acc) => {
    const accName = normalize(acc.name);
    const parts = accName.split(" / ");
    return normalized.includes(accName) || parts.some((part) => part.length >= 4 && normalized.includes(part));
  });

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

  // 6. Detectar fecha
  let dateText = prevProposal.dateText;
  if (/\b(ayer|hoy|antier|anteayer|fecha|dia)\b/.test(normalized)) {
    const date = parseRecordDate(lastUserMsg);
    dateText = new Intl.DateTimeFormat("es-CO", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date);
  }

  // Recalcular galones si cambian precio o valor total
  let gallons = prevProposal.gallons;
  if (amount && pricePerGallon) {
    gallons = Math.round((amount / pricePerGallon) * 100) / 100;
  }

  const vehicle = vehicles.find((v) => vehicleName && normalize(v.name) === normalize(vehicleName));
  const paidWith = debtName
    ? `con tarjeta ${debtName}`
    : accountName
      ? `desde ${accountName}`
      : getDefaultPaymentLabel(vehicle?.paymentDefault, accounts, debts);

  return {
    text: [
      `He actualizado el resumen del tanqueo con tus correcciones:`,
      `Resumen para confirmar el tanqueo:`,
      `- Vehículo: ${vehicleName || "No especificado"}`,
      `- Valor: ${COP.format(amount || 0)}`,
      `- Galones: ${gallons || 0}`,
      `- Precio por galón: ${COP.format(pricePerGallon || 0)}`,
      `- Kilometraje: ${(km || 0).toLocaleString("es-CO")} km`,
      `- Método: ${paidWith}`,
      `- Categoría: Transporte`,
      `- Subcategoría: Combustible`,
      `- Fecha: ${dateText || "Hoy"}`,
      "",
      "Responde CONFIRMAR para guardarlo o CANCELAR para descartarlo.",
    ].join("\n"),
    action: {
      type: "proposal" as const,
      tool: "registrar_tanqueo" as const,
      requiresConfirmation: true,
      payload: {
        vehicleName,
        amount,
        gallons,
        pricePerGallon,
        km,
        accountName,
        debtName,
        dateText,
      },
    },
  };
}

// Ejecutar tanqueo confirmado
export async function executeFuelProposal(
  userId: string,
  proposal: FuelProposalState,
  vehicles: any[],
  accounts: any[],
  debts: any[]
) {
  const { vehicleName, amount, gallons, pricePerGallon, km, accountName, debtName, dateText } = proposal;

  if (!vehicleName) throw new Error("Falta especificar el vehículo.");
  if (!amount) throw new Error("Falta especificar el valor del tanqueo.");
  if (!pricePerGallon) throw new Error("Falta precio por galón.");
  if (!km) throw new Error("Falta kilometraje.");

  const vehicle = vehicles.find((v) => normalize(v.name) === normalize(vehicleName));
  if (!vehicle) throw new Error(`No encontré el vehículo "${vehicleName}".`);

  const paymentDefault = vehicle.paymentDefault;
  let accountId = null;
  let subAccountId = null;
  let debtId = null;
  let paymentType: "account" | "credit_card" = "account";

  if (debtName) {
    const debt = debts.find((d) => normalize(d.name) === normalize(debtName));
    if (!debt) throw new Error(`No encontré la tarjeta "${debtName}".`);
    debtId = debt.id;
    paymentType = "credit_card";
    if (paymentDefault?.paymentType === "credit_card" && paymentDefault.debtId === debt.id) {
      accountId = paymentDefault.accountId;
      subAccountId = paymentDefault.subAccountId;
    }
  } else if (accountName) {
    const account = accounts.find((a) => normalize(a.name) === normalize(accountName));
    if (!account) throw new Error(`No encontré la cuenta "${accountName}".`);
    accountId = account.kind === "account" ? account.id : account.parentAccountId;
    subAccountId = account.kind === "subAccount" ? account.id : null;
  } else if (paymentDefault) {
    accountId = paymentDefault.accountId;
    subAccountId = paymentDefault.subAccountId;
    debtId = paymentDefault.debtId;
    paymentType = paymentDefault.paymentType as "account" | "credit_card";
  }

  const recordDate = dateText ? parseRecordDate(dateText) : new Date();
  const calculatedGallons = gallons || Math.round((amount / pricePerGallon) * 100) / 100;

  const fuelLog = await db.fuelLog.create({
    data: {
      vehicleId: vehicle.id,
      date: recordDate,
      km,
      amount,
      pricePerGallon,
      gallons: calculatedGallons,
      isFullTank: true,
      accountId,
      subAccountId,
      debtId,
      installmentCount: paymentType === "credit_card" ? paymentDefault?.installmentCount ?? null : null,
      notes: "Registrado desde Aura",
    },
  });

  if (km > vehicle.currentKm) {
    await db.vehicle.update({ where: { id: vehicle.id }, data: { currentKm: km } });
  }

  await createFinanceEntry({
    userId,
    amount,
    description: getTransportDescription("fuel", vehicle.name),
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
    notes: `Registrado desde Aura. ${calculatedGallons} gal a ${COP.format(pricePerGallon)}/gal`,
    vehicleName: vehicle.name,
  });

  const paidWith = debtName
    ? `con tarjeta ${debtName}`
    : accountName
      ? `desde ${accountName}`
      : getDefaultPaymentLabel(paymentDefault, accounts, debts);

  return {
    text: `Listo, registré el tanqueo de ${vehicle.name}: ${COP.format(amount)}, ${calculatedGallons} galones, km ${km.toLocaleString("es-CO")}, ${paidWith}.`,
    action: {
      type: "executed" as const,
      tool: "registrar_tanqueo",
      payload: { fuelLogId: fuelLog.id, vehicleId: vehicle.id, amount },
    },
  };
}
