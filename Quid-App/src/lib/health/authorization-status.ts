/**
 * Estado real de una autorización médica.
 *
 * Regla de negocio (la que faltaba):
 * una autorización **existe para habilitar un servicio**. Si la cita asociada ya
 * se cumplió, la autorización ya hizo su trabajo: su fecha de vencimiento es un
 * dato histórico y **no debe generar alarmas** ("por vencer", "vencida").
 *
 * Antes el estado se derivaba solo de `expirationDate`, así que una
 * autorización con la cita atendida seguía avisando al vencer. Eso es ruido que
 * además empuja al usuario a renovar algo que no necesita.
 *
 * Se calcula en un solo lugar y lo usan el resumen, la pestaña de
 * autorizaciones y el contexto de Aura, para que no vuelvan a divergir.
 */

export type AuthorizationView =
  /** Esperando respuesta de la EPS. */
  | "pending"
  /** Autorizada y sin usar: sirve para agendar. */
  | "available"
  /** Ya tiene cita programada. */
  | "scheduled"
  /** La cita asociada se cumplió: objetivo logrado. */
  | "fulfilled"
  /** Venció sin usarse. */
  | "expired"
  /** Se canceló. */
  | "cancelled";

export interface AuthorizationLike {
  status: string;
  expirationDate?: string | Date | null;
  appointment?: { status?: string | null; date?: string | Date | null } | null;
}

export interface AuthorizationState {
  view: AuthorizationView;
  label: string;
  /** Días hasta el vencimiento (negativo si ya venció). */
  daysLeft: number | null;
  /** ¿Merece una alerta en el resumen? */
  alarm: boolean;
  /**
   * La cita se cumplió DESPUÉS del vencimiento. Sigue siendo "cumplida" (el
   * servicio se prestó), pero conviene saberlo.
   */
  outsideValidity: boolean;
  /** Explicación corta para la interfaz. */
  hint: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Días completos entre hoy y la fecha (zona local). */
export function daysUntilDate(target: Date, now: Date = new Date()): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Resuelve el estado visible de una autorización.
 *
 * Orden de prioridad: cumplida > cancelada > pendiente > programada > vencida.
 * La cita cumplida gana sobre cualquier fecha, que es justo el caso que se
 * reportaba.
 */
export function resolveAuthorizationState(
  auth: AuthorizationLike,
  now: Date = new Date(),
): AuthorizationState {
  const appointmentStatus = auth.appointment?.status ?? null;
  const daysLeft = auth.expirationDate
    ? daysUntilDate(new Date(auth.expirationDate), now)
    : null;

  // 1. Cumplida: la cita se atendió. Nada que reclamar.
  if (appointmentStatus === "completed") {
    const appointmentDate = auth.appointment?.date ? new Date(auth.appointment.date) : null;
    // Se usó dentro de su vigencia, o se atendió tarde (dato, no alarma).
    const outsideValidity =
      appointmentDate !== null &&
      auth.expirationDate != null &&
      daysUntilDate(appointmentDate, now) > (daysLeft ?? 0);

    return {
      view: "fulfilled",
      label: "Cumplida",
      daysLeft,
      alarm: false,
      outsideValidity,
      hint: outsideValidity
        ? "La cita se atendió, pero después del vencimiento"
        : "Se usó dentro de la vigencia: nada que renovar",
    };
  }

  // 2. Cancelada explícitamente.
  if (auth.status === "cancelled" || appointmentStatus === "cancelled") {
    return {
      view: "cancelled",
      label: "Cancelada",
      daysLeft,
      alarm: false,
      outsideValidity: false,
      hint: "Se canceló; registra una nueva si la necesitas",
    };
  }

  // 3. Pendiente de la EPS: no hay nada que vencer todavía.
  if (auth.status === "pending_authorization") {
    return {
      view: "pending",
      label: "En trámite",
      daysLeft,
      alarm: false,
      outsideValidity: false,
      hint: "Esperando respuesta de la EPS",
    };
  }

  // 4. Con cita programada. Solo alarma si la autorización vence ANTES de la
  //    cita: ahí sí no alcanzaría a usarse.
  if (appointmentStatus === "scheduled") {
    const appointmentDate = auth.appointment?.date ? new Date(auth.appointment.date) : null;
    const expiresBeforeAppointment =
      appointmentDate !== null && daysLeft !== null && daysLeft < daysUntilDate(appointmentDate, now);

    return {
      view: "scheduled",
      label: "Programada",
      daysLeft,
      alarm: expiresBeforeAppointment,
      outsideValidity: false,
      hint: expiresBeforeAppointment
        ? "Vence antes de la cita: hay que renovarla"
        : "Cita programada con esta autorización",
    };
  }

  // 5. Vencida sin usarse.
  if (auth.status === "expired" || (daysLeft !== null && daysLeft < 0)) {
    return {
      view: "expired",
      label: "Vencida",
      daysLeft,
      alarm: true,
      outsideValidity: false,
      hint: "Venció sin usarse",
    };
  }

  // 6. Disponible, con aviso cuando está cerca de vencer.
  const expiringSoon = daysLeft !== null && daysLeft <= 7;
  return {
    view: "available",
    label: "Autorizada",
    daysLeft,
    alarm: expiringSoon,
    outsideValidity: false,
    hint: expiringSoon
      ? daysLeft === 0
        ? "Vence hoy y no tiene cita"
        : `Vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"} y no tiene cita`
      : "Disponible para agendar",
  };
}

/** ¿Debe aparecer en el resumen y en el calendario de salud? */
export function needsAttention(auth: AuthorizationLike, now: Date = new Date()): boolean {
  const state = resolveAuthorizationState(auth, now);
  return state.alarm;
}


/**
 * Resumen para el tablero: separa lo que está en trámite de lo que vence.
 *
 * Son cosas distintas y se comunican distinto: un trámite en curso no "vence"
 * (todavía no tiene fecha), pero **sí** es algo pendiente. Mezclarlas hacía que
 * el resumen dijera "Al día" con un trámite abierto en la EPS.
 */
export function summarizeAuthorizations(
  authorizations: AuthorizationLike[],
  now: Date = new Date(),
): { pending: number; expiring: number; total: number } {
  let pending = 0;
  let expiring = 0;

  for (const auth of authorizations) {
    const state = resolveAuthorizationState(auth, now);
    if (state.view === "pending") pending += 1;
    else if (state.alarm) expiring += 1;
  }

  return { pending, expiring, total: pending + expiring };
}

/** Texto corto para la tarjeta del resumen. */
export function describeAuthorizations(summary: {
  pending: number;
  expiring: number;
  total: number;
}): string {
  if (summary.total === 0) return "Al día";
  return [
    summary.pending > 0 ? `${summary.pending} en trámite` : null,
    summary.expiring > 0 ? `${summary.expiring} por vencer` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
