# Aura — el asistente de Quid

Cómo está armado, qué puede hacer y dónde está cada límite.
Reglas de dinero: `reglas-dinero.md`. Mapa técnico: `arquitectura.md`.

---

## 1. Dos cerebros, un solo camino de escritura

| Capa | Dónde | Qué hace |
|---|---|---|
| **Motor de reglas** | `src/lib/aura/index.ts` | Entiende la intención ("¿cuánto gasté?", "registra 50 mil en taxi"), responde con datos de Quid y arma propuestas |
| **Modelo de lenguaje** | `src/lib/ai/llm.ts` → FreeLLMAPI | Redacta, investiga y conversa; **nunca** calcula dinero |

Cliente OpenAI-compatible: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`
(producción ya las tiene). Acepta formato Ollama y OpenAI.

**Regla de oro:** las cifras las calcula Quid (`lib/finance/`); el modelo solo
las explica. Nunca al revés.

---

## 2. Herramientas (59)

`src/lib/aura/tools/registry.ts` declara **32 de lectura** y **27 de escritura**.
El endpoint `GET /api/aura/tools` las publica; el bot de Telegram las consume.

| Dominio | Lectura (ejemplos) | Escritura (ejemplos) |
|---|---|---|
| Finanzas | cuentas, gastos, ingresos, presupuestos, deudas, metas, CDT | transacción, tanqueo, transferencia, presupuesto, cuenta, deuda, meta, CDT, abono |
| Planes (F-52) | `consultar_planes_proyecto`, `simular_plan_proyecto`, `investigar_opciones_ahorro` | `crear_plan_proyecto` |
| Préstamos entre personas (F-25) | listado con cuotas | — (se cobra desde la app) |
| Transporte | vehículos, combustible, mantenimientos, documentos | tanqueo, mantenimiento, documento, recordatorio, vehículo, precios |
| Salud | citas, medicamentos, órdenes, perfil, condiciones, autorizaciones | cita, medicamento, orden, perfil, condición, autorización |
| Despensa | lista de compras, productos, recetas, movimientos | lista, producto, receta, movimiento, perfil de salud |
| Transversal | compartidas, logros | regla de categoría |

Cada herramienta declara `kind` (`read` o `write`) y `implemented`.

---

## 3. Escrituras: propuesta y confirmación

1. Aura interpreta y crea un `PendingAuraAction` con los parámetros.
2. El usuario **confirma** en la app (tarjeta con Confirmar/Calcular) o en
   Telegram.
3. `POST /api/aura/tools/confirm` ejecuta en `execute-confirmed.ts`.

**El `userId` lo resuelve el servidor** (sesión o `x-aura-token` + `telegramId`).
Nunca se acepta del cliente; hay prueba de aislamiento entre usuarios.

---

## 4. Canales

| Canal | Cómo entra |
|---|---|
| App | `components/aura/aura-chat.tsx` (botón flotante) → `/api/aura/chat` |
| Telegram | Bot externo → `/api/aura/tools` con token; radar diario en `/api/aura/digest` |

Los dos usan **el mismo motor** y el **mismo gateway de confirmación**: no hay
un segundo camino que pueda desincronizar datos.

---

## 5. Qué dice Aura sobre dinero

Sigue `reglas-dinero.md`:

- Responde con **disponible** y, si aplica, cuánto está **apartado**.
- Nunca propone un aporte mayor que el excedente del mes.
- Las tasas que investiga son **sugerencias sin verificar** y así lo dice.
- No promete rendimientos.

---

## 6. Límites conocidos

- **Pagar la cuota de una tarjeta con interés/ciclo** no está expuesto: vive en
  `/api/debts/[id]/pay` (606 líneas sin pruebas). Existe un plan acordado para
  extraerlo a `lib/finance/debt-payment.ts` con pruebas de caracterización
  primero.
- El modelo externo puede fallar o no estar disponible; en ese caso Aura
  responde con el motor de reglas y lo dice.
- `lib/aura/index.ts` pasa de 2.000 líneas: **pendiente de dividir** por
  responsabilidad (interpretación, respuestas, radar, contexto).
