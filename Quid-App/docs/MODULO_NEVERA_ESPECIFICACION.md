# Módulo **Nevera** — Especificación funcional y de diseño

> **Estado:** bosquejo cerrado, pendiente de aprobación final antes de implementar.
> **Origen de las decisiones:** sesión de diseño con el usuario. Este documento es la
> **fuente de verdad de los requisitos**.
> **Referencia técnica:** [SOFTLIST_INGENIERIA_INVERSA_DESPENSA.md](./SOFTLIST_INGENIERIA_INVERSA_DESPENSA.md)
> — ingeniería inversa de SoftList 2.8.3 (modelo de datos, motor de precios, mecánicas de
> lista, estilo visual). SoftList **no tiene inventario**; aquí se documenta lo invertido y
> en este documento se define lo original.
>
> **Nombre:** **Nevera**. Decidido.

---

## 0. Principios

Cinco reglas que gobiernan cada decisión de este módulo. Cuando haya duda, se resuelve con
estas y no con la comodidad de implementación.

| # | Principio | Implicación |
|---|---|---|
| 1 | **La palabra del usuario gana sobre la IA** | Toda deducción automática (restricciones, umbrales, recetas) es editable y la edición persiste |
| 2 | **Un solo ledger** | El stock **nunca** se escribe directo: siempre se escribe un movimiento y la cantidad se deriva |
| 3 | **Nunca se rompe la experiencia** | Si la IA falla, hay fallback. Si falta información, se muestra un vacío con carácter, no un error |
| 4 | **Una cápsula por producto** | Nunca saturar la fila con múltiples badges; se muestra el estado más grave |
| 5 | **Lo lúdico vive en el personaje, el copy y la ilustración** | No en el chrome de la interfaz. Superficie plana, limpia, minimalista |

**Encargo de diseño explícito del usuario:** *"que quede bonita, llamativa, intuitiva y que
provoque usarla"*.

---

## 1. Visión

Una **nevera virtual** que refleja lo que de verdad hay en tu cocina, que sabe cuándo se
está acabando algo, que te arma la lista del mercado, que registra la compra en tus finanzas
y que te sugiere qué cocinar con lo que tienes — respetando lo que cada persona de la casa
puede o no comer.

El módulo reemplaza el "papelito del mercado" por un flujo cerrado:

```
      ┌──────────────────────── NEVERA VIRTUAL ────────────────────────┐
      │   inventario real · stock mínimo · ubicación · vencimientos    │
      └───────▲────────────────────┬──────────────────────────▲────────┘
              │                    │                          │
   (1) manual │      (2) desde la lista confirmada       (3) desde receta
   +/− / param │                    │                     (descuenta)
              │                    ▼                          │
      ┌───────┴────────────────────────────────────────────────┴───────┐
      │                    LISTA DE COMPRA                             │
      │  papelito · carrito · 2 totales · descuentos · dividida         │
      └───────────────────────────┬────────────────────────────────────┘
                                  ▼
      ┌────────────────────────────────────────────────────────────────┐
      │  CONFIRMACIÓN  →  Finanzas (cuenta / tarjeta)  +  Nevera       │
      └───────────────────────────┬────────────────────────────────────┘
                                  ▼
      ┌────────────────────────────────────────────────────────────────┐
      │  HISTÓRICO  →  tiquete · reversar · eliminar                   │
      └────────────────────────────────────────────────────────────────┘
```

---

## 2. Arquitectura de navegación

**5 tabs.** El módulo crece pero no se embute: cada tab tiene una responsabilidad única.

| Tab | Vive aquí | NO vive aquí |
|---|---|---|
| **Nevera** | Inventario, existencias, stock bajo, ubicación, vencimientos, alertas cápsula, "Actualizar nevera" | Listas, recetas |
| **Mercado** | Listas activas, carrito, confirmación, tiendas | Histórico, recetas |
| **Recetas** | Generar con IA, recetas guardadas, "A preparar", comensales | Inventario, listas activas |
| **Perfiles** | Perfiles alimenticios (principal + visitantes), condiciones, restricciones | Datos clínicos duros |
| **Historial** | Compras pasadas, tiquete, reversar, eliminar | Listas activas |

`Historial` es tab propio —no va dentro de Mercado— porque tiene acciones destructivas que
no deben estar a un toque de la lista activa. `Perfiles` es tab propio —no dentro de
Salud— porque es más amplio que lo clínico: un perfil de invitado no tiene enfermedades.

**Ajustes del módulo:** accesibles desde el menú lateral (ícono de hamburguesa). Contenido
a organizar más adelante.

**Acción primaria persistente:** en el tab Mercado, un FAB **"Nueva lista"**. En Nevera, un
botón **"Actualizar nevera"**.

---

## 3. Modelo de datos

Se **extiende** lo que ya existe en `Quid-App/prisma/schema.prisma` (`PantryItem`,
`PantryMovement`, `PriceHistory`, `ShoppingList`, `ShoppingListItem`, `Recipe`,
`RecipeIngredient`, `HealthProfile`). No se reemplaza nada.

### 3.1 `PantryItem` — el producto en la nevera

```prisma
model PantryItem {
  // ya existe
  id, userId, name, category, quantity, unit, expirationDate, purchaseDate,
  purchasePrice, minStock, unitWeightFactor, targetQuantity, lastUsedAt,
  createdAt, updatedAt

  // nuevo
  nameNormalized   String            // deduplicación (algoritmo en §7.1)
  location         String  @default("nevera")  // nevera | alacena | congelador
  isFavorite       Boolean @default(false)     // reposición rápida
  isActive         Boolean @default(true)      // soft delete (equivale a ATIVO)
  sortOrder        Int     @default(1)
  defaultUnitId    String?                     // unidad preferida
  priceUnitId      String?                     // unidad de precio (PRICE_UNIT_ID)
  multiplyQuantity Boolean @default(true)      // ver §6.3
  notes            String  @default("")

  @@unique([userId, nameNormalized, unit])
  @@index([userId, isActive])
}
```

`multiplyQuantity` se **explicita por producto** en lugar de heredarse de la unidad (como
hace SoftList, que lo mete en `UNIDADES.MULTIPLICAR_VALOR` y es su mayor fuente de
confusión). El default se **deriva** de la unidad: `g` y `ml` ⇒ `false`; el resto ⇒ `true`.
Editable por producto.

`@@unique([userId, nameNormalized, unit])` corrige el bug documentado de SoftList, que
deduplica por nombre crudo y por eso crea dos productos para "Leche" y "leche".

### 3.2 `PantryMovement` — el ledger

