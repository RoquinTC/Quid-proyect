/**
 * Registro de módulos de Quid.
 *
 * Hoy el menú hamburguesa y los ajustes se arman por separado, con listas
 * escritas a mano en cada archivo. Eso obliga a tocar tres lugares para
 * agregar un módulo, y por eso se desincronizan (Finanzas aparecía como
 * "ajuste de cuenta" cuando es un módulo).
 *
 * Este archivo es la fuente única. Cada módulo declara:
 *  - cómo se ve y a dónde lleva            (menú hamburguesa)
 *  - qué acciones rápidas ofrece           (menú hamburguesa)
 *  - qué configuración expone              (ajustes)
 *
 * Agregar un módulo futuro (Viajes, Inversiones, Pareja) es agregar una
 * entrada aquí: los dos menús lo toman solos.
 */

import {
  Home, Wallet, Car, Heart, ShoppingCart,
  ArrowLeftRight, Banknote, Receipt, PiggyBank, CreditCard, Clock, Tag,
  PlusCircle, Fuel, Wrench, Shield, Landmark,
  Pill, Stethoscope, Refrigerator, ListPlus, ShieldCheck,
  type LucideIcon,
} from "lucide-react";

/** Las secciones de configuración que puede exponer un módulo. */
export type SettingsSectionId =
  | "general"
  | "finance"
  | "aura"
  | "transport"
  | "health"
  | "pantry"
  | "admin";

/** Acción rápida del menú: crea, registra o gestiona algo. */
export type ModuleAction = {
  id: string;
  label: string;
  /** Ícono del menú hamburguesa. */
  icon: LucideIcon;
  /** Verbo de la acción, para agrupar en el menú: crear, registrar, gestionar. */
  verb: "crear" | "registrar" | "gestionar";
};

export type QuidModule = {
  /** Identificador estable; se usa en el store y en las rutas. */
  id: string;
  label: string;
  /** Frase corta que explica el módulo. */
  hint: string;
  icon: LucideIcon;
  /** Clases de Tailwind para el ícono. */
  color: string;
  bg: string;
  /** Acciones rápidas que ofrece el menú hamburguesa. */
  actions: ModuleAction[];
  /** Sección de Ajustes que configura este módulo (null si no tiene). */
  settings: SettingsSectionId | null;
};

/**
 * Módulos actuales de Quid.
 *
 * El orden de este arreglo es el orden del menú.
 */
export const QUID_MODULES: QuidModule[] = [
  {
    id: "dashboard",
    label: "Inicio",
    hint: "Tu día en una pantalla",
    icon: Home,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    actions: [],
    settings: null,
  },
  {
    id: "finance",
    label: "Finanzas",
    hint: "Saldos, presupuestos y capturas",
    icon: Wallet,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-100 dark:bg-teal-900/30",
    actions: [
      { id: "create-transaction", icon: ArrowLeftRight, label: "Nueva Transacción", verb: "crear" },
      { id: "create-account", icon: Banknote, label: "Nueva Cuenta", verb: "crear" },
      { id: "create-budget", icon: Receipt, label: "Nuevo Presupuesto", verb: "crear" },
      { id: "create-savings-goal", icon: PiggyBank, label: "Nueva Meta de Ahorro", verb: "crear" },
      { id: "create-debt", icon: CreditCard, label: "Nueva Deuda", verb: "crear" },
      { id: "create-cdt", icon: CreditCard, label: "Nuevo CDT", verb: "crear" },
      { id: "create-recurring", icon: Clock, label: "Nuevo Pago Recurrente", verb: "crear" },
      { id: "manage-categories", icon: Tag, label: "Gestionar Categorías", verb: "gestionar" },
    ],
    settings: "finance",
  },
  {
    id: "transport",
    label: "Transporte",
    hint: "Vehículos, combustible y documentos",
    icon: Car,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/30",
    actions: [
      { id: "create-vehicle", icon: PlusCircle, label: "Nuevo Vehículo", verb: "crear" },
      { id: "log-fuel", icon: Fuel, label: "Registrar Recarga", verb: "registrar" },
      { id: "log-maintenance", icon: Wrench, label: "Registrar Mantenimiento", verb: "registrar" },
      { id: "register-document", icon: Shield, label: "Registrar Documento", verb: "registrar" },
      { id: "update-fuel-price", icon: Landmark, label: "Actualizar Precio Combustible", verb: "registrar" },
    ],
    settings: "transport",
  },
  {
    id: "health",
    label: "Salud",
    hint: "Medicamentos y citas",
    icon: Heart,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-900/30",
    actions: [
      { id: "create-medication", icon: Pill, label: "Nuevo Medicamento", verb: "crear" },
      { id: "create-appointment", icon: Stethoscope, label: "Nueva Cita Médica", verb: "crear" },
    ],
    settings: "health",
  },
  {
    id: "pantry",
    label: "Despensa",
    hint: "Productos y listas de mercado",
    icon: ShoppingCart,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    actions: [
      { id: "create-pantry-item", icon: Refrigerator, label: "Nuevo Producto", verb: "crear" },
      { id: "create-shopping-list", icon: ListPlus, label: "Nueva Lista de Mercado", verb: "crear" },
      { id: "create-health-profile", icon: ShieldCheck, label: "Perfil de Salud", verb: "crear" },
    ],
    settings: "pantry",
  },
];

/** Secciones de Ajustes que no son de un módulo, sino de la app. */
export const APP_SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  label: string;
  hint: string;
  group: "general" | "modulos" | "sistema";
}> = [
  { id: "general", label: "Ajustes Generales", hint: "Tema, seguridad y copias", group: "general" },
  { id: "aura", label: "Asistente Aura", hint: "Telegram y habilidades", group: "general" },
  { id: "finance", label: "Finanzas y Presupuestos", hint: "Corte, categorías y captura", group: "modulos" },
  { id: "transport", label: "Transporte", hint: "Vehículos y combustible", group: "modulos" },
  { id: "health", label: "Salud", hint: "Medicamentos y recordatorios", group: "modulos" },
  { id: "pantry", label: "Despensa", hint: "Productos y listas", group: "modulos" },
  { id: "admin", label: "Administración", hint: "Sistema y usuarios", group: "sistema" },
];

/** Devuelve el módulo que configura cierta sección de ajustes. */
export function moduleForSettings(section: SettingsSectionId): QuidModule | null {
  return QUID_MODULES.find((module) => module.settings === section) ?? null;
}

/** Agrupa las acciones de un módulo por verbo, para el menú. */
export function groupActions(module: QuidModule): Record<string, ModuleAction[]> {
  return module.actions.reduce<Record<string, ModuleAction[]>>((groups, action) => {
    (groups[action.verb] ??= []).push(action);
    return groups;
  }, {});
}
