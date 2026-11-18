/**
 * F-52b · El consejero del plan.
 *
 * POR QUÉ EXISTE
 *
 * Preguntar "¿cuánto puedes aportar?" es pedirle al usuario que haga el trabajo
 * y, peor, invita a prometerse más de lo que aguanta. Quid ya sabe cuánto entra,
 * cuánto sale, cuánto va a deudas y cuánto hay apartado; con eso propone un
 * aporte que **no ponga en riesgo** el mes.
 *
 * REGLAS (explícitas, no magia):
 * 1. Sin excedente → no se sugiere aportar: primero hay que ajustar.
 * 2. Deudas muy altas (cuotas > 30% del ingreso) → se paga deuda primero.
 * 3. Sin colchón de emergencia (menos de 3 meses de gastos) → se comparte.
 * 4. Con lo básico cubierto → se propone la mitad del excedente.
 */

export interface AdvisorInput {
  /** Ingreso mensual promedio de los últimos meses. */
  monthlyIncome: number;
  /** Gasto mensual promedio, sin contar cuotas de deuda. */
  monthlyExpenses: number;
  /** Cuotas mensuales de deudas activas. */
  monthlyDebtPayments: number;
  /** Lo que ya está apartado (ahorros + CDT) para el colchón. */
  emergencyFund: number;
  /** Meses de gastos que se consideran colchón suficiente. */
  emergencyMonths?: number;
}

export type AdvisorVerdict = "start" | "build_emergency_first" | "pay_debt_first" | "not_yet";

export interface AdvisorResult {
  /** Lo que queda libre cada mes después de gastos y deudas. */
  surplus: number;
  /** Aporte mensual propuesto. Puede ser 0. */
  suggestedMonthly: number;
  /** Qué parte del excedente representa la propuesta (0–1). */
  share: number;
  /** Colchón ideal (meses de gasto). */
  emergencyTarget: number;
  /** Cuánto falta para ese colchón. */
  emergencyGap: number;
  /** Porcentaje del ingreso que se va en deudas. */
  debtLoad: number;
  verdict: AdvisorVerdict;
  /** Explicación en primera persona, sin promesas. */
  headline: string;
  reasons: string[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

export function advisePlan(input: AdvisorInput): AdvisorResult {
  const income = safe(input.monthlyIncome);
  const expenses = safe(input.monthlyExpenses);
  const debtPayments = safe(input.monthlyDebtPayments);
  const fund = safe(input.emergencyFund);
  const months = Math.max(1, input.emergencyMonths ?? 3);

  const surplus = round2(income - expenses - debtPayments);
  const emergencyTarget = round2(expenses * months);
  const emergencyGap = round2(Math.max(0, emergencyTarget - fund));
  const debtLoad = income > 0 ? round2((debtPayments / income) * 100) : 0;

  if (income <= 0) {
    return {
      surplus,
      suggestedMonthly: 0,
      share: 0,
      emergencyTarget,
      emergencyGap,
      debtLoad,
      verdict: "not_yet",
      headline: "Todavía no puedo proponerte un aporte: no veo ingresos registrados.",
      reasons: ["Registra tus ingresos del mes y te digo cuánto puedes aportar sin apretarte."],
    };
  }

  if (surplus <= 0) {
    return {
      surplus,
      suggestedMonthly: 0,
      share: 0,
      emergencyTarget,
      emergencyGap,
      debtLoad,
      verdict: "not_yet",
      headline: "Este mes no te queda plata libre: gastos y deudas se comen el ingreso.",
      reasons: [
        `Entran ${Math.round(income)} y salen ${Math.round(expenses + debtPayments)} entre gastos y cuotas.`,
        "Antes de apartar para el proyecto, ajusta un gasto o espera un mes mejor.",
      ],
    };
  }

  if (debtLoad > 30) {
    const suggested = round2(surplus * 0.2);
    return {
      surplus,
      suggestedMonthly: suggested,
      share: 0.2,
      emergencyTarget,
      emergencyGap,
      debtLoad,
      verdict: "pay_debt_first",
      headline: `Tus cuotas se llevan el ${debtLoad.toFixed(0)}% del ingreso. Yo iría primero por la deuda.`,
      reasons: [
        "Una cuota alta con interés suele costar más que lo que rinde un ahorro.",
        `Si igual quieres empezar, te propongo ${Math.round(suggested)} al mes: lo que no te aprieta.`,
      ],
    };
  }

  if (emergencyGap > 0) {
    const suggested = round2(surplus * 0.4);
    const toFund = round2(surplus - suggested);
    return {
      surplus,
      suggestedMonthly: suggested,
      share: 0.4,
      emergencyTarget,
      emergencyGap,
      debtLoad,
      verdict: "build_emergency_first",
      headline: `Te falta colchón: ${Math.round(emergencyGap)} para cubrir ${months} meses de gastos.`,
      reasons: [
        `Con lo que te queda (${Math.round(surplus)}), mi sugerencia es ${Math.round(suggested)} al proyecto y ${Math.round(toFund)} al colchón.`,
        "Cuando el colchón esté completo, subimos el aporte del plan.",
      ],
    };
  }

  const suggested = round2(surplus * 0.5);
  return {
    surplus,
    suggestedMonthly: suggested,
    share: 0.5,
    emergencyTarget,
    emergencyGap,
    debtLoad,
    verdict: "start",
    headline: `Tienes ${Math.round(surplus)} libres al mes y tu colchón ya cubre ${months} meses.`,
    reasons: [
      `Te propongo aportar ${Math.round(suggested)}: la mitad de lo libre, para que el mes siga respirando.`,
      `El resto (${Math.round(surplus - suggested)}) queda disponible para imprevistos.`,
    ],
  };
}