```prisma
enum PantryMovementType { in out adjust waste }

model PantryMovement {
  // ya existe
  id, itemId, userId, type, quantity, unit, note, sourceListId, sourceRecipeId, createdAt

  // nuevo / ajustado
  type        PantryMovementType   // reemplaza el String libre
  sourceStore String?              // tienda de la compra
  unitPrice   Decimal?             // precio unitario pagado en este movimiento
  occurredAt  DateTime @default(now())  // fecha real del evento (≠ createdAt)
  reversedAt  DateTime?            // si el movimiento fue reversado

  @@index([userId, occurredAt])
}
```

`PantryItem.quantity` **nunca** se escribe directo desde ninguna vía: siempre se escribe un
`PantryMovement` y la cantidad se actualiza en la misma transacción.

`waste` (merma/vencido) es un tipo que SoftList no tiene y es el que más valor aporta en una
nevera real.

### 3.3 `PriceHistory` — ya existe, se puebla

Se escribe en cada movimiento `in`. Habilita los reportes de variación de precio sin
construir maquinaria nueva. Es el equivalente al `PRODUCT_STORE_PRICE` + `HISTORICO` de
SoftList.

### 3.4 `ShoppingList` — la lista, ahora con saldado parcial

```prisma
model ShoppingList {
  // ya existe
  id, userId, name, status, profileId, storeName, purpose,
  purchaseDate, completedAt, createdAt, updatedAt

  // nuevo
  totalDiscountAmount  Decimal?    // descuento total fijo (§5.4)
  totalDiscountPercent Decimal?    // descuento total porcentual (§5.4)
  reversedAt           DateTime?   // marca de reversa (auditoría, §8)
}
```

`status`: `draft` → `shopping` → `partially_confirmed` → `completed`.
Una lista con `partially_confirmed` **sigue abierta** con los productos pendientes.

### 3.5 `ShoppingListItem` — se extiende para soportar el saldado

```prisma
model ShoppingListItem {
  // ya existe
  id, shoppingListId, name, quantity, unit, estimatedPrice, actualPrice,
  isPurchased, checked, pantryItemId, createdAt, updatedAt

  // nuevo
  confirmedQuantity Float @default(0)  // cuánto se confirmó (acumulable)
  addedToCart       Boolean @default(false) // el "check" del carrito
  storeName         String?            // tienda en que se compró ESTA línea
  discountAmount    Decimal?           // descuento por producto
  discountPercent   Decimal?           // descuento por producto (porcentual)
}
```

**Saldo de una línea** = `quantity − confirmedQuantity`. La lista está saldada cuando
**todas** las líneas tienen saldo 0.

### 3.6 Confirmaciones parciales

```prisma
model PantryListConfirmation {   // nueva
  id                String   @id @default(cuid())
  shoppingListId    String
  userId            String
  storeName         String?
  purchaseDate      DateTime
  discountAmount    Decimal?       // descuento TOTAL de esta confirmación (§5.4)
  discountPercent   Decimal?
  subtotal          Decimal
  total             Decimal
  paymentType       String         // account | credit_card
  transactionId     String?        // referencia al movimiento en Finanzas
  installmentId     String?
  reversedAt        DateTime?
  createdAt         DateTime @default(now())

  @@index([shoppingListId])
}
```

**Una fila por cada vez que confirmas** (una por tienda). Es la pieza que hace posible el
saldado parcial, y es lo que el histórico necesita para el tiquete y la reversa.

### 3.7 Perfiles: condiciones y restricciones

El usuario registra un **medicamento**, la IA pregunta qué trata, el usuario confirma o
corrige. **Esa es la puerta de entrada, no una obligación** — también se puede declarar una
condición sin medicamento (diabetes, hernia).

```prisma
model HealthCondition {           // nueva
  id          String @id @default(cuid())
  profileId   String
  name        String                       // "Diabetes tipo 2"
  origin      String                       // medication | manual | ai_confirmed
  medicationId String?                     // si nació de un medicamento
  severity    String @default("diagnosed") // diagnosed | suspected
  notes       String @default("")
  createdAt   DateTime @default(now())

  @@index([profileId])
}

model DietaryProfile {            // nueva
  id             String @id @default(cuid())
  profileId      String @unique
  isActive       Boolean @default(true)
  restrictions   Json?   // DURAS: no puede   — intolerancias, alergias, celiaquía
  preferences    Json?   // BLANDAS: conviene evitar — artritis, diabetes, hipertensión
  avoid          Json?   // alimentos concretos vetados
  allowOverrides Json?   // excepciones del usuario: "lácteos NO, crema de leche SÍ"
  aiSummary      String?
  sourceHash     String? // hash de las entradas — si cambia, se regenera
  updatedAt      DateTime @updatedAt
}
```

### 3.8 Los tres niveles de restricción — la pieza central

Esto es lo que evita que la app **prohíba** cosas que en realidad solo son **sugerencias**:

| Nivel | Origen | Cómo lo trata la app | Color |
|---|---|---|---|
| **Restricción dura** | Intolerancia, alergia, celiaquía | **Bloquea.** "Contiene lactosa" | Rojo |
| **Recomendación blanda** | Artritis, poliartropía, diabetes, hernia | **Advierte.** "Conviene bajo en sal" | Ámbar |
| **Excepción del usuario** | La escribiste tú | **Manda sobre todo lo anterior** | — |

La tercera fila es la regla más importante: *"soy intolerante a la lactosa, pero puedo
consumir crema de leche y algunos quesos, o muy poco"*. Esa frase debe poder expresarse y
**gana siempre** sobre la deducción de la IA. Es lo que hace que las recetas sean tuyas y no
de un manual.

Ejemplo del caso real del usuario: **poliartropía + artritis** → recomendación blanda de
*"no consumir carnes frías, ni procesados, consumo bajo en sal"*.

### 3.9 Recetas

```prisma
model Recipe {
  // ya existe: id, userId, name, description, type, servings,
  //            cookingTime, instructions, aiGenerated, aiPrompt, createdAt, updatedAt

  // nuevo
  prepTime      Int?      // minutos
  difficulty    String?   // facil | media | dificil
  recommendations String? // JSON array — recomendaciones del procedimiento
  source        String @default("manual") // manual | ai | base
  isFavorite    Boolean @default(false)
  lastCookedAt  DateTime?
}

model RecipeIngredient {
  // ya existe: id, recipeId, name, quantity, unit, category, createdAt
  // nuevo
  isOptional Boolean @default(false)
  notes      String?
}
```

### 3.10 Historial

El histórico **es** la lista de `ShoppingList` con `status = completed`. No necesita tabla
propia: `PantryListConfirmation` da las tiendas, los totales y las fechas; `ShoppingListItem`
da el detalle del tiquete.

---

