# Reglas del dinero en Quid

Una sola verdad para que dos pantallas no digan cosas distintas.
Si algo de Quid suma o resta plata, **tiene que seguir este documento**.

> Nació de un bug real: `Account.excludeFromAvailable` existía y **nadie lo
> usaba**, así que el tablero decía “tienes 4 millones” cuando 3 estaban
> apartados.

---

## 1. Los tres números de una cuenta

| Concepto | Qué es | Dónde se muestra |
|---|---|---|
| **total** | Todo el dinero: cuentas + subcuentas, con lo apartado incluido | Patrimonio neto, pantalla Cuentas |
| **disponible** | Solo lo que no está marcado `excludeFromAvailable` | “Dinero disponible” del tablero, Balance de Finanzas, Aura, límite de abonos |
| **apartado** | `total − disponible`: plata tuya que decidiste no contar | Debajo del disponible, como aclaración; colchón de emergencia |

**Fuente única:** `src/lib/finance/available.ts` → `balanceBreakdown(accounts)`.
Ninguna vista debe sumar `account.balance` por su cuenta.

Reglas del cálculo:

- Una cuenta con `excludeFromAvailable = true` **no suma** a disponible, pero
  **sí** a total.
- Cada subcuenta tiene su propia marca: una cuenta marcada puede tener
  subcuentas disponibles.
- Saldos inválidos o texto no numérico cuentan como 0 (nunca `NaN`).

---

## 2. Patrimonio neto

`total de todas las cuentas + ahorros + CDT (capital + interés) − deudas −
"debo" a personas + "me deben" a personas`.

Aquí **sí** entra lo apartado: patrimonio es cuánto tienes, no cuánto puedes
gastar hoy. Fuente: `src/lib/finance/net-worth.ts`.

---

## 3. Cuándo algo es gasto, cuándo es pago y cuándo es movimiento interno

| Situación | Tipo | ¿Afecta presupuesto? |
|---|---|---|
| Comprar comida | `expense` | Sí |
| Pagar la cuota de un crédito | `expense` (pago de deuda) | Sí, como cuota de deuda |
| Pagar la tarjeta de crédito | `transfer` | No |
| Mover plata entre tus cuentas | `transfer` | No |
| Prestar plata a alguien | `expense` marcado `sourceModule: "person_loan"` + `excludeFromBudget` | No |
| Cobrar un préstamo que hiciste | `income` marcado igual | No |
| Aportar a una meta de ahorro | No genera movimiento (solo avance de la meta) | No |
| Comprar un CDT | No genera gasto: es una inversión | No |

Regla general: **mover plata propia no es gasto**. Un gasto reduce tu
patrimonio; una transferencia solo lo cambia de bolsillo.

---

## 4. Cuotas de deuda

- `installmentAmount` = capital, `interestAmount` = interés,
  `otherChargesAmount` = seguros y otros cargos.
- `cuota = capital + interés + otros`, exacto.
- `paidAmount` de la cuota = total pagado de esa cuota.
- Al pagar: baja el capital pendiente, se marca la cuota y se registra el
  movimiento cuando corresponde.
- **Abono mayor que la cuota**: el excedente baja a las cuotas siguientes, en
  orden. Una cuota a medias queda con saldo pendiente visible (“parcial”).
- **Reversar** libera todas las cuotas que cubrió ese pago y restaura el saldo.

---

## 5. Dinero apartado y decisiones automáticas

- El **colchón de emergencia** son 3 meses de gastos (`gastos × 3`).
- Se calcula como `max(metas de ahorro + CDT, cuentas apartadas)` para no
  contar dos veces la misma plata.
- El **consejero del plan** (`lib/finance/plan-advisor.ts`) nunca propone
  aportar más que el excedente del mes (`ingresos − gastos − cuotas`).
- Un **abono extra** en el simulador no puede superar el dinero disponible.

---

## 6. Deudas entre personas

- "Me deben" suma como **activo**; "debo" suma como **pasivo**.
- Pagar la cuota genera movimiento real (ingreso si te deben, gasto si debes)
  y mueve el saldo de la cuenta elegida.
- Nunca toca presupuestos.

---

## 7. Planes de proyecto

- Las proyecciones usan **supuestos visibles y editables** (tasa, volatilidad).
- Con volatilidad se muestra un **rango**, nunca una cifra única.
- Cada escenario lleva su **fuente**; las que propone Aura son sugerencias
  **sin verificar**.
- Regla firme: **no se promete rendimiento**.

---

## 8. Ciclos y fechas

- Las fechas de negocio se manejan como `YYYY-MM-DD` y se construyen con
  `new Date(y, m-1, d)`: `new Date("2026-11-17")` se interpreta UTC y en
  Bogotá cae el 16.
- El corte de tarjeta y el ciclo de presupuesto usan el día del mes
  configurado, no el mes calendario.

---

## 9. Si vas a tocar cálculos de dinero

1. Busca si ya existe una función en `src/lib/finance/`. Si existe, úsala.
2. Si no existe, **créala ahí** con pruebas antes de usarla en una vista.
3. Nunca sumes saldos dentro de un componente de React.
4. Corre `npx tsc --noEmit` y `npx vitest run`.