## 4. Nevera

### 4.1 Vista principal

Lista agrupada, con **una sola superficie visual** y el acento ámbar existente. Agrupación
conmutable: **por ubicación** (nevera / alacena / congelador) o **por categoría**.

Cada fila muestra (máximo dos datos, como manda el principio 5):

```
[ 🧊 icono ]  Nombre del producto                    [ cápsula ]
   categoría       2 kg · vence 12 nov
```

### 4.2 Cápsulas de alerta

**Máximo una cápsula visible por producto** — la más grave. Prioridad de mayor a menor:

| Cápsula | Color | Cuándo |
|---|---|---|
| **Vencido** | rojo | ya pasó la fecha |
| **Vence pronto** | naranja | dentro de 3 días |
| **Agotado** | rojo | cantidad = 0 |
| **Stock bajo** | ámbar | llegó o bajó del mínimo |
| **Se acaba** | ámbar suave | bajo el objetivo, sobre el mínimo |
| **Sin usar** | gris | mucho tiempo sin consumo |

**Filtros:** una sola fila de chips → `Todos · Agotados · Stock bajo · Por vencer · Sin usar`.

### 4.3 Cómo se alimenta el stock — las tres vías

**Vía 1 — Manual / parametrizada.** El usuario añade un producto con cantidad + unidad
(paquete, unidad, botella, gramos, libras, kilos…), ubicación y umbrales.

**Vía 2 — Desde una lista de compra confirmada.** Marcando **toda la lista** como stock, o
**producto por producto**. Detalle en §5.

**Vía 3 — Desde una receta.** Al preparar, se descuentan los ingredientes. Detalle en §7.

### 4.4 Actualizar nevera ("Modo inventario" / "Recuento")

Botón **"Actualizar nevera"** → muestra los productos que hay, y para cada uno:

- **"−" / "+"** para ajustar,
- **edición directa de la cantidad**.

Cada ajuste genera un `PantryMovement` de tipo `adjust` con su motivo. Es el momento donde
el personaje de la nevera aparece "contando".

### 4.5 Umbral de stock bajo

Se **determina la primera vez que se registra el producto** (a partir de la cantidad
inicial). Es **editable** después, y también **actualizable cuando se actualiza desde la
lista** (el toggle "recordar mínimos", §5.5).

**Regla:** el mínimo **nunca baja** automáticamente. Si ya tenías mínimo 3 y compras 2, el
mínimo sigue siendo 3. Solo sube si el usuario lo pide explícitamente.

### 4.6 Stock bajo → generar lista

Cuando hay productos agotados o bajo mínimo, se **habilita un botón** para **generar una
nueva lista** con los faltantes.

La lista generada:

- tiene **el mismo estilo** que la lista normal,
- permite **añadir, eliminar o editar** productos,
- trae cada producto con **la cantidad faltante**,
- trae **el último precio confirmado** (ver §6.4),
- **la marca de stock viene deshabilitada** (porque ya existe inventario),
- si marcas un **producto nuevo** como stock → se **añade** al inventario,
- si marcas uno que **ya existe** → mensaje:
  *"El producto ya existe en el stock con X cantidad. ¿Deseas actualizar?"*
  (así te das cuenta si marcaste por error).

---

## 5. Mercado — la lista de compra

### 5.1 Concepto

**"Como cuando anotas las cosas en un papelito"**, pero sencilla. Ese es el criterio de
diseño: si una decisión la hace menos parecida a un papelito fácil de leer, no se toma.

### 5.2 La línea

- Nombre del producto.
- Precio **por unidad o por la medida que necesites**.
- Cantidad a comprar.
- **Check "va al carrito"** — el carrito se va sumando.

### 5.3 Dos totales

| Total | Qué es |
|---|---|
| **Total de la lista** | lo que vas a pagar por toda la lista |
| **Total del carrito** | lo que llevas en el carrito (solo lo marcado) |

### 5.4 Descuentos

- **Por producto**: monto fijo o porcentual (si la tienda lo tiene).
- **Total de la compra**: monto fijo o porcentual — para cuando no sabes dónde te lo
  aplicaron, o cuando es un descuento por monto (ej. gastaste 200.000 → 20 %).
- El descuento total es **por tienda / por confirmación**, nunca global repartido.

### 5.5 Confirmación

Flujo al confirmar:

1. Permite **marcar la lista como stock** y/o **marcar productos sueltos**.
2. **Descuento total** de la compra (fijo o porcentual).
3. Pregunta **en qué tienda** la compró, o permite elegir de una **lista de tiendas ya
   creadas**.
4. Trae el **valor final**.
5. Permite escoger **con qué cuenta pagó**: cuentas normales o **tarjetas de crédito** —
   igual que el módulo de Transporte al recargar combustible.
6. Al confirmar: se registran **todos los movimientos**, el movimiento en **Finanzas** donde
   corresponde, y la **suma o creación** en el inventario + la nevera virtual.

**Toggle "Recordar mínimos"** (`minMode`): por producto, con default desde un ajuste global.
Si está activo, el mínimo se siembra con `Math.max(minStock, cantidadComprada)`.

### 5.6 Compra dividida entre tiendas (saldado parcial)

**Una sola lista** que se va **saldando**. Si de 10 productos compras 5 en la tienda A (pagas
con una cuenta) y 5 en la tienda B (pagas con tarjeta):

- Cada confirmación parcial registra su **propio gasto, su tienda, su forma de pago y su
  propio descuento**.
- La lista **sigue abierta** con los productos pendientes.
- `status` pasa a `partially_confirmed`.
- Se puede **eliminar la lista** si al final no compras el resto.

El descuento es **por tienda** porque el extracto refleja el valor exacto de esa tienda —
nunca un descuento global repartido entre confirmaciones.

---

## 6. Precios, unidades y el motor de importe

### 6.1 Normalización de nombres

Algoritmo (portado de SoftList, §6.1 del doc de referencia):

1. `Normalizer.normalize(s, NFD)` equivalente JS: `s.normalize("NFD")`
2. eliminar marcas diacríticas: `.replace(/\p{M}/gu, "")`
3. `toLowerCase()`
4. **eliminar todos los espacios**
5. si queda en blanco, devolver el original

Se guarda en `PantryItem.nameNormalized` y **se usa para deduplicar** (SoftList usa el nombre
crudo, y por eso duplica — no repetir ese error).

### 6.2 Unidades

| Unidad | `multiplyQuantity` por defecto |
|---|---|
| `g`, `ml` | **false** |
| resto (unidad, paquete, botella, kg, lb, l, caja…) | **true** |

`multiplyQuantity = false` ⇒ el valor de la línea **es** el total (típico en granel, donde ya
pesaste y pagaste). `true` ⇒ el valor es **precio unitario** y se multiplica por la cantidad.

### 6.3 Fórmula de importe de línea

Adoptada tal cual del motor de SoftList (§4.3 del doc de referencia), con dos cambios: enums
en vez de ints mágicos, y `Decimal` (ya estás usando `Decimal` en los campos de dinero).

```ts
type LineAmountInput = {
  quantity: number;
  value: Decimal;
  multiplyQuantity: boolean;
  taxEnabled: boolean;
  taxRate: Decimal;      // fracción: 0.19
  couponEnabled: boolean;
  couponValue: Decimal;  // fracción si PERCENT
  couponType: "FIXED" | "PERCENT";
};

function lineAmount(i: LineAmountInput): Decimal {
  const amt = i.multiplyQuantity
    ? i.value.mul(i.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    : i.value;

  let base = amt;
  if (i.couponEnabled) {
    base = i.couponType === "FIXED"
      ? amt.minus(i.couponValue)
      : amt.minus(amt.mul(i.couponValue).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  }
  return (base.greaterThan(0) && i.taxEnabled)
    ? base.plus(base.mul(i.taxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
    : base;
}
```

Reglas confirmadas del original: el impuesto se aplica **después** del descuento, sobre el
monto ya descontado; no se aplica si el descuento dejó el monto ≤ 0; redondeo
**HALF_UP a 2 decimales**.

### 6.4 Los precios se actualizan y alimentan las siguientes listas

Ejemplo del usuario:

> Hoy compré una lata de atún a **2.000 COP**. Días después la nevera me dice que me falta 1
> atún. La lista generada trae el atún con **la cantidad que falta** y **el último precio
> confirmado**. Pero hoy cuesta **2.500 COP**, así que ese precio **se actualiza** y
> aparecerá en las **siguientes** listas que genere.

Mecánica:

1. Toda confirmación escribe `PriceHistory` (precio, cantidad, unidad, fecha, tienda, `sourceListId`).
2. Generar lista desde la nevera lee **el último precio de `PriceHistory`** para cada producto.
3. Si el usuario cambia el precio en la lista, se actualiza ahí y queda como el precio vigente.
4. `PriceHistory` alimenta también los reportes de variación de precio (§10).

### 6.5 Generar stock desde la lista

Al confirmar una línea como stock:

- Si la línea **no tiene** `pantryItemId`: buscar por `nameNormalized` **antes** de crear
  (auto-merge). Si no existe, crear `PantryItem` con la categoría y unidad de la línea —no
  forzar `"other"`, que es lo que hace hoy el endpoint—.
- Si **tiene** `pantryItemId`: `PantryMovement { type: "in" }` + `priceHistory` + actualizar
  `purchaseDate`, `purchasePrice` y el mínimo si `minMode`.
- Aplicar `unitWeightFactor` al sumar cuando la unidad de la línea y la del inventario no
  coincidan.

---

## 7. Recetas

### 7.1 Creación

- **Desde los productos que hay en la nevera.**
- **Recetas "legítimas"** (propias, sin usar la IA).
- Si **falta un ingrediente**, la receta **se guarda para más tarde** y se puede **generar la
  lista de compra** de lo que falta.

### 7.2 Generación con IA

**Jerarquía de proveedores:**

```
IA principal (Aura / FreeLLMAPI del servidor)
   ├─ falla → mensaje sutil y con carácter
   ├─ fallback 1: buscar en internet
   └─ fallback 2: receta de la base de datos local
```

La base local son **20–30 recetas básicas colombianas** en un JSON (pesa menos que un icono),
marcadas visualmente como **"receta base"** para que el usuario sepa que no es personalizada.

**Arquitectura obligatoria** — la IA **no** se llama desde el cliente:

```
Cliente (web o Capacitor)
   → POST /api/ai/recipe              (tu servidor Next.js, con sesión)
        → FreeLLMAPI (tu servidor)     ← las credenciales nunca salen al cliente
```

Llamar a FreeLLMAPI directo desde el frontend expone la API key en el bundle.

**Estados de la UI:** cargando (con carácter, no un spinner genérico) · resultado · error con
salida (reintentar / buscar en internet / receta base).

### 7.3 Campos

porciones · tiempo de preparación · tiempo de cocción · dificultad · ingredientes ·
**procedimiento completo** · **recomendaciones** · tipo · favorita.

### 7.4 Escalar vs. validar — dos cosas distintas

| Acción | Qué hace |
|---|---|
| **Escalar** | Ajusta cantidades al número de comensales (receta para 4, comen 2 → mitad) |
| **Validar** | Compara la receta contra los perfiles **de los que sí van a comer**, y avisa |

**Los perfiles no escalan.** Si un comensal tiene una restricción dura y la receta lleva ese
ingrediente, escalar no lo arregla: la receta sigue teniéndolo, solo en menos cantidad. Por
eso van separadas.

**Selección de comensales:** se eligen los que van a comer. Los que **tienen** perfil aportan
restricciones; los que **no** simplemente no aportan nada. El aviso:

> *"Uno de los comensales no puede consumir lácteos. ¿Genero una versión adaptada, o preparas
> la original?"*

con opción de generar la versión adaptada con IA.

### 7.5 "A preparar" — tres modos

| Modo | Qué hace | Inventario |
|---|---|---|
| **A · Solo preparar** | Marca la receta como preparada, sin tocar nada | **No afecta** — actualizas la nevera después a mano |
| **B · Descontar lo que hay** | Descuenta solo los ingredientes disponibles; si falta, no descuenta ese | Sí, parcial |
| **C · Escalar a lo disponible** | Ajusta la receta a lo que tienes ("tengo la mitad de la carne → preparo media receta") | Sí, escalado |

**Aprobado:** **C** como principal, y **A** disponible. El modo **A no escribe nada** — no
necesita movimientos ni reversa, es solo una acción informativa. Eso simplifica bastante el
código.

Caso de uso de A: *"me arriesgo a prepararla con lo poquito que tengo"*.

**Modo B** queda disponible pero no es el principal.

### 7.6 Detección de disponibilidad

Al abrir una receta guardada, la app compara ingredientes contra la nevera:

- **Todos disponibles** → se habilita el botón **"A preparar"**.
- **Faltan algunos** → se muestra qué falta y se ofrece **generar la lista de compra**.
- **El usuario ajusta cantidades libremente** (porque puede echar un poco más o un poco menos
  que lo que pide la receta).

Ciclo completo:

```
receta → faltan ingredientes → lista de compra → compras
   → actualizas la nevera desde la lista → vuelves a la receta
   → detecta que tienes todo → "A preparar" → se descuenta de la nevera
```

---

## 8. Historial

### 8.1 Vista

**Compacto** —que no ocupe mucho espacio—: nombre de la lista, tienda, fecha y valor total.
Al tocar, se despliega **una especie de tiquete** con productos, cantidades y valores.

### 8.2 Dos acciones distintas: Reversar y Eliminar

Son **intenciones distintas** y por eso tienen **botones distintos**:

| Acción | Para qué | Qué pasa después |
|---|---|---|
| **Reversar** | *"Me equivoqué en algo y quiero arreglarlo"* | La lista **vuelve a abrirse** para editarla. **No se borra nada.** |
| **Eliminar** | *"Quiero que esto desaparezca"* | Se elige el alcance: solo el registro, o todo (reversar + borrar) |

#### Botón **Reversar**

Hace la **inversa de todos los movimientos**:

- Devuelve el dinero a la cuenta o a la tarjeta de crédito.
- Descuenta las cantidades del inventario.
- Marca `reversedAt` en la lista, las confirmaciones y los movimientos.
- La lista **vuelve a abrirse** o queda **pendiente por confirmar**, de modo que si te
  equivocaste en un precio, una cantidad, un nombre o cualquier detalle, puedas **editarla**.

Este botón **no borra nada**: es puramente correctivo. Es el camino cuando el problema es un
dato mal puesto, no cuando quieres que la compra deje de existir.

#### Botón **Eliminar**

Pregunta el **alcance**:

```
┌─ Eliminar esta compra ─────────────────────────┐
│                                                │
│  ○ Solo quitarla del historial                 │
│    No toca tus cuentas ni la nevera.           │
│                                                │
│  ○ Reversar y eliminar todo                    │
│    Devuelve el dinero a tu cuenta/tarjeta,     │
│    descuenta los productos del inventario      │
│    y borra la lista.                           │
│                                                │
│         [ Cancelar ]    [ Continuar ]          │
└────────────────────────────────────────────────┘
```

- **Solo el registro histórico** → se borra el registro y nada más. **No toca el balance ni
  las cantidades de la nevera.** El mensaje debe ser explícito en esto.
- **Reversar y eliminar todo** → hace la reversa **y** borra. Segundo mensaje de confirmación
  con los números concretos:

> *"Se va a reversar y eliminar. Se devolverán $X a tu cuenta, se descontarán N productos del
> inventario y se borrará la lista. ¿Confirmas?"*

#### Cómo interactúan los dos botones

| Estado de la compra | Reversar | Eliminar |
|---|---|---|
| Confirmada (no reversada) | **Habilitado** | Habilitado (2 opciones) |
| Ya reversada | **Deshabilitado** | Habilitado (solo "quitar del historial") |
| Con confirmaciones parciales | Por **cada parcial** (ver abajo) | Por **cada parcial** |

Esto es lo que **protege contra la doble reversa**: el botón de reversar queda inerte cuando
la compra ya está reversada, en vez de confiar en que el usuario no lo toque dos veces.

#### El histórico se individualiza por confirmación

La unidad del histórico **no es la lista: es cada confirmación (cada tienda)**. Debe ser así
porque, como dice el requisito, el resto de la lista puede terminar de comprarse en otro
lado, con **otra fecha y otro valor**. Por eso cada parcial es su propio registro con su
nombre, tienda, fecha y total, y las acciones operan **sobre esa parcial únicamente**.

Ejemplo de una lista dividida:

```
Lista "Mercado semanal"
  ├── Confirmación 1 · Éxito · 12 feb · $82.400   ← reversable/eliminable por separado
  └── Confirmación 2 · D1    · 14 feb · $45.100   ← reversable/eliminable por separado
```

Reversar la Confirmación 1 devuelve $82.400 al Éxito y descuenta del inventario **solo los
productos de esa parcial**. La Confirmación 2 no se toca. Si aún quedan líneas con saldo, la
lista sigue abierta.

**Estado interno necesario:** `reversedAt` en `ShoppingList`, `PantryListConfirmation` y
`PantryMovement`, para que:

- el histórico no cuente compras ya reversadas en los totales,
- sea imposible reversar dos veces la misma parcial (protección de integridad),
- la UI sepa qué botones mostrar en cada fila del histórico.

**Implementado en el esquema:** `PantryListConfirmation` guarda `storeName`, `purchaseDate`,
`subtotal`, `discountType`/`discountValue`/`discountAmount`, `total`, `paymentType`,
`reversedAt` y las referencias al movimiento financiero (`transactionId` / `installmentId`).
Es la tabla que sostiene tanto el tiquete como la reversa selectiva.

---

## 9. Salud ↔ Perfiles ↔ Recetas

### 9.1 Flujo de captura de condiciones

```
Salud: el usuario registra un medicamento (ya existe `Medication`)
   ↓
Aura / IA interpreta el medicamento y PREGUNTA:
   "¿Estás tomando Metformina para la diabetes tipo 2?"
   [ Sí, es correcto ]  [ Es otra cosa ]  [ No sé ]
   ↓
El usuario confirma, corrige o escribe la enfermedad a mano
   ↓
Queda registrada la CONDICIÓN en el perfil, con su origen:
   medication | manual | ai_confirmed
   ↓
También se puede declarar una condición SIN medicamento:
   diabetes, hernia, artritis...
```

La clave: el usuario **declara lo que ya hace** (tomar una pastilla) y la app deduce el resto.
No se le obliga a "declararse enfermo".

### 9.2 Del perfil clínico al perfil alimenticio

La IA procesa las condiciones y produce el `DietaryProfile`:

| Entrada | Salida |
|---|---|
| *"soy intolerante a la lactosa"* | restricción **dura**: lácteos |
| *"pero puedo consumir crema de leche, algunos quesos o muy poco"* | `allowOverrides`: crema de leche, quesos (excepción que gana) |
| *"no consumo granos pero sí arroz"* | `avoid`: granos; `allowOverrides`: arroz |
| *"no como lentejas ni frijoles"* | `avoid`: lentejas, frijoles |
| **Poliartropía + artritis** | recomendación **blanda**: carnes frías, procesados, bajo en sal |
| **Diabetes** | recomendación **blanda**: azúcares, carbohidratos refinados |
| **Hernia** | recomendación **blanda**: según indicación médica |

### 9.3 Perfiles

- **Principal** (el dueño).
- **Visitantes**: pareja, hijo, invitado — con nombre, se guardan.
- **Activables**: se encienden y apagan según quién va a comer.
- Un perfil **sin condiciones ni restricciones no genera perfil alimenticio** — y eso es
  válido (el caso del tercer comensal).

### 9.4 Integración entre módulos

| Módulo | Qué fluye | Sentido |
|---|---|---|
| **Salud → Perfiles** | Medicamentos, enfermedades, condiciones | Salud aporta el insumo clínico |
| **Perfiles → Recetas** | Restricciones duras, recomendaciones blandas, excepciones | Filtra y adapta recetas |
| **Perfiles → Nevera** | Alertas sobre productos que la persona no debería consumir | Aviso, no bloqueo (salvo restricción dura) |
| **Nevera ↔ Mercado** | Faltantes → lista; lista confirmada → inventario | Bidireccional |
| **Mercado → Finanzas** | `Transaction` / `Installment` con `sourceModule: "pantry"` | Ya existe en el endpoint actual |
| **Finanzas → Historial** | Valores, formas de pago, reversas | El tiquete muestra el pago |

---

## 10. Reportes (derivados, no un módulo nuevo)

Con `PriceHistory` y `PantryListConfirmation` poblados, tres reportes salen casi gratis:

| Reporte | Fuente |
|---|---|
| **Variación de precio por producto** | `PriceHistory` agrupado por producto y ordenado por fecha |
| **Gasto por categoría del mercado** | `Transaction` con `sourceModule = "pantry"` (ya lo escribes) |
| **Comparación de precios entre tiendas** | `PriceHistory` + `sourceStore` |

No se construye maquinaria nueva: se consultan datos que el flujo ya genera.

---

## 11. Diseño visual

### 11.1 Dirección

**Opción B aprobada: personaje y tono juguetón, interfaz limpia y minimalista.**

Lo lúdico vive en **el personaje, las ilustraciones y el texto** — **no** en el chrome de la
interfaz. Regla explícita: **sin contornos gruesos, sin tramas de puntos, sin bocadillos en
la UI.** Si una decisión estética agrega ruido visual, no se toma.

Esto reconcilia las dos peticiones del usuario: *"más minimalista, no tan cargado"* +
*"cómica, que dé curiosidad y ganas de usarlo"*.

### 11.2 La nevera es el personaje

No un ícono decorativo: un personaje con **estados** que reacciona a lo que hay dentro.

| Estado | Cuándo | Qué transmite |
|---|---|---|
| **Vacía** | 0 productos | Nevera abierta con la luz encendida y un cartón de *"hace frío aquí"* |
| **Casi vacía** | pocos productos | Se rasca el vidrio |
| **Surtida** | stock normal | Contento, estantes llenos |
| **Saturada** | mucho stock | Le cuesta cerrar |
| **Alerta** | hay productos por vencer o agotados | Una gota de sudor, mirando los que se van a dañar |

### 11.3 Micro-copys dinámicos

**Dinámicos según lo amerite** — no un texto fijo por caso, sino que cambien según el
contexto (hora, qué falta, si es la primera vez, etc.):

| Situación | Copy |
|---|---|
| Nevera vacía | *"Aquí solo hay frío. Agrega algo."* |
| Stock bajo | *"Se nos está acabando el arroz."* |
| Todo al día | *"Todo en orden. Puedes cerrar la puerta."* |
| Preparar receta | *"Manos a la obra."* |
| IA falló | mensaje sutil, con carácter, sin tecnicismos |
| Modo inventario | el personaje contando |

### 11.4 Paleta — frío / calor

**El frío para la nevera, el calor para la acción.** No agrega ni un color nuevo: usa el
complementario del ámbar que ya existe.

| Rol | Valor | Origen |
|---|---|---|
| Acción / acento primario | gradiente `amber-600 → orange-500` | ya implementado en `pantry-view.tsx` |
| Acento del módulo | `text-amber-600 dark:text-amber-400` | ya implementado |
| **Frío (nevera)** | azul / cian muy suaves | **nuevo** — el complementario |
| Superficie | `bg-white dark:bg-gray-800/70`, radio `rounded-2xl` | ya implementado |
| Fila | `rounded-xl`, altura objetivo 56px | ya implementado |
| Título | `text-[15px] font-semibold` | ya implementado |
| Metadato | `text-[11px]` | ya implementado |
| Badge de alerta | `text-[10.5px] font-semibold` | ya implementado |

**Cápsulas de alerta:**

| Cápsula | Clases |
|---|---|
| Vencido / Agotado | `bg-red-50 text-red-600 dark:bg-red-950/40` |
| Vence pronto | `bg-orange-50 text-orange-600` |
| Stock bajo / Se acaba | `bg-amber-50 text-amber-600 dark:bg-amber-950/40` |
| Sin usar | `bg-gray-100 text-gray-500 dark:bg-gray-800` |

**Paleta de categorías:** reutilizar los 9 colores ya definidos en `pantry-view.tsx` (sky,
red, green, yellow, amber, cyan, pink, orange, gray, con variante dark). Ya están probados en
claro y oscuro.

### 11.5 Qué tomar de SoftList y qué descartar

**Tomar** (detalle en el doc de referencia, §8):

- Estructura de información: fila con icono/imagen + nombre + una línea de detalle + estado a
  la derecha.
- El área táctil del checkbox es el contenedor, no el widget.
- El hint vive en el `TextInputLayout`, no en el input (evita doble hint flotante).
- Las cabeceras de grupo **derivadas en render**, no persistidas como filas espurias
  (SoftList las guarda como `TIPO=1` y genera separadores fantasma).

**Descartar** (doc de referencia, §8.7):

- Los tres acentos compitiendo (verde `#12824f` + azul `#1976d2` + teal `#00796b`).
- La fila con hasta 9 fragmentos de texto en la segunda línea.
- Los dos indicadores de cupón simultáneos.
- La mezcla de px/dp/sp sin criterio (27px de iconos junto a `textAppearance`).
- La fila seleccionada en verde sobre fondo `#fafafa`.
- Los 13 ajustes visuales conmutables.
- El drawer de 13 destinos.
- Las imágenes BLOB y los bitmaps solo-hdpi.
- Los dos layouts por pantalla (`X` y `X_2`): la deuda de una migración a medias.

### 11.6 Ajustes del módulo

Reducidos a **3** (contra los 13 de SoftList):

1. **Agrupar por** categoría / ubicación.
2. **Mostrar precios** en la lista.
3. **Mostrar agotados** siempre / solo al filtrar.

Colocados en el **menú lateral** (ícono de hamburguesa). Organización final: pendiente.

---

## 12. Backend

### 12.1 Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/pantry` | lista + `deficit`, `isLow`, `isStale`, `expirationWarning` |
| `POST` | `/api/pantry` | crear con parámetros (vía 1) |
| `PATCH` | `/api/pantry/[id]` | editar |
| `DELETE` | `/api/pantry/[id]` | soft delete (`isActive = false`) |
| `POST` | `/api/pantry/[id]/adjust` | ajuste manual → `PantryMovement` (`adjust`) |
| `POST` | `/api/pantry/[id]/consume` | consumo → `PantryMovement` (`out` / `waste`) |
| `POST` | `/api/pantry/restock-list` | generar lista desde los faltantes (§4.6) |
| `GET/POST` | `/api/shopping-lists` | listas |
| `POST` | `/api/shopping-lists/[id]/confirm` | **confirmación (parcial, ya existe → extender)** |
| `POST` | `/api/shopping-lists/[id]/reverse` | **Reversar**: inversa de todos los movimientos + reabre la lista |
| `DELETE` | `/api/shopping-lists/[id]?mode=history` | elimina **solo el registro** del histórico |
| `DELETE` | `/api/shopping-lists/[id]?mode=full` | **reversa + elimina** |
| `GET` | `/api/history` | histórico compacto |
| `GET` | `/api/history/[id]` | tiquete |
| `GET/POST` | `/api/recipes` | recetas |
| `POST` | `/api/recipes/generate` | generar con IA |
| `POST` | `/api/recipes/[id]/cook` | "A preparar" (modos A/B/C) |
| `GET/PUT` | `/api/dietary-profiles` | perfiles alimenticios |
| `POST` | `/api/ai/recipe` | **proxy server-side a FreeLLMAPI** (§7.2) |

### 12.2 Cambios al endpoint `confirm` existente

El actual ya hace la vía 2 correctamente. Se extiende:

1. **Escribir `PantryMovement`** en vez de `increment` directo — todo al ledger.
2. **Escribir `PriceHistory`** en cada movimiento `in`.
3. **Auto-match por `nameNormalized`** antes de crear un `PantryItem` nuevo.
4. **Heredar `category` y `unit`** de la línea (no forzar `"other"`).
5. **Aplicar `unitWeightFactor`** al sumar.
6. **`minMode` por producto**, no global.
7. **Soportar confirmación parcial**: `confirmedQuantity` acumulable, `status`
   `partially_confirmed`, crear `PantryListConfirmation`.
8. **Descuento total por confirmación** (fijo o porcentual).

### 12.3 Reglas de negocio críticas

1. **El stock nunca se escribe directo.** Siempre `PantryMovement` + actualización en la misma
   transacción.
2. **El mínimo nunca baja automáticamente** (solo sube si el usuario lo pide).
3. **Un descuento total es por tienda/confirmación**, nunca repartido.
4. **Reversa es idempotente**: si ya está reversada, el botón queda deshabilitado y el
   endpoint rechaza una segunda reversa.
5. **La reversa y la eliminación operan sobre una confirmación concreta**, no sobre la lista
   entera. Una lista dividida entre tiendas se deshace parcial por parcial.
6. **Eliminar del historial no toca nada financiero** — solo el registro. Si quiere borrar los
   movimientos, debe reversar primero (o elegir "reversar y eliminar todo").
7. **Reversar no borra**: deja la lista editable y el registro visible en el histórico.
8. **La palabra del usuario gana sobre la IA** siempre.

---

## 13. Plan de implementación

### Fase 0 — Cimientos (sin UI) ✅ COMPLETADA

- [x] Migración Prisma en las **3 variantes de esquema** (base, postgres, sqlite) y aplicada
      a la base: `PantryItem` (+9 campos, `@@unique`, índice), `PantryMovement` (+5 campos,
      índice `[userId, occurredAt]`), `PriceHistory` (+2 campos e índice compuesto),
      `ShoppingList` (+4 campos), `ShoppingListItem` (+9 campos), `Recipe` (+7 campos),
      `RecipeIngredient` (+3 campos).
- [x] Modelos nuevos: **`PantryListConfirmation`** (confirmaciones parciales por tienda),
      **`PantryMealLog`** (bitácora de "preparé esta receta", modo A), **`HealthCondition`**
      (padecimientos con origen) y **`DietaryProfile`** (tres niveles de restricción).
- [x] `enum PantryMovementType` (`in` · `out` · `adjust` · `waste`).
- [x] Backfill idempotente `scripts/backfill-pantry-normalized.mjs` — ejecutado; resolvió el
      riesgo de que la restricción única colapsara filas (`LECHE` y `HUEVO` compartían
      `unit`, así que ambas nacían con `nameNormalized = ""`).
- [x] `src/lib/pantry/names.ts` + **21 tests** — `normalizeName`, `searchKey`, `isSameName`,
      `matchExistingProduct`.
- [x] `src/lib/pantry/pricing.ts` + **41 tests** — `lineAmount`, `applyTotalDiscount`,
      `roundMoney` (HALF_UP a 2 decimales), `allocateProportionally` (resto mayor),
      `normalizePercent`.
- [x] `src/lib/pantry/units.ts` + **32 tests** — catálogo de 14 unidades, `convertQuantity`,
      `defaultMultiplyQuantity` (g/ml ⇒ no multiplica), `unitLabel`.
- [x] Registro en `src/lib/data-registry.ts` (respaldo/sync) y en el plan de
      `scripts/migrate-sqlite-to-postgres.mjs`.
- [x] Verificado: **420 tests pasan** (94 nuevos), `tsc --noEmit` limpio, `eslint` limpio.

### Fase 1 — Nevera (vía 1) ✅ COMPLETADA

- [x] **Endpoints**: `GET`/`POST /api/pantry` (con filtros por cápsula, ubicación,
      categoría y búsqueda; guardia de duplicados que devuelve 409 con el existente),
      `GET`/`PUT`/`DELETE /api/pantry/[id]`, `POST /api/pantry/[id]/adjust`,
      `POST /api/pantry/[id]/consume`, `POST /api/pantry/restock-list`.
- [x] **Ledger centralizado**: `applyMovement` es el único punto que cambia
      `PantryItem.quantity`, y siempre crea el `PantryMovement`. El stock se acota a 0
      (el inventario físico no puede ser negativo).
- [x] **`evaluateStock()`** + **30 tests**: cápsulas con prioridad de gravedad
      (vencido > vence pronto > agotado > bajo > se acaba > sin usar), déficit,
      objetivo efectivo, días a vencimiento y días sin uso.
- [x] **`resolveLinePrice()`** + **15 tests**: precio real cuando la tienda cobra en otra
      unidad (kg ↔ g ↔ lb), con el precio calculado sobre la cantidad completa y no la
      redondeada.
- [x] **UI de la Nevera**: `nevera-view.tsx` (agrupación por lugar o categoría, orden por
      gravedad dentro del grupo, filtros en chips de una sola fila, voz del personaje
      dinámica, generación de lista de faltantes).
- [x] **Modo inventario** (`nevera-recount.tsx`): hoja inferior agrupada por ubicación,
      `−`/`+` en línea, guardado **optimista** (contar no requiere botón de guardar).
- [x] **Formulario** extendido: ubicación, mínimo, objetivo, unidad de precio con aviso de
      conversión, notas.
- [x] **Baja lógica** en `DELETE` (conserva movimientos e historial de precios).
      `?hard=1` borra de verdad, pero **se niega si hay historial**.
- [x] `PUT` **ignora `quantity`** a propósito y lo avisa: la cantidad solo cambia por el ledger.
- [x] **`unit-converter.tsx` refactorizado** para usar el catálogo compartido (antes tenía
      sus propias tablas de conversión, que podían discrepar del motor de precios).
- [x] Eliminados los componentes obsoletos `pantry-view.tsx` y `pantry-item-card.tsx`.
- [x] **Smoke test contra la base real** (`scripts/smoke-nevera.mjs`): 25 comprobaciones —
      alta con movimiento inicial, ajuste, consumo, merma, acotado a 0, unidad de precio,
      restricción única, baja lógica y lista de reposición.
- [x] Verificado: **465 tests pasan** (45 nuevos), `tsc --noEmit` limpio, `eslint` limpio,
      **`next build` exitoso** con las 5 rutas registradas.

### Fase 2 — Mercado (lista)

- [ ] Lista estilo papelito: añadir, editar, precio unitario, cantidades, check de carrito.
- [ ] Dos totales.
- [ ] Descuento por producto y total.
- [ ] Tiendas (lista de tiendas ya creadas).

### Fase 3 — Confirmación

- [ ] Extender `confirm`: movimientos, `PriceHistory`, auto-match, categoría/unidad heredadas.
- [ ] Marcar lista completa o productos sueltos.
- [ ] Pago: cuenta o tarjeta de crédito (patrón del módulo Transporte).
- [ ] **Confirmación parcial** (una lista, varias tiendas).
- [ ] `PantryListConfirmation` + descuento por confirmación.

### Fase 4 — Historial

- [ ] Vista compacta + tiquete desplegable.
- [ ] Botón **Reversar** (reabre la lista; deshabilitado si ya está reversada).
- [ ] Botón **Eliminar** con las dos opciones (solo registro / reversar + eliminar).
- [ ] Reversa idempotente con protección de doble reversa.

### Fase 5 — Stock bajo → lista

- [ ] `restock-list` con cantidad faltante y último precio.
- [ ] Marca de stock deshabilitada en listas generadas.
- [ ] Aviso de producto ya existente en stock.

### Fase 6 — Perfiles y Salud

- [ ] `HealthCondition` + flujo medicamento → IA pregunta → confirma.
- [ ] `DietaryProfile` con los tres niveles (dura / blanda / excepción).
- [ ] Perfiles visitantes.
- [ ] UI de Perfiles con activación.

### Fase 7 — Recetas

- [ ] Proxy `/api/ai/recipe`.
- [ ] Base de 20–30 recetas colombianas.
- [ ] Generación, guardado, "para más tarde".
- [ ] Detección de disponibilidad → "A preparar" → modos A/B/C.
- [ ] Escalar (comensales) y validar (perfiles) por separado.
- [ ] Fallbacks de IA.

### Fase 8 — Pulido visual

- [ ] Personaje de la nevera con sus 5 estados.
- [ ] Micro-copys dinámicos.
- [ ] Paleta frío/calor.
- [ ] Estados vacíos con carácter.
- [ ] Animaciones y transiciones.
- [ ] Ajustes del módulo (3) en el menú lateral.

### Fase 9 — Reportes (opcional)

- [ ] Con `PriceHistory` poblado: variación de precio, gasto por categoría, comparación entre
  tiendas.

---

## 14. Decisiones cerradas

Registro de lo aprobado, para trazabilidad:

| Tema | Decisión |
|---|---|
| Nombre | **Nevera** (decidido) |
| Navegación | **5 tabs**: Nevera · Mercado · Recetas · Perfiles · Historial |
| Vías de alimentación del stock | **3**: manual · lista confirmada · receta |
| Compra dividida | **Una sola lista que se salda**; cada confirmación registra sus movimientos |
| Histórico | Se **individualiza por confirmación** (tienda · fecha · valor); reversa y eliminación operan sobre esa parcial |
| Descuento total | **Por tienda/confirmación**, fijo **o** porcentual |
| Umbral de stock bajo | Default en el **primer registro**, editable, actualizable desde la lista. Nunca baja solo |
| Consumo | **Manual** + descuento desde recetas |
| Reversa | **Dos botones**: *Reversar* (corrige, reabre la lista, no borra) y *Eliminar* (elige entre solo el registro o reversar + borrar todo) |
| Precios | Se guardan y **actualizan**; alimentan las siguientes listas |
| Estilo | **Opción B**: personaje y micro-copys juguetones, interfaz limpia |
| Mensajes | **Dinámicos** según el contexto |
| Alertas | **Cápsulas**, máximo una por producto, con filtros en chips |
| IA | **Siempre activa**; si falla, mensaje sutil + internet + receta base |
| Proxy de IA | **Obligatorio server-side** (las credenciales no salen al cliente) |
| "A preparar" | Modo **C** principal, modo **A** disponible (no toca inventario) |
| Escalar vs. validar | **Separados**: los perfiles no escalan |
| Ajustes | **3**, en el menú lateral (organización pendiente) |
| Encargo de diseño | *"Bonita, llamativa, intuitiva, que provoque usarla"* |

---

## 15. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| **Doble reversa** descuadra el balance | El botón *Reversar* queda **deshabilitado** cuando la compra ya está reversada (`reversedAt`) |
| **Duplicar productos** por mayúsculas/acentos | `nameNormalized` + `@@unique` (SoftList falla en esto) |
| **API key filtrada** en el bundle | Proxy server-side obligatorio |
| **La IA prohíbe** lo que solo es sugerencia | Tres niveles: dura / blanda / excepción; el usuario gana |
| **Saturar la fila** con badges | Máximo una cápsula por producto, la más grave |
| **Recetas que no se pueden preparar** por un comensal | Escalar y validar separados + versión adaptada con IA |
| **Lista generada** con demasiados ítems | Solo entran los que tienen `minStock` o `targetQuantity` definido |
| **La IA falla** y la experiencia se rompe | Tres capas: IA → internet → receta base |
| **Precios obsoletos** en listas generadas | `PriceHistory` se actualiza en cada confirmación |
| **El módulo se siente pesado** | 5 tabs con responsabilidad única; 3 ajustes; una cápsula por fila |
