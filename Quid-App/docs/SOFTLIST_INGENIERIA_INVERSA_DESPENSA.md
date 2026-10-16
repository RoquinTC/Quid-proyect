# SoftList 2.8.3 — Ingeniería inversa completa y plan de adaptación al módulo Despensa de Quid

> Documento de análisis técnico y de diseño. Fuente: `F:\rea-targets\SoftList\SoftList.apk`
> (12.592.155 bytes) — paquete `br.com.ridsoftware.shoppinglist`, versionCode 158,
> versionName **2.8.3**, minSdk 23, targetSdk 36, compileSdk 36.
> Análisis **estático, sin ejecución del APK**: DEX decompilado con JADX 1.5.6, recursos
> binarios decodificados con el decodificador de recursos de JADX y parsers propios.
>
> Fecha de análisis: sesión actual. Todo dato no verificable se marca explícitamente.

---

## 0. Resumen ejecutivo

### 0.1 Qué es SoftList

SoftList es una **app Android nativa (Java + Room/SQLite + AndroidX/Material Components)** de
listas de compras de supermercado, hecha en Brasil, con 316 productos y 12 categorías
pre-cargados, multi-idioma (≈115 locales), multi-tienda, historial de compras y reportes.
No es Flutter, no es React Native, no usa Compose: es Views XML clásicas con
`DrawerLayout` + `NavigationView`.

### 0.2 Hallazgo crítico para tu módulo

**SoftList NO tiene inventario ni stock.** Se buscó en las tres fuentes disponibles:

| Fuente | Búsqueda | Resultado |
|---|---|---|
| `resources.arsc` (pool global, 20.376 strings) | `estoque`, `inventário`, `despensa`, `stock`, `mínimo`, `validade`, `repor` | **0 coincidencias de dominio** |
| 120 clases Java propias (`br.com.ridsoftware.shoppinglist.**`) | mismos términos | **0 coincidencias** |
| Esquema Room (22 tablas) | columna de cantidad/existencia/umbral | **ninguna existe** |

La única aparición de `stock` es dentro de nombres de productos del catálogo semilla
(`"Chicken Stock Cubes"`, `"Meat Stock Cubes"`, `"Vegetable Stock Cubes"` = caldos).

**Consecuencia práctica:** lo que vas a "reutilizar" de SoftList es su **modelo de catálogo,
su motor de precios y su UX de lista**, más un puñado de mecánicas de reposición
(`REPOSICIONAR`) que son exactamente el puente hacia tu nevera virtual. El **stock real
(unidades en casa, umbral mínimo, objetivo, consumo) hay que diseñarlo en Quid** — y de hecho
ya está a medio hacer en tu esquema (`PantryItem.minStock`, `targetQuantity`,
`PantryMovement`). La sección 7 de este documento es ese diseño.

### 0.3 Lo que sí vale la pena copiar de SoftList

1. **Normalización de nombres** para deduplicar catálogo (algoritmo exacto, §2.4).
2. **Motor de precio de línea**: `cantidad × valor` condicionado por la *unidad*
   (`MULTIPLICAR_VALOR`), impuesto y cupón con dos modalidades, redondeo bancario a 2
   decimales (§2.5). Es replicable tal cual y encaja con tu `Decimal` de Prisma.
3. **Unidad de cantidad ≠ unidad de precio** (`UNIDADE` vs `PRICE_UNIT_ID`) con conversión
   JSR-385 (§2.5.4). Resuelve el caso "compro 500 g pero el precio es por kg".
4. **Catálogo visual con join invertido**: cada producto sabe si ya está en la lista activa
   (§2.7). Es la mecánica de "reposición" de un toque.
5. **Historial como snapshot desnormalizado** (`HISTORY_PRODUCTS/CATEGORIES/UNITS/STORES`),
   que sobrevive a que borres un producto del catálogo (§2.8). Esto es lo que te permite
   tener historial de precios fiable aunque el producto se renombre o se inactive.
6. **Jerarquía de dos niveles** `CATEGORIES_LISTS → CATEGORIAS` y
   `PRODUCTS_LISTS → PRODUTOS`, y `STORE` como raíz de scope (§2.3, §2.6).
7. **Sistema de settings por SharedPreferences** con claves y defaults documentados (§2.9).

### 0.4 Lo que NO hay que copiar

- **BLOBs de imagen en la misma tabla SQLite** (`IMAGENS.IMAGEM BLOB`): en Postgres/Next.js
  esto es un antipatrón. Usa URLs/almacenamiento de objetos.
- **Tablas espejo de historial con 4 FKs**: en Prisma se resuelve con `String` copiado, sin
  FKs, y mucho menos código.
- **Contadores de sincronización** (`SEQUENCIAL`, `SINCRONIZAR`, `ID_GLOBAL`): solo existen
  porque SoftList sincroniza con un servidor propietario. Tu app es server-first.
- **Cuentas locales + cuentas cloud** (`CONTAS_USUARIOS` con `_id = 0` "local"): tu app ya
  tiene NextAuth.
- **`MULTIPLICAR_VALOR` a nivel de unidad** como *único* mecanismo: es confuso (una unidad
  global decide si toda la matemática del ítem multiplica). En Quid conviene un campo
  explícito por ítem/producto más un default por unidad (§7.6).

---

## 1. Identidad, empaquetado y superficie de la app

### 1.1 Datos del APK

| Dato | Valor |
|---|---|
| Paquete | `br.com.ridsoftware.shoppinglist` |
| versionName / code | `2.8.3` / `158` |
| minSdk / targetSdk / compileSdk | 23 / 36 / 36 |
| Arquitecturas nativas | solo `libdatastore_shared_counter.so` (arm64-v8a, armeabi-v7a, x86, x86_64) |
| DEX | `classes.dex`, `classes2.dex`, `classes3.dex` |
| Clase Application | `br.com.ridsoftware.shoppinglist.MyApplication` |
| Actividad launcher | `br.com.ridsoftware.shoppinglist.StartActivity` (exported, `configChanges=0x4a0`) |
| Actividad principal | `MainActivity` → `DrawerLayout` + `ItensListaFragment` |
| `appComponentFactory` | `androidx.core.app.CoreComponentFactory` |
| `enableOnBackInvokedCallback` | `true` |
| `allowBackup` / `supportsRtl` | `true` / `true` |
| Base de datos | Room/SQLite, `identity_hash = 5063aa1a86b1364b55a3b94f83a290b0`, 22 tablas |
| Billing | Google Play Billing `8.0.0` (`com.android.billingclient`) |
| Push / analytics | Firebase Messaging, Firebase Analytics, Google Play Services, AdMob |
| Crash/observabilidad | Firebase Crashlytics probablemente (`DebugProbesKt.bin` = kotlinx-coroutines debug) |

### 1.2 Permisos declarados (todos)

`ACCESS_NETWORK_STATE`, `INTERNET`, `POST_NOTIFICATIONS`, `WRITE_EXTERNAL_STORAGE`
(legacy, para backup/restauración en SD), `READ_CONTACTS` (para *compartir lista* con
contactos), `C2DM RECEIVE`, `WAKE_LOCK`, `VIBRATE`, `CAMERA`, `BILLING`,
`RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`,
`ACCESS_ADSERVICES_ATTRIBUTION`, `ACCESS_ADSERVICES_AD_ID`,
`BIND_GET_INSTALL_REFERRER_SERVICE`, `READ_GSERVICES`, y el permiso propio
`br.com.ridsoftware.shoppinglist.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.

Features opcionales (`required=false`): cámara frontal/trasera, autofocus, flash, wifi,
landscape.

### 1.3 Inventario de actividades (superficie funcional real)

Extraído del `AndroidManifest.xml` decodificado. **71 activities propias** + 12 de
terceros (cropper, ZXing `CaptureActivity`, billing, Firebase Auth). Las propias del dominio son:

| Actividad | Función |
|---|---|
| `StartActivity` | splash/arranque, decide si pide cuenta o va al main |
| `MainActivity` | contenedor del drawer; embebe `ItensListaFragment` (la lista activa) |
| `cart.CartActivity` | el "carrito": la misma lista filtrada por `CHECADO=1` |
| `itens.ItemActivity` | **el editor de ítem — la pantalla más compleja (3.024 líneas Java)** |
| `itens.SearchItensListaActivity` | búsqueda dentro de la lista (search framework) |
| `painelinclusao.PainelInclusaoActivity` | panel de inclusión rápida: barcode o voz |
| `listas.ListasActivity` | gestor de listas (crear, duplicar, reordenar, borrar) |
| `listas.ListaActivity` | editor de una lista (nombre, tienda, mostrar imágenes) |
| `catalogo_produtos.CatalogoProdutosActivity` | **catálogo visual por categoría, "añadir de un toque"** |
| `catalogo_produtos.ProductsCatalogActivity` | variante del catálogo (label de prueba `"Teste"`) |
| `produtos.ProdutosListaActivity` | lista de productos del catálogo (con categorías) |
| `produtos.ProdutoActivity` | editor de producto (nombre, precio, unidades, categoría, foto, código) |
| `produtos.ProdutosImageSearchActivity` | reutilizar la imagen de otro producto |
| `categorias.CategoriasListaActivity` | gestor de categorías (crear/editar/borrar/reordenar) |
| `categorias.CategoriaActivity` | editor de categoría |
| `categorias.OrderCategoriesListActivity` | **orden de categorías específico por tienda (drag)** |
| `categories_lists.CategoriesListsActivity` / `CategoriesListActivity` | listas de categorías (definición) |
| `products_lists.ProductsListsActivity` / `ProductsListActivity` | listas de productos (definición) |
| `unidades.UnidadesListaActivity` / `unidades.UnidadeActivity` | gestor y editor de unidades |
| `store.StoresActivity` / `StoreListActivity` / `StoreActivity` | tiendas: gestión y edición |
| `store.SelectStoreActivity` / `SelectStoreListActivity` | selector de tienda activa |
| `store_history.StoreHistoryListActivity` / `StoreHistoryActivity` | tiendas archivadas/históricas |
| `product_store_price.ProductStorePriceListActivity` | **precios recordados por tienda** |
| `historico.HistoricoListaActivity` | historial de compras (cabeceras) |
| `historico.ItensHistoricoActivity` | líneas de un historial |
| `historico.ItemHistoryActivity` | historial de un producto |
| `history_reports.*` (9 actividades) | reportes: gasto total, variación de precio, comparación |
| `history_statistics.HistoryStatisticsActivity` (+Help, +Youtube) | estadísticas y onboarding del módulo |
| `barcode.BarcodeItemListActivity` / `BarcodeProductListActivity` / `BarcodeProductActivity` | escaneo y vinculación |
| `imagens.InternetImageSearchActivity` / `InternetImageSearchDetailActivity` | búsqueda de imágenes en internet |
| `softlistcloud.SoftListCloudActivity` | venta/gestión de la nube |
| `premium.PremiumActivity` / `PremiumDetailActivity` | venta de premium |
| `usuario.LoginActivity`, `CriarContaActivity`, `AlterarSenhaActivity`, `AdicionarContaActivity`, `ResetarSenhaActivity` | cuentas |
| `contas.ContasActivity` / `ContasListaActivity` | gestión de cuentas |
| `listas_recebidas.ListasRecebidasActivity`, `ListasRecebidasPorContaActivity`, `EnviarListaActivity`, `ItensListaRecebidaActivity` | compartir/recibir listas |
| `settings.SettingsActivity`, `LayoutSettingsActivity`, `SortSettingsActivity`, `MenuSettingsActivity`, `BarcodeSettingsActivity` | ajustes |
| `SobreActivity` | acerca de |
| `wearable.ListenerService` (+ `CheckWearOsNetworkWorker`) | soporte Wear OS |
| `webservices.WSService`, `ServiceReceberListas`, `ServiceContasUsuarios` | servicios de sync |
| `database.DatabaseProvider` | **ContentProvider** con `multiprocess=true` (acceso SQLite cross-process) |
| `gcm.MyGcmListenerService` | notificaciones push |

Actividad externa relevante: `com.journeyapps.barcodescanner.CaptureActivity`
(ZXing embebido) — `screenOrientation=6`, `clearTaskOnLaunch=true`.

### 1.4 Menú lateral (navegación primaria)

`res/menu/navigation_drawer.xml`, en 4 grupos:

- **`database`**: Tiendas · Listas · Productos · Categorías · Listas de productos ·
  Listas de categorías · Unidades de medida · Historial de compras · Mis gastos
- **`cloud`**: Listas recibidas · SoftList Cloud
- **`premium`**: Premium
- **`help`**: Ajustes · Acerca de

El menú es **configurable**: `settings.MenuSettingsActivity`
(`R.string.enable_disable_menu_options`) permite al usuario ocultar/mostrar opciones del
drawer. La preferencia se persiste por clave de opción.

---

## 2. Modelo de datos completo (Room/SQLite, 22 tablas)

Transcrito literalmente desde `AppRoomDatabase_Impl.java` (DDL de creación). Es la fuente
de verdad del modelo de SoftList.

### 2.1 Convenciones transversales

Casi todas las tablas repiten 4 columnas de sincronización propietaria:

| Columna | Significado |
|---|---|
| `ID_GLOBAL` | id del registro en el servidor SoftList |
| `SINCRONIZAR` | `INTEGER NOT NULL DEFAULT 1` — si debe subirse |
| `SEQUENCIAL` | contador monótono **por usuario** en `TABELAS_SINCRONIZACAO` (marca de versión para resolución de conflictos) |
| `USUARIO_ID` | FK a `CONTAS_USUARIOS(_id)` con `ON DELETE CASCADE` |

Además: `ORDEM` (orden manual dentro de su grupo), `PADRAO` (fila protegida/no borrable),
`ATIVO` (soft-delete), `VISIVEL`, `SISTEMA`.

**Traducción a Quid:** `ID_GLOBAL`, `SINCRONIZAR` y `SEQUENCIAL` son ruido. Lo que sí
importa conceptualmente es `ORDEM`, `PADRAO`, `ATIVO` y `VISIVEL`, que reaparecen en el
diseño de la §7.

### 2.2 DDL íntegro

```sql
-- Cuentas de usuario (0 = cuenta local "Meus dados")
CREATE TABLE CONTAS_USUARIOS (
  _id INTEGER, NOME TEXT, EMAIL TEXT, SENHA TEXT, IDIOMA TEXT,
  RECEBER_LISTAS INTEGER DEFAULT 1, RECEBER_NOTIFICACAO INTEGER DEFAULT 0,
  PRONTA_PARA_UTILIZACAO INTEGER DEFAULT 0, PRIMEIRA_CARGA_LISTAS_RECEBIDAS INTEGER DEFAULT 0,
  DATA_SINCRONIZACAO INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 0, CREDENTIALS_STATUS INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(_id));

-- Imágenes (bytes dentro de SQLite)
CREATE TABLE IMAGENS (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, IMAGEM BLOB, ID_UNICO TEXT, SIZE INTEGER,
  IMAGEM_PADRAO INTEGER DEFAULT 0, ID_GLOBAL INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 1, USUARIO_ID INTEGER,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IMAGENS_IDX ON IMAGENS (USUARIO_ID, ID_UNICO);

-- Nivel 1 de categorías: la DEFINICIÓN (plantilla)
CREATE TABLE CATEGORIES_LISTS (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, NAME TEXT NOT NULL, NORMALIZED_NAME TEXT NOT NULL,
  ORDEM INTEGER NOT NULL DEFAULT 1, ID_GLOBAL INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 1, USUARIO_ID INTEGER NOT NULL, SEQUENCIAL INTEGER,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE);

-- Nivel 1 de productos: la DEFINICIÓN, apunta a una lista de categorías
CREATE TABLE PRODUCTS_LISTS (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, NAME TEXT NOT NULL, NORMALIZED_NAME TEXT NOT NULL,
  ORDEM INTEGER NOT NULL DEFAULT 1, CATEGORIES_LIST_ID INTEGER NOT NULL, ID_GLOBAL INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 1, USUARIO_ID INTEGER NOT NULL, SEQUENCIAL INTEGER,
  FOREIGN KEY(CATEGORIES_LIST_ID) REFERENCES CATEGORIES_LISTS(_id) ON DELETE RESTRICT,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE);

-- Nivel 2 de categorías: las categorías REALES del usuario, dentro de una lista de categorías
CREATE TABLE CATEGORIAS (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, NOME TEXT, VISIVEL INTEGER DEFAULT 1,
  PADRAO INTEGER DEFAULT 0, ORDEM INTEGER DEFAULT 1, ID_GLOBAL INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 1, USUARIO_ID INTEGER, SEQUENCIAL INTEGER,
  CATEGORIES_LIST_ID INTEGER,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE,
  FOREIGN KEY(CATEGORIES_LIST_ID) REFERENCES CATEGORIES_LISTS(_id) ON DELETE CASCADE);

-- Unidades de medida
CREATE TABLE UNIDADES (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, NOME TEXT, PADRAO INTEGER DEFAULT 0,
  MULTIPLICAR_VALOR INTEGER DEFAULT 1, ORDEM INTEGER DEFAULT 1, ID_GLOBAL INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 1, USUARIO_ID INTEGER, SEQUENCIAL INTEGER,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE);

-- Catálogo de productos
CREATE TABLE PRODUTOS (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, NOME TEXT, NOME_NORMALIZADO TEXT,
  UNIDADE INTEGER DEFAULT 1, PRICE_UNIT_ID INTEGER, CATEGORIA INTEGER DEFAULT 1,
  VALOR REAL, ATIVO INTEGER DEFAULT 1, FOTO BLOB, FOTO_PADRAO INTEGER DEFAULT 0,
  CATEGORIA_PADRAO INTEGER DEFAULT 0, ORDEM INTEGER DEFAULT 1, SISTEMA INTEGER DEFAULT 0,
  ID_GLOBAL INTEGER, SINCRONIZAR INTEGER NOT NULL DEFAULT 1, IMAGEM_ID INTEGER,
  USUARIO_ID INTEGER, SEQUENCIAL INTEGER, PRODUCTS_LIST_ID INTEGER,
  OBSERVACAO TEXT NOT NULL DEFAULT '', used_at INTEGER,
  FOREIGN KEY(UNIDADE) REFERENCES UNIDADES(_id) ON DELETE RESTRICT,
  FOREIGN KEY(PRICE_UNIT_ID) REFERENCES UNIDADES(_id) ON DELETE RESTRICT,
  FOREIGN KEY(CATEGORIA) REFERENCES CATEGORIAS(_id) ON DELETE RESTRICT,
  FOREIGN KEY(IMAGEM_ID) REFERENCES IMAGENS(_id) ON DELETE RESTRICT,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE,
  FOREIGN KEY(PRODUCTS_LIST_ID) REFERENCES PRODUCTS_LISTS(_id) ON DELETE CASCADE);

-- Tiendas / supermercados
CREATE TABLE STORE (
  NAME TEXT NOT NULL, NORMALIZED_NAME TEXT NOT NULL, TYPE INTEGER NOT NULL DEFAULT 1,
  ORDEM INTEGER NOT NULL DEFAULT 1, REQUIRED INTEGER NOT NULL DEFAULT 0,
  PRODUCTS_LIST_ID INTEGER, CUSTOMIZED_CATEGORY_SORT_ORDER INTEGER NOT NULL DEFAULT 0,
  REMEMBER_PRICES_FROM_THIS_STORE INTEGER NOT NULL DEFAULT 0,
  _id INTEGER PRIMARY KEY AUTOINCREMENT, sort_order INTEGER DEFAULT 1, ID_GLOBAL INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 1, USUARIO_ID INTEGER NOT NULL, SEQUENCIAL INTEGER,
  item_status INTEGER DEFAULT 1,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE,
  FOREIGN KEY(PRODUCTS_LIST_ID) REFERENCES PRODUCTS_LISTS(_id) ON DELETE NO ACTION);

-- Listas de compra (instancias)
CREATE TABLE LISTAS (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, NOME TEXT, ATIVA INTEGER DEFAULT 0,
  PADRAO INTEGER DEFAULT 0, ORDEM INTEGER DEFAULT 1, ID_GLOBAL INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 1, USUARIO_ID INTEGER, SEQUENCIAL INTEGER,
  STORE_ID INTEGER, SORT_ORDER INTEGER, SHOW_IMAGES INTEGER,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE,
  FOREIGN KEY(STORE_ID) REFERENCES STORE(_id) ON DELETE CASCADE);

-- Líneas de una lista  (LA TABLA CENTRAL)
CREATE TABLE ITENS_LISTA (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, LISTA_ID INTEGER, PRODUTO_ID INTEGER,
  UNIDADE INTEGER DEFAULT 1, QUANTIDADE REAL, CHECADO INTEGER, ORDEM INTEGER,
  VALOR REAL, CATEGORIA INTEGER DEFAULT 1, TIPO INTEGER, OBSERVACAO TEXT,
  FOTO_ALTERNATIVA BLOB, ID_GLOBAL INTEGER, SINCRONIZAR INTEGER NOT NULL DEFAULT 1,
  USUARIO_ID INTEGER, SEQUENCIAL INTEGER,
  HAVE_TAX INTEGER NOT NULL DEFAULT 0, TAX REAL NOT NULL DEFAULT 0,
  HAVE_COUPON INTEGER NOT NULL DEFAULT 0, COUPON REAL NOT NULL DEFAULT 0,
  COUPON_TYPE INTEGER NOT NULL DEFAULT 1, PRICE_UNIT_ID INTEGER,
  FOREIGN KEY(PRODUTO_ID) REFERENCES PRODUTOS(_id) ON DELETE NO ACTION,
  FOREIGN KEY(LISTA_ID) REFERENCES LISTAS(_id) ON DELETE CASCADE,
  FOREIGN KEY(UNIDADE) REFERENCES UNIDADES(_id) ON DELETE RESTRICT,
  FOREIGN KEY(CATEGORIA) REFERENCES CATEGORIAS(_id) ON DELETE RESTRICT,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE,
  FOREIGN KEY(PRICE_UNIT_ID) REFERENCES UNIDADES(_id) ON DELETE RESTRICT);

-- Códigos de barras (N por producto)
CREATE TABLE CODIGO_BARRAS (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, PRODUTO_ID INTEGER, CODIGO TEXT,
  ORDEM INTEGER DEFAULT 1, ID_GLOBAL INTEGER, SINCRONIZAR INTEGER NOT NULL DEFAULT 1,
  USUARIO_ID INTEGER, SEQUENCIAL INTEGER,
  FOREIGN KEY(PRODUTO_ID) REFERENCES PRODUTOS(_id) ON DELETE CASCADE,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE);

-- Tombstones de borrado (para sincronizar eliminaciones)
CREATE TABLE EXCLUSOES (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, TIPO INTEGER, ID_GLOBAL INTEGER,
  USUARIO_ID INTEGER, SEQUENCIAL INTEGER,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE);

-- ── Dimensión de HISTORIAL (desnormalizada, sobrevive al borrado del catálogo) ──
CREATE TABLE HISTORY_STORES   (_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  STORE_NAME TEXT NOT NULL DEFAULT '', ID_GLOBAL INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 1, USUARIO_ID INTEGER, SEQUENCIAL INTEGER, ...);
CREATE TABLE HISTORY_CATEGORIES (_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  CATEGORY_NAME TEXT NOT NULL DEFAULT '', ...);
CREATE TABLE HISTORY_PRODUCTS (_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  PRODUCT_NAME TEXT NOT NULL DEFAULT '', ...);
CREATE TABLE HISTORY_UNITS    (_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  UNIT_NAME TEXT NOT NULL DEFAULT '', ...);

-- Cabecera de una compra
CREATE TABLE HISTORICO (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, LISTA_ID INTEGER, DESCRICAO TEXT, DATA INTEGER,
  ORDEM INTEGER DEFAULT 0, SIMBOLO_MOEDA TEXT NOT NULL DEFAULT '', ID_GLOBAL INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 1, USUARIO_ID INTEGER, SEQUENCIAL INTEGER,
  TIMEZONE_ID TEXT NOT NULL DEFAULT '', TIMEZONE_OFFSET INTEGER NOT NULL DEFAULT 0,
  HISTORY_STORE_ID INTEGER,
  FOREIGN KEY(USUARIO_ID) REFERENCES CONTAS_USUARIOS(_id) ON DELETE CASCADE,
  FOREIGN KEY(HISTORY_STORE_ID) REFERENCES HISTORY_STORES(_id) ON DELETE CASCADE);

-- Líneas de una compra
CREATE TABLE ITENS_HISTORICO (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, HISTORICO_ID INTEGER, NOME_PRODUTO TEXT,
  QUANTIDADE REAL, UNIDADE TEXT, MULTIPLICAR_VALOR INTEGER NOT NULL DEFAULT 1, VALOR REAL,
  ORDEM INTEGER DEFAULT 0, TIPO INTEGER DEFAULT 0, ID_GLOBAL INTEGER,
  SINCRONIZAR INTEGER NOT NULL DEFAULT 1, USUARIO_ID INTEGER, SEQUENCIAL INTEGER,
  TAX REAL NOT NULL DEFAULT 0, COUPON REAL NOT NULL DEFAULT 0,
  COUPON_TYPE INTEGER NOT NULL DEFAULT 1,
  HISTORY_CATEGORY_ID INTEGER, HISTORY_PRODUCT_ID INTEGER, HISTORY_UNIT_ID INTEGER, ...);

-- Estado de UI persistido por usuario
CREATE TABLE list_filter (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, USUARIO_ID INTEGER, sort_mode INTEGER,
  key_id TEXT, filter_object BLOB, ...);
CREATE TABLE temporary_ids (
  _id INTEGER PRIMARY KEY AUTOINCREMENT, USUARIO_ID INTEGER NOT NULL,
  table_name TEXT NOT NULL, item_id INTEGER NOT NULL, ...);
```

Tablas adicionales creadas **solo por migración** (no en el DDL base), citadas en
`AppRoomDatabase.java`:

- `PRODUCT_STORE_PRICE(STORE_ID, PRODUCT_ID, PRICE, UNIT, PURCHASE_DATE, TIMEZONE_ID, TIMEZONE_OFFSET)`
  — memoria de precios por tienda.
- `CATEGORY_STORE_ORDER(STORE_ID, CATEGORY_ID, ORDEM)` — orden de categorías por tienda.
- `STORE_HISTORY(NAME, NORMALIZED_NAME, ORDEM, SINCRONIZAR, USUARIO_ID)` — tiendas archivadas.
- `LISTAS_RECEBIDAS` + `ITENS_LISTAS_RECEIDAS` (con `NOME_PRODUTO`, `NOME_UNIDADE`,
  `NOME_CATEGORIA`, `IMAGEM_ID_UNICO`, `PRICE_UNIT_NAME` textuales) — listas compartidas.
- `CONFIGURACOES(ROTACAO_TELA, LEMBRAR_PRECO, CAMPO_VALOR_FORMATACAO_AUTOMATICA,
  SIMBOLO_MOEDA, HABILITAR_ENTRADA_VOZ, HABILITAR_BARCODE)` — tabla legacy de settings
  (el grueso de los ajustes migró a SharedPreferences, §2.9).
- `TABELAS_SINCRONIZACAO` — contador `SEQUENCIAL` por usuario.

### 2.3 El eje del modelo: `STORE` como raíz de scope

Este es el descubrimiento estructural más importante y el que explica por qué la app tiene
"listas de productos" y "listas de categorías":

```
STORE ──PRODUCTS_LIST_ID──► PRODUCTS_LISTS ──CATEGORIES_LIST_ID──► CATEGORIES_LISTS
                                    │                                       │
                                    ▼                                       ▼
                                 PRODUTOS                               CATEGORIAS
                                    │
LISTAS ──STORE_ID──► STORE           │
   │                                 │
   └──ITENS_LISTA──► PRODUTO_ID ─────┘
```

- La **tienda activa** se guarda en SharedPreferences: `SELECTED_STORE` (y `SELECTED_LIST`
  guarda la lista activa **por tienda**).
- Todo el catálogo se filtra por la tienda activa: `PRODUTOS.PRODUCTS_LIST_ID = <store.PRODUCTS_LIST_ID>`.
- `C5408j` (helper de tienda) expone: `m25643h()` = tienda activa, `m25641f()` = su
  `PRODUCTS_LIST_ID`, `m25640e()` = su `CATEGORIES_LIST_ID`, `m25642g()` = flags de tienda.
- Consecuencia de diseño: **cada tienda puede tener su propio catálogo, sus propias
  categorías y su propio orden de categorías**. Es la feature *Shopping list by store*
  (premium). En tu app, la mayoría de usuarios no quiere 3 catálogos distintos; ver §7.4
  para una propuesta de versión simplificada.

**Triggers de integridad** (migración):
- `UPDATE_STORE_PRODUCTS_LIST_ID`: al cambiar `STORE.PRODUCTS_LIST_ID` **borra los ítems de
  las listas de esa tienda**.
- `CODIGO_BARRAS`: dos triggers de unicidad que **borran** cualquier fila que comparta
  `CODIGO` dentro de la misma lista de productos, o cualquier otro código del mismo
  producto, antes de INSERT/UPDATE (re-escanear un código lo mueve, no lo duplica).

---

## 3. Máquina de estados de una lista de compra

### 3.1 Ciclo de vida observado

```
[1] ListasActivity            crear / duplicar / reordenar / borrar listas
        │  (una lista puede ser PADRAO — la semilla — y ATIVA)
        ▼
[2] ItensListaFragment        la lista activa (TIPO=0 productos + TIPO=1 cabeceras)
        │  añadir por: (+) ItemActivity | catálogo | barcode | voz | panel rápido
        ▼
[3] Check de ítems            CHECADO = 1  (no se eliminan, no se salen del total general)
        │
        ▼
[4] CartActivity              vista filtrada: CHECADO = 1  (el "carrito")
        │
        ▼
[5] salvar_historico          snapshot → HISTORICO + ITENS_HISTORICO
        │                     (+ HISTORY_STORES/CATEGORIES/PRODUCTS/UNITS textuales)
        ▼
[6] history_reports / statistics   análisis sobre el histórico
```

### 3.2 Semántica del `CHECADO`

Confirmado en `ItensListaFragment.java`:

- Los ítems marcados **no se eliminan** y **sí entran en el total general**.
- Hay **dos totales**: el pie muestra el total **general** (todas las filas `TIPO=0`) y el
  total del **carrito** (solo `CHECADO=1`).
- Filtro del carrito: `LISTA_ID=? AND USUARIO_ID=? AND (TIPO=0 AND CHECADO=1)`
  (`CartListFragment.onCreateLoader`).
- `CROSS_OFF` (setting, default **1**) tacha visualmente el marcado.
- El catálogo/lista de productos **no oculta** ni marca los ya comprados: el catálogo hace
  `LEFT OUTER JOIN ITENS_LISTA` para saber si el producto ya está en la lista (§3.4).

### 3.3 Filas "cabecera" (`TIPO=1`) — separadores estructurales

`TIPO` en `ITENS_LISTA` tiene tres roles distintos:

| Valor | Rol | Se persiste | Cómo se crea |
|---|---|---|---|
| `0` | línea de producto real | **sí** | todo el flujo normal |
| `1` | **pseudo-fila cabecera** | **sí** | `C1226b.m6938i()` la recrea/borra al vaciar marcados |
| `2` / `3` | modo de entrada (voz / barcode) | **no** | extras `TIPO` de `ItemActivity`, `PainelInclusaoActivity` |

Dos formas de `TIPO=1`:
- **Cabecera de categoría**: `CATEGORIA` rellena, `CHECADO=0`, `QUANTIDADE=0`, `VALOR=0`,
  `ORDEM=0`, `UNIDADE=NULL`.
- **Divisor de "ya en el carrito"**: `CHECADO=1`, `CATEGORIA=NULL`, `UNIDADE=NULL`.

El listado principal excluye las cabeceras marcadas:
`NOT (ITENS_LISTA.TIPO = 1 AND ITENS_LISTA.CHECADO = 1)`.

**Traducción a Quid:** es una solución pragmática, no un buen modelo. En la §7 las
cabeceras se derivan en el render (agrupar por categoría) en vez de persistirse como filas
espurias — así se evita el bug clásico de "aparece un separador fantasma".

### 3.4 Catálogo de "un toque" (mecánica de reposición)

`CatalogoProdutosActivity` es la mecánica a copiar. Query exacta:

```sql
SELECT PRODUTOS._ID, PRODUTOS.NOME, IMAGENS.IMAGEM, PRODUTOS.CATEGORIA,
       PRODUTOS.UNIDADE, PRODUTOS.VALOR, coalesce(ITENS_LISTA._id, 0) AS ITEM_ID
FROM PRODUTOS
LEFT OUTER JOIN ITENS_LISTA
     ON (PRODUTOS._id = ITENS_LISTA.PRODUTO_ID
         AND LISTA_ID = <lista activa>
         AND PRODUTOS.USUARIO_ID = <usuario>)
LEFT OUTER JOIN IMAGENS
     ON (PRODUTOS.IMAGEM_ID = IMAGENS._id AND PRODUTOS.USUARIO_ID = <usuario>)
WHERE (PRODUTOS.CATEGORIA = <cat> OR <cat> = 0)
  AND PRODUTOS.PRODUCTS_LIST_ID = <products list de la tienda activa>
  AND PRODUTOS.ATIVO = 1
  AND PRODUTOS.USUARIO_ID = <usuario>
ORDER BY PRODUTOS.NOME_NORMALIZADO
```

El `coalesce(...,0) AS ITEM_ID` es la clave: **`ITEM_ID = 0` ⇒ el producto no está en la
lista** (se puede añadir); `ITEM_ID > 0` ⇒ ya está (se puede abrir para ajustar).

Añadir de un toque (`m19347K0`) inserta en `ITENS_LISTA`:

| Campo | Valor |
|---|---|
| `LISTA_ID` | lista activa |
| `PRODUTO_ID` | producto tocado |
| `UNIDADE` | unidad del **producto** |
| `QUANTIDADE` | **1** (constante) |
| `VALOR` | precio del **producto** |
| `ORDEM` | 1 |
| `CATEGORIA` | categoría del **producto** |
| `TIPO` | 0 |
| `CHECADO` | 0 |
| `OBSERVACAO` | `""` |

Y existe la bandera de flujo `REPOSICIONAR` (extra `Intent` booleano) que viaja de vuelta
desde el catálogo/editor: si es `true`, tras guardar se navega al **hermano** siguiente para
seguir capturando. Es el mecanismo de "captura en cadena" de SoftList.

### 3.5 Duplicar lista

`ListaActivity.m19877M0` copia la lista como **plantilla**:

```sql
INSERT INTO ITENS_LISTA (LISTA_ID, PRODUTO_ID, UNIDADE, PRICE_UNIT_ID, QUANTIDADE, VALOR,
                         HAVE_TAX, TAX, HAVE_COUPON, COUPON, COUPON_TYPE,
                         CHECADO, ORDEM, CATEGORIA, TIPO, OBSERVACAO, FOTO_ALTERNATIVA, USUARIO_ID)
SELECT <nuevaLista>, PRODUTO_ID, UNIDADE, PRICE_UNIT_ID, QUANTIDADE, VALOR,
       HAVE_TAX, TAX, HAVE_COUPON, COUPON, COUPON_TYPE,
       0, 1, CATEGORIA, TIPO, OBSERVACAO, FOTO_ALTERNATIVA, <usuario>
FROM ITENS_LISTA
WHERE LISTA_ID = <origen> AND TIPO = 0 AND USUARIO_ID = <usuario>
```

Observa: **`CHECADO` se resetea a 0 y `ORDEM` se normaliza a 1**, y se filtran las
cabeceras (`TIPO = 0`). Es exactamente la idea de "convertir una lista pasada en la lista
de la semana".

---

## 4. Anatomía del ítem y motor de precios

`ItemActivity` (3.024 líneas) es la pieza central. Recibe por extras:

| Extra | Tipo | Significado |
|---|---|---|
| `MODO` | int | `1` = nuevo, `2` = editar |
| `TIPO` | int | modo de entrada (`2` = voz, `3` = barcode); no se persiste |
| `ListaID` | long | lista destino |
| `ID` | long | id del ítem (modo 2) |
| `ORIGEM_EDICAO` | int | de dónde vino la edición (afecta el retorno) |
| `PERMITE_EXCLUIR` | bool | habilita borrar |
| `BARCODE` | string | código escaneado |
| `PRICE_UNIT_ID` | long | si viene, se usa el layout `activity_item_2` (con unidad de precio) |

Dos layouts: `activity_item` (MODO 1) y `activity_item_2` (cuando hay unidad de precio o
conversor de unidades activo). La anatomía visual del formulario está descrita en §8.5.

### 4.1 Campos del ítem

| UI | Columna | Notas |
|---|---|---|
| Nombre (autocomplete del catálogo) | → `PRODUTOS.NOME` o producto nuevo | `AutoCompleteTextView` |
| Cantidad | `QUANTIDADE` (REAL) | default **1.0** al insertar, **0.0** al editar |
| Unidad de cantidad | `UNIDADE` → `UNIDADES` | spinner obligatorio (`unidade_vazia` si no se elige) |
| Unidad de precio | `PRICE_UNIT_ID` | opcional, spinner **premium** |
| Valor | `VALOR` (REAL) | precio unitario o total, según §4.3 |
| Categoría | `CATEGORIA` → `CATEGORIAS` | spinner obligatorio (`categoria_vazia`) |
| Observación | `OBSERVACAO` | texto libre |
| Foto alternativa | `FOTO_ALTERNATIVA` BLOB | imagen por ítem, distinta a la del producto |
| Marcado | `CHECADO` | checkbox |
| Orden | `ORDEM` | manual |
| Impuesto | `HAVE_TAX` / `TAX` | diálogo `tax_dialog.xml` |
| Cupón | `HAVE_COUPON` / `COUPON` / `COUPON_TYPE` | diálogo `coupon_dialog.xml` |

### 4.2 `MULTIPLICAR_VALOR`: corrección importante

**No es un ajuste global ni una bandera por ítem.** Es una **columna de `UNIDADES`**
(`UNIDADES.MULTIPLICAR_VALOR INTEGER DEFAULT 1`), que el ítem hereda vía el join a su
unidad de cantidad. La UI es un checkbox en el editor de unidad
(`UnidadeActivity`: *"Multiplicar valor"*).

Semántica:
- `MULTIPLICAR_VALOR = 1` ⇒ el importe de la línea es `VALOR × QUANTIDADE`.
- `MULTIPLICAR_VALOR = 0` ⇒ el importe de la línea es `VALOR` (el valor ya es el total).

Semilla: `MULTIPLICAR_VALOR = 0` **solo** para las unidades `g` y `ml`; `1` para el resto.
Unidades nuevas nacen con `1` y `ORDEM = 100`.

**No hay listener de cambio de unidad**: cambiar la unidad no recalcula nada; el efecto es
solo en el cálculo del total en el momento de pintar.

### 4.3 Fórmula de importe de línea (exacta)

De `C1243s` / `C3442a`:

```
amt = MULTIPLICAR_VALOR == 1 ? round(VALOR * QUANTIDADE, 2) : VALOR

if HAVE_COUPON:
    if COUPON_TYPE == 1:            # valor fijo (absoluto)
        base = amt - COUPON
    else:                           # COUPON_TYPE == 2 · porcentaje
        base = amt - round(amt * COUPON, 2)
else:
    base = amt

if base > 0 and HAVE_TAX:
    total = base + round(base * TAX, 2)
else:
    total = base
```

Detalles confirmados:
- `TAX` y los cupones porcentuales se guardan como **fracción** (0.19 = 19 %). Los diálogos
  aceptan hasta 100 y dividen por 100.
- Redondeo: `BigDecimal.setScale(2, HALF_UP)`.
- `COUPON_TYPE`: `1` = fijo, `2` = porcentaje (etiquetas `R.string.fixed` / `R.string.percentage`;
  `CHECK(COUPON_TYPE > 0)` en el DDL).
- La misma fórmula está replicada como SQL en los reportes
  (`historico.HistoricoListaActivity`, `history_reports.C3442a`):

```sql
SUM(CASE WHEN COUPON_TYPE = 1 THEN
           CASE WHEN TOTAL - COUPON > 0
                THEN ROUND(TOTAL - COUPON, 2) + ROUND(ROUND(TOTAL - COUPON, 2) * TAX, 2)
                ELSE ROUND(TOTAL - COUPON, 2) END
         ELSE
           TOTAL - ROUND(TOTAL * COUPON, 2)
                 + ROUND(ROUND(TOTAL - ROUND(TOTAL * COUPON, 2), 2) * TAX, 2)
    END) AS TOTAL
```

### 4.4 Conversión de unidad de precio (JSR-385)

Cuando hay `PRICE_UNIT_ID`, la cantidad expresada en `UNIDADE` se **convierte** a la unidad
de precio con `javax.measure` (unit-api / JSR-385, `C6860i`). Ejemplo: `500 g` → `0.5 kg`.

Reglas:
- Si las unidades son **compatibles o iguales**, la conversión se aplica y se **fuerza
  `multiply = 1`**.
- Si son **incompatibles**, `multiply = 0` y `VALOR` se trata como el **total de la línea**.
- Requiere el ajuste **`UNIT_CONVERTER`** (default `false`, premium).

Esto resuelve: precio por kg, compra en gramos, precio por litro, compra en ml.

### 4.5 Defaults y validaciones del guardado

- Cantidad: `parse(text, 1.0)` en inserción, `parse(text, 0.0)` en edición.
- Categoría y unidad son obligatorias antes de guardar (toast `categoria_vazia` /
  `unidade_vazia`).
- Si el nombre del ítem **no existe** como producto (match exacto por `NOME`), se
  **auto-crea** el producto con: `NOME_NORMALIZADO = normalize(nombre).toLowerCase()`,
  `ATIVO = 1`, `ORDEM = 1`, y la unidad/categoría/valor del ítem.
- Si **existe**, se hace `UPDATE` del producto propagando unidad, categoría y observación;
  el `VALOR` solo se escribe si `LEMBRAR_PRECO` está activo o si es `> 0`.
- `used_at = ahora`, salvo que ya esté en la ventana `[ahora-30d, ahora-5h]`, en cuyo caso se
  fija a `ahora - 6h` (así la pestaña "usados recientemente" no se desordena). Ver §4.6.

### 4.6 `used_at` y "usados recientemente"

`used_at` marca el último uso del producto. La pestaña "recientes" del catálogo filtra
exactamente a la ventana `[ahora-30d, ahora-5h]` (`C0549h`). El truco de "si ya está en la
ventana, ponlo a ahora-6h" es un patrón anti-parpadeo que vale la pena copiar.

---

## 5. Catálogo semilla (el "estándar de fábrica")

La app siembra el catálogo de un usuario nuevo desde arrays de recursos
(`C3425c.m19492s / m19497x / m19496w`). Esto es **directamente reutilizable como
`seed` de categorías y unidades en Quid**.

### 5.1 Categorías (12, en el orden exacto de la semilla)

`R.array.categorias` → `CATEGORIAS`. El **índice 0 recibe `VISIVEL=0, PADRAO=1, ORDEM=0`**;
el resto `VISIVEL=1, PADRAO=0, ORDEM=<índice>`.

| # | Clave string | Nombre (en) | Traducción sugerida (es-CO) |
|---|---|---|---|
| 0 | `categoria_sem_categoria` | Uncategorised | Sin categoría |
| 1 | `categoria_bazar_e_limpeza` | Bazaar and cleaning | Aseo y limpieza |
| 2 | `categoria_bebidas` | Beverages | Bebidas |
| 3 | `categoria_carnes` | Meats | Carnes |
| 4 | `categoria_comidas_prontas_e_congelados` | Ready Meals and Frozen | Comidas listas y congelados |
| 5 | `categoria_frios_leites_e_derivados` | Cold cuts, Milk and Dairy Products | Lácteos y embutidos |
| 6 | `categoria_frutas_ovos_e_verduras` | Eggs, fruit and veg | Frutas, verduras y huevos |
| 7 | `categoria_higiene_pessoal` | Toiletries | Higiene personal |
| 8 | `categoria_importados` | Imported goods | Importados |
| 9 | `categoria_mercearia` | Grocery | Granos y abarrotes |
| 10 | `categoria_padaria_e_sobremesas` | Bakery and Deserts | Panadería y postres |
| 11 | `categoria_saude_e_beleza` | Health and Beauty | Salud y belleza |

### 5.2 Unidades

`MULTIPLICAR_VALOR = 0` **solo** para `g` y `ml`; `1` para el resto. `PADRAO = 1` solo en el
índice 0. `ORDEM = 1` para todas.

| Set | Valores (en orden) |
|---|---|
| `values` (default/inglés) | `Piece, oz, lb, gal, qt, Can, ml, L, kg, g, Box, Pack, Gallon, Bottle, Can, Package` |
| `values-pt-rBR` | `un, dz, ml, L, kg, g, Caixa, Embalagem, Galão, Garrafa, Lata, Pacote` |

Nota: el set inglés trae **duplicados** (`Can` dos veces). Es un descuido de la app, no un
patrón a copiar.

### 5.3 Productos semilla: 316 entradas

`R.array.produtos` tiene **316** entradas con nombre localizado, agrupadas por categoría
dentro de `R.array.imagens` (que también tiene 316 entradas y usa el marcador
`!CATEGORIA` seguido de la clave de categoría para delimitar grupos).

Grupos con imágenes precargadas (**10**): frutas/verduras/huevos, bazar y limpieza,
higiene personal, bebidas, abarrotes, lácteos y embutidos, carnes, panadería y postres,
comidas listas y congelados, sin categoría.

Muestra representativa (versión en inglés, orden real):

- **Frutas/verduras/huevos**: Avocado, Sweet pineapple, Zucchini, Pumpkin, Celery,
  Artichoke, Lettuce, Garlic, Plum, Banana, Asparagus, Olives, New potato, Red potato,
  Sweet potato, Aubergine, Beetroot, Broccoli, Onions, Chives, Carrots, Cherries,
  Coconut, Mushrooms, Cauliflower, Apricots, Spinach, Oranges, Lemon, Basil, Apple,
  Watermelon, Melon, Corn, Strawberries, Nectarines, Eggs, Cucumber, Pear, Peach,
  Peppers, Radishes, Cabbage, Rocket, Parsley, Tomato, Grapefruit, Grapes, Greens
- **Bazar y limpieza**: Bleach, Softener, Disinfectant, Detergent, Mop, Dish washing
  sponge, Paper Napkin, Lightbulb, Floor Cleaner, Glass cleaner, Soap Bar, Washing powder,
  Rubbish Bags, Aluminum Foil, Paper Towels, Air Purifier, Broom
- **Higiene personal**: Sanitary Towels, Conditioner, Cotton Buds, Shaving cream,
  Deodorant, Mouthwash, Toothbrush, Dental floss, Nappies, Hair Gel, Moisturiser,
  Razors, Toilet paper, Toothpaste, Soap, Shampoo
- **Bebidas**: Water, Tonic Water, Beer, Champagne, Gin, Isotonic, Liqueur, Soft Drink,
  Rum, Saké, Juice, Orange juice, White wine, Red Wine, Vodka, Whisky
- **Abarrotes**: Rice, Canned tuna, Oatmeal, Olive oil, Sugar, Baking soda, Biscuits,
  Crackers, Coffee, Cinnamon, Cereal, Chocolate powder, Tea, Cream, Vanilla extract,
  Breadcrumbs, Cornflour, Wheat flour, Beans, Yeast, Baking powder, Jelly, Granola,
  Ketchup, Condensed milk, Lentils, Macaroni, Mayonnaise, Peanut butter, Pancake mix,
  Honey, Popcorn corn, Soy sauce, Tomato sauce, Mustard, Oregano, Oil, Pickles, Pepper,
  Salt, Canned Sardines, Powdered Soups, Stock Cubes, Vinegar, Waffles
- **Lácteos/embutidos**: Cream Cheese, Yogurt, Milk, Soya Milk, Milk powder, Butter,
  Margarine, Baloney, Mozzarella, Parmesan, Parma Ham, Cheese, Salami, Sausages
- **Carnes**: Sirloin Steak, Tuna, Bacon, Steak, Prawns, Crab Meat, Minced Meat, Dried
  meat, Tenderloin, Pork Chop, Spareribs, Chicken thighs, Chicken, Sausage, Chicken
  breast, Turkey breast, Fish, Salmon, Sardines
- **Panadería/postres**: Cheesecake, Chocolate, Croissants, Candies, Donuts, Dried fruit,
  Nuts, Cashew nut, Ice Cream, Raisins, Bread, Brown bread, Hot Dog Buns, Hamburger Buns
- **Congelados**: Frozen Pizza
- **Sin categoría**: Cat Sand, Aspirin, Batteries, Paprika, Horseradish, Dog food,
  Cat food, Tofu, Tortillas, Vitamins

Recomendación para Quid: **no** importar los 316 nombres en inglés. Usar los 12 grupos de
la §5.1 como taxonomía semilla y dejar que el catálogo crezca por uso (y, si quieres, una
lista semilla es-CO de 40–60 productos de alta frecuencia). Los 316 de SoftList están
sesgados a Brasil y a marcas locales.

---

## 6. Mecánicas secundarias verificadas

### 6.1 Normalización de nombres (replicable)

`p252i3/AbstractC5743x.m27548K`:

1. `java.text.Normalizer.normalize(s, Form.NFD)`
2. eliminar toda marca diacrítica: `Pattern.compile("\\p{M}")` → `replaceAll("")`
3. `toLowerCase()`
4. eliminar **todos** los espacios
5. si el resultado queda en blanco, devolver el original

El resultado se guarda ya en minúsculas. Variante `m27547J` = igual **sin** el guard de
blanco (se usa en el sembrado).

**Deduplicación real**: se compara el **`NOME` crudo, no el normalizado**, con
`WHERE NOME = ? AND USUARIO_ID = ? AND PRODUCTS_LIST_ID = ?`. Consecuencia documentada: dos
escrituras distintas del mismo producto (`"Leche"` vs `"leche"`) crean **dos productos**.
El normalizado solo se usa para **búsqueda por prefijo**.
→ En Quid hay que corregir esto: deduplicar por clave normalizada (§7.3).

### 6.2 Memoria de precios por tienda

- Tabla `PRODUCT_STORE_PRICE(STORE_ID, PRODUCT_ID, PRICE, UNIT, PURCHASE_DATE, TIMEZONE_ID,
  TIMEZONE_OFFSET)`.
- Se escribe con `insert-or-update` por (producto, tienda).
- Se lee **clave de la tienda activa**.
- Solo se aplica si `STORE.REMEMBER_PRICES_FROM_THIS_STORE = 1`
  (checkbox `cbxRememberPrices` del editor de tienda).
- Si la bandera está apagada, el precio recordado se ignora.

### 6.3 Códigos de barras

Orden de resolución al leer un código:

1. **Local**: `SELECT * FROM CODIGO_BARRAS JOIN PRODUTOS WHERE CODIGO=? AND
   PRODUTOS.PRODUCTS_LIST_ID=? AND USUARIO_ID=?`
2. **Servidor SoftList**: `https://softlistweb.com/SoftListV2/service/barcode/getBarcode/`
3. **digit-eyes** (scraping HTML de `digiteyes.cgi?upcCode=`), cuyo resultado **se sube de
   vuelta** con prioridad 2.
4. Desde el editor de ítem, un código desconocido se consulta además en
   **`cosmos.bluesoft.com.br`** (solo en locale portugués).

Si el usuario nombra manualmente un producto con un código desconocido, se sube el mapeo
con prioridad 1. Código desconocido: diálogo + oferta de buscar en Google.

Comportamiento: `BARCODE_READER_TYPE` (1 = lectura única; otro = re-lectura por frame) y
`BARCODE_BEEP`. Al acertar: marca el producto activo, o añade/incrementa el ítem de la
lista (incrementa cantidad solo si `BARCODE_SUM_AMOUNT` está activo).

**Deduplicación agresiva**: los triggers de `CODIGO_BARRAS` **borran** filas en conflicto
antes de insertar — re-escanear un código lo *mueve* de producto.

### 6.4 Imágenes

- Contenido direccionado: `IMAGENS.ID_UNICO` = **MD5 hexadecimal del blob**
  (`AbstractC5743x`).
- Inserta idempotente por (`ID_UNICO`, `USUARIO_ID`); `SIZE = bytes.length`.
- `IMAGEM_PADRAO = 1` para las imágenes de fábrica/sincronizadas; en el sembrado, `ID_UNICO`
  es **el nombre del recurso** (`res/raw/<nombre>`) y hace match con `R.array.imagens`.
- `PRODUTOS.IMAGEM_ID` es el vínculo. La columna legacy `PRODUTOS.FOTO` (BLOB) solo la
  escribe el helper de sync crudo → **columna muerta**.
- Fuentes de imagen: cámara (`ACTION_IMAGE_CAPTURE`, con rama FileProvider en API ≥ 24),
  galería (`ACTION_PICK`), reutilizar la de otro producto, y búsqueda en internet
  (Google Custom Search JSON API, `searchType=image`, con `cx` y API key embebidas en el
  APK — mala práctica de seguridad, no la copies).
- Las imágenes elegidas se **recortan y escalan a ≤ 140 px** y se codifican en **WEBP
  calidad 80**.
- `FOTO_ALTERNATIVA` (imagen por ítem) solo se escribe cuando la imagen del producto es de
  fábrica (`FOTO_PADRAO = 1`) **y** la elegida difiere de la del producto.
- Las listas recibidas de otro usuario guardan la clave remota en
  `ITENS_LISTAS_RECEBIDAS.IMAGEM_ID_UNICO` (texto) hasta su aceptación.
- Nota: `InternetImageSearchActivity` **solo es alcanzable por el search framework**
  (`ACTION_SEARCH`), ningún código propio la lanza en esta build.

### 6.5 Historial y reportes

`historico.HistoricoListaActivity` calcula el total de una compra con la misma fórmula de
cupón/impuesto de §4.3, agrupando por `HISTORICO._id` y usando:

```
coalesce(CASE WHEN ITENS_HISTORICO.MULTIPLICAR_VALOR = 1
              THEN ROUND(ITENS_HISTORICO.VALOR * ITENS_HISTORICO.QUANTIDADE, 2)
              ELSE ITENS_HISTORICO.VALOR END, 0) AS TOTAL
```

Manejo de **zona horaria**: cada `HISTORICO` guarda `TIMEZONE_ID` + `TIMEZONE_OFFSET` y
todos los filtros de rango aplican:

```sql
((CAST(DATA + TIMEZONE_OFFSET AS INTEGER) >= ? AND CAST(DATA + TIMEZONE_OFFSET AS INTEGER) <= ? AND TIMEZONE_ID <> '')
 OR (DATA >= ? AND DATA <= ? AND TIMEZONE_ID = ''))
```

Es decir: si hay offset, se compara en hora local; si no, en UTC crudo. **Patrón a copiar
en Quid** (tu app ya asume UTC-05).

Reportes disponibles (`history_reports.*`, todos premium):

| Reporte | Query base | Pregunta que responde |
|---|---|---|
| `HistoryReportTotalExpenses*` | `SUM(...) GROUP BY CATEGORY_NAME` | ¿en qué categoría gasto más? |
| `HistoryReportTotalExpenses*` (variante) | `SUM(...) GROUP BY STORE_NAME/DESCRICAO` | ¿en qué tienda gasto más? |
| `HistoryReportTotalExpenses*` (variante) | `strftime('%Y-%m', DATA+OFFSET) GROUP BY MONTH` | evolución mensual |
| `HistoryReportTotalExpenses*` (variante) | `GROUP BY NOME_PRODUTO` | top de productos por gasto |
| `HistoryReportPriceChange*` | `ROUND(SUM(VALOR + ROUND(VALOR*TAX,2)) / COUNT(1), 2) GROUP BY producto, unidad, tienda` | precio medio |
| `HistoryReportPriceChangeLineChart` / `BarChart` | `GROUP BY DATA, VALOR, UNIT_NAME = ?` | serie temporal del precio de un producto |
| `HistoryReportPriceComparison*` | subconsulta de productos presentes en **≥ 2 tiendas** | comparación de precios entre tiendas |

El comparador de precios exige: dos historiales del mismo producto en tiendas distintas
(`report_message_comparison_compare_explanation`).

`HistoryStatisticsActivity` es el onboarding del módulo (5 textos guía + video de YouTube).

### 6.6 Premium: modelo de gating

Tres productos, cada uno con plan mensual/anual, verificados contra un servidor
(`C5730k` consulta una URL de licencias):

| Feature | Qué desbloquea |
|---|---|
| **Premium general** | Personalizar botones del menú principal · **Imprimir la lista completa con detalles y totales** · **Subtotales por categoría** · **Total de ítems pendientes por tienda** |
| **Multi-tienda** (*Sort your list by store*) | Listas, categorías y productos distintos por tienda · orden de categorías por tienda. **Límite free: 2 tiendas** |
| **Reportes** (*My expenses*) | Variación de precios · producto que genera más gasto · comparación de precios entre tiendas |
| **SoftList Cloud** | Sync multi-dispositivo · compartir listas · **backup automático**. Incluye **prueba de 30 días** (`msg_aviso_premium_sync`) |

Gating en UI: los switches bloqueados se pintan con un candado
(`ic_lock_black_24dp`) y su label muestra `enabled`/`disabled`; los diálogos de bloqueo
existen por feature (`notice_premium`, `notice_premium_reports`,
`notice_premium_softlist_cloud`, `multi_store_limit`, `multi_store_premium_limit`).

**Para Quid:** este esquema es un buen precedente si algún día monetizas, pero **no** es
necesario para el módulo despensa. Lo relevante es la UX de "feature bloqueada visible pero
inerte con candado", que es más honesta que ocultarla.

### 6.7 Sincronización y cuentas (contexto, no a copiar)

- Cuenta local `_id = 0` (`R.string.meus_dados` / `conta_local`) siempre existe.
- Cuentas cloud en `CONTAS_USUARIOS` con `CREDENTIALS_STATUS`, `PRONTA_PARA_UTILIZACAO`,
  `RECEBER_LISTAS`, `RECEBER_NOTIFICACAO`, `DATA_SINCRONIZACAO`.
- `EXCLUSOES` es una tabla de **tombstones** (`TIPO`, `ID_GLOBAL`, `SEQUENCIAL`) para
  propagar borrados.
- **Control de concurrencia optimista**: antes de editar un registro compartido la app
  exige conexión y avisa de posible duplicación
  (`concurrency_control_could_not_connect_to_server`,
  `concurrency_control_no_internet_connetion`, `concurrency_control_warning`), con escape
  "I can not wait" / "I do not have internet connection".
- Estado intermedio `PRODUCTS_LISTS` / `LISTAS_RECEBIDAS` con nombres **textuales**
  (`NOME_PRODUTO`, `NOME_UNIDADE`, `NOME_CATEGORIA`, `PRICE_UNIT_NAME`) al recibir una lista
  de otro usuario: se guardan como texto hasta que el receptor acepta, y entonces se
  intenta casar con su catálogo.
- Soporte **Wear OS** (`CheckWearOsNetworkWorker`, `wearable.ListenerService`) y un
  `DatabaseProvider` con `multiprocess=true`.

---

## 7. Diseño de la "Nevera virtual" para Quid

Esta sección traduce lo anterior a **tu** proyecto. Se apoya en lo que ya existe en
`Quid-App/prisma/schema.prisma` (`PantryItem`, `PantryMovement`, `PriceHistory`,
`ShoppingList`, `ShoppingListItem`, `Recipe`, `RecipeIngredient`) y en
`src/app/api/shopping-lists/[id]/confirm/route.ts`, que **ya implementa la vía "lista →
stock"**.

### 7.1 Lo que ya tienes (y funciona)

El `POST /api/shopping-lists/[id]/confirm` ya hace exactamente la vía 2 que pediste:

- Recibe `items` (selección) y `minMode` ("Recordar mínimos").
- Solo los ítems con `isPurchased = true` **y** presentes en la selección entran a la despensa.
- Si el ítem ya tiene `pantryItemId`: `quantity += movedQty`, actualiza `purchaseDate`,
  `purchasePrice`, y si `minMode`, sube `minStock` con `Math.max(minStock, movedQty)`
  (**nunca lo baja** — buena decisión).
- Si no lo tiene: crea `PantryItem` con `category: "other"` y enlaza `pantryItemId` de vuelta.
- Registra el gasto en Finanzas (`Transaction` o `Installment`) con
  `sourceModule: "pantry"`, `sourceId: list.id`.

**Falta:** la vía 1 (definir stock por parámetros) y la vía 3 (marcar por producto), y toda
la capa de **umbral/objetivo/consumo** que hace que la nevera sea útil.

### 7.2 Modelo de datos propuesto (3 vías, un solo modelo)

La clave es no crear tres mecanismos distintos, sino **un solo `PantryItem` con stock
editable por tres entradas distintas**.

```
                    ┌──────────────────────────────────────────┐
   VÍA 1 ──────────►│  PantryItem: minStock, targetQuantity    │◄──── VÍA 3
   parámetros       │  quantity (stock actual = fuente única)  │      ficha de producto
                    └───────────────────┬──────────────────────┘
                                        │  PantryMovement (ledger)
   VÍA 2 ──────────────────────────────►│
   lista de compra confirmada           ▼
                              PriceHistory (precio por compra)
```

**Regla de oro:** `PantryItem.quantity` **nunca** se escribe directo desde una vía; siempre
se escribe un `PantryMovement` y `quantity` se deriva/suma en la misma transacción. Esto es
lo que SoftList no tiene y es lo que hace auditable la nevera.

Ajustes concretos al esquema:

```prisma
enum PantryMovementType { in out adjust waste }

model PantryMovement {
  // ya existe: id, itemId, userId, type, quantity, unit, note,
  //             sourceListId, sourceRecipeId, createdAt
  type        PantryMovementType  // reemplaza el String libre
  sourceStore String?             // tienda de la compra (viene de ShoppingList.storeName)
  unitPrice   Decimal?            // precio unitario pagado en este movimiento
  occurredAt  DateTime @default(now())  // fecha real del evento (≠ createdAt)
  @@index([userId, occurredAt])
}

model PantryItem {
  // ya existe: id, userId, name, category, quantity, unit,
  //             expirationDate, purchaseDate, purchasePrice,
  //             minStock, unitWeightFactor, targetQuantity,
  //             lastUsedAt, createdAt, updatedAt
  nameNormalized  String    // ← normalización SoftList §6.1
  location        String    @default("nevera") // nevera | alacena | congelador
  isFavorite      Boolean   @default(false)    // ← "reposición rápida"
  isActive        Boolean   @default(true)     // ← ATIVO de SoftList (soft delete)
  sortOrder       Int       @default(1)        // ← ORDEM de SoftList
  defaultUnitId   String?                      // ← unidad preferida (producto)
  priceUnitId     String?                      // ← PRICE_UNIT_ID de SoftList
  multiplyQuantity Boolean  @default(true)     // ← MULTIPLICAR_VALOR, ahora explícito
  notes           String    @default("")       // ← OBSERVACAO

  @@unique([userId, nameNormalized, unit])
  @@index([userId, isActive])
}
```

Tres decisiones importantes:

1. **`multiplyQuantity` explícito por ítem** en vez de heredarlo de la unidad. SoftList lo
   mete en `UNIDADES` y es su mayor fuente de confusión (§4.2). Mantén un default
   *derivado de la unidad* (g/ml ⇒ `false`) pero permite override por producto.
2. **`@@unique([userId, nameNormalized, unit])`** para arreglar el bug de SoftList de
   duplicar por mayúsculas/acentos (§6.1).
3. **`PantryMovement` como ledger inmutable**: `waste` es un tipo que SoftList no tiene y
   que es el que más valor da en una nevera real (se te dañó, se venció).

### 7.3 Vía 1 — Definir stock por parámetros (ficha del producto)

API y UX:

```
POST   /api/pantry                       crear con parámetros de stock
PATCH  /api/pantry/[id]                  editar
POST   /api/pantry/[id]/adjust           ajuste manual (genera movement "adjust")
POST   /api/pantry/[id]/consume          consumo (movement "out"/"waste")
GET    /api/pantry                       lista + deficit calculado
```

Campos de la ficha (mapeados a la UI minimalista de §8):

| Campo UI | Columna | Default | Por qué |
|---|---|---|---|
| Nombre | `name` + `nameNormalized` | — | dedupe |
| Categoría | `category` | `other` | agrupación |
| Ubicación | `location` | `nevera` | el módulo se llama nevera; alacena/congelador son obligatorios en la práctica |
| Stock actual | `quantity` | 0 | solo lectura (se cambia por movimientos) |
| Unidad | `unit` + `defaultUnitId` | `unit` | — |
| **Mínimo** | `minStock` | `null` | dispara "stock bajo" |
| **Objetivo** | `targetQuantity` | `null` | dispara "cuánto comprar" |
| Última compra | `purchaseDate` | — | freshness |
| Último precio | `purchasePrice` | — | enlaza con Finanzas |
| Vence | `expirationDate` | `null` | alerta de vencimiento |
| Notas | `notes` | `""` | — |

**Cálculo del déficit** (para generar la lista de compra):

```ts
const deficit = Math.max(0, (targetQuantity ?? minStock ?? 0) - quantity);
const isLow   = minStock != null && quantity <= minStock;
const isStale = lastUsedAt != null && daysBetween(lastUsedAt, now) > STALE_DAYS;
```

Si `targetQuantity` es `null`, el déficit objetivo = `minStock`. Si ambos `null`, el ítem no
participa en la generación automática (es un ítem "solo registro"). Esto evita el clásico
"me generó 200 líneas de lista".

**Ajuste manual con motivo** — es lo que hace la nevera auditable:

```ts
// POST /api/pantry/[id]/adjust
await db.$transaction([
  db.pantryMovement.create({ data: {
    itemId, userId, type: "adjust", quantity: delta,
    note: reason, occurredAt: new Date()
  }}),
  db.pantryItem.update({ where: { id: itemId },
    data: { quantity: { increment: delta } } }),
]);
```

### 7.4 Vía 2 — Convertir una lista de compra en stock (ya existe, se mejora)

El endpoint actual hace lo correcto. Mejoras propuestas, todas inspiradas en SoftList:

1. **Usar `PantryMovement` en vez de `increment` directo** para que todo quede en el ledger:
   cada ítem movido genera un `in` con `sourceListId`, `sourceStore` (de
   `ShoppingList.storeName`) y `unitPrice`.
2. **Escribir `PriceHistory`** en cada movimiento `in` (ya tienes la tabla): precio,
   cantidad, unidad, fecha, `sourceListId`. Es el equivalente al
   `PRODUCT_STORE_PRICE` + `HISTORICO` de SoftList, y es lo que habilita los reportes de
   variación de precio sin construir la maquinaria de reportes desde cero (§6.5).
3. **Auto-detectar el ítem de despensa por nombre normalizado** en vez de exigir
   `pantryItemId`. Hoy, si la lista trae "Leche entera" y tu despensa tiene "leche entera",
   crea un duplicado. Con `nameNormalized` (§6.1) y un match difuso (`startsWith`/trigram),
   se fusiona solo. Esta es la mejora de mayor impacto.
4. **Aplicar `category` del ítem de la lista** en vez de forzar `"other"` — hoy todo lo que
   entra por lista queda sin categoría, lo que rompe la agrupación visual.
5. **Soportar `unitWeightFactor`**: si la lista compra "500 g" y la despensa lleva "kg",
   convertir con el factor antes de sumar (equivalente al JSR-385 de SoftList, §4.4).
6. **`minMode` debería ser por-ítem, no global.** SoftList no lo tiene, pero la UX de
   "recordar mínimos" global es agresiva: sube el mínimo de *todo* lo comprado. Mejor un
   checkbox por fila, con default desde un ajuste global.

### 7.5 Vía 3 — Marcar por producto

Es la vía más simple y la que más se usa día a día. Dos UIs:

1. **Desde la ficha del producto** (`PantryItemForm`): un toggle
   *"Llevar control de stock"* que setea `minStock`/`targetQuantity` y define
   `quantity` inicial. Si no se activa, el ítem es "solo registro".
2. **Desde el catálogo/carrito durante el mercado** (patrón `CatalogoProdutosActivity` de
   SoftList, §3.4): cada fila muestra un badge *"en nevera: 2"* o *"agotado"*, y un botón
   para fijar el stock al vuelo. Aquí sí copia el `LEFT OUTER JOIN` invertido: el catálogo
   sabe qué tienes en casa.

Y una tercera puerta de entrada, la más valiosa: **marcar el ítem como comprado en la lista
lo mueve a stock automáticamente si el producto es de tipo "inventariable"**. Esto es lo que
evita el paso manual en el 90 % de las compras. Se controla con
`PantryItem.isActive` + existencia de `minStock`/`targetQuantity`.

### 7.6 Motor de importe: qué copiar exactamente

Para que la despensa converse bien con Finanzas, adopta la fórmula de SoftList §4.3 **tal
cual**, con dos cambios:

- `COUPON_TYPE` como enum (`FIXED` / `PERCENT`) en vez de int mágico.
- Todo en `Decimal` (ya lo tienes así en `PriceHistory.price` y `ShoppingListItem.actualPrice`).

```ts
type LineAmountInput = {
  quantity: number;
  value: Decimal;          // precio capturado
  multiplyQuantity: boolean;
  taxEnabled: boolean;
  taxRate: Decimal;        // fracción: 0.19
  couponEnabled: boolean;
  couponValue: Decimal;    // fracción si PERCENT
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

`multiplyQuantity` default derivado de la unidad: `g`, `ml` ⇒ `false`; resto ⇒ `true`
(es la semilla exacta de SoftList).

---

## 8. Referencia de estilo visual (para el rediseño minimalista)

### 8.1 Sistema de tema real de SoftList

Jerarquía de temas (los ids de `public.xml` son el mapa exacto id → nombre):
`AppTheme` (`0x7f13000e`) → `AppBaseTheme` (`Theme.AppCompat.Light.DarkActionBar`) ·
`AppTheme.NoActionBar` (`0x7f130010`, ~55 actividades) · `AppTheme.NoActionBarWhiteCursorColor`
(`0x7f130011`; usado por `MainActivity`, `CartActivity`, `ProdutosListaActivity`,
`StoresActivity`, `SelectStoreActivity`) · `FullscreenTheme` (`0x7f130136`, el splash).

**El tema base NO es Material3 ni MaterialComponents**: es
`Theme.AppCompat.Light.DarkActionBar` con action bar. Material Components entra solo como
`android:popupTheme=@style/Theme.MaterialComponents.Light`. Es decir: la app usa widgets
Material sobre una base AppCompat de linaje Holo — se lee como una app de 2015 mantenida
incrementalmente, no rediseñada.

| Atributo | Valor | Recurso |
|---|---|---|
| Theme base | `Theme.AppCompat.Light.DarkActionBar` | `AppBaseTheme` |
| `colorPrimary` | **`#12824f`** (verde SoftList: toolbar, splash, action mode) | `@color/softlist` |
| `colorPrimaryDark` | **`#005426`** → barra de estado | `@color/colorPrimaryDark` |
| `colorAccent` (wired) | **`#00796b`** (`md_teal_700`) | — |
| `colorAccent` (declarado) | `#8bc34a`, **rara vez usado** | `@color/colorAccent` |
| `actionModeBackground` | `#00796b` | — |
| `android:windowBackground` | **`#fafafa`** | `@color/backgroundColor` |
| Botón normal | **`#6c9c77`**, texto blanco | `@color/softList_button_color` |
| Checkbox marcado / cabecera de carrito / ripple | **`#bcd8c1`** | `@color/softlist_claro` |
| Fila seleccionada | **`#daffda`** | `@color/selected_item_list` |
| Barra de resumen (pie) | **`#aa4fb27b`** (verde al 67 % de alfa) | `@color/colorPrimaryLight` |
| FAB | **`#1976d2`** (`md_blue_700`) | — |
| FAB de código de barras | `#607d8b` (`md_blue_grey_500`) | — |
| Cabecera de categoría | `#e0e0e0` (`md_grey_300`) | — |
| Divisor | `#1f000000` (negro al 12 %), 1dp | `@color/separador` |
| Texto primario / secundario | `#de000000` (87 %) / `#8a000000` | `primaryText` / `secondaryText` |
| Errores | `#8b0000` (`DarkRed`), `#b71c1c` | — |

Tema secundario **no usado en pantallas activas**: `AppBaseTheme2` →
`Theme.MaterialComponents.Light.DarkActionBar.Bridge`, primary `#1976d2`, accent `#5c6bc0`.
Es el rastro de una migración a Material que quedó a medias.

**No hay modo oscuro de la app.** `values-night/` contiene solo los puentes `DayNight` de
las librerías y un `colors.xml` **vacío**; `AppTheme`/`AppBaseTheme` nunca se sobrescriben
para noche. `res/color-night` tiene tres selectores del time-picker de Material.
→ Si quieres modo oscuro en Quid, es **diseño nuevo**, no una adaptación de lo que existe.

**Tipografía**: no hay `res/font` ni fuentes en `assets/`. Todo es Roboto del sistema. Los
tamaños vienen de las apariencias AppCompat (`Body1` 335 usos, `Subhead` 122, `Title` 30,
`Headline` 13) más literales puntuales: 18sp (importes del resumen), 12sp /
`@dimen/label_text_size` (etiquetas de formulario) y 28sp (carrito vacío, en `serif`).

**Geometría**: margen base `@dimen/activity_horizontal_margin` = `activity_vertical_margin`
= **16dp** (243 usos). Alturas de fila: cabecera 48dp · una línea 48dp · una línea con
avatar 56dp · **dos líneas con avatar denso 60dp**. **Cero `CardView` en los layouts
propios**; 53 layouts fuerzan `app:elevation="0dp"` en el AppBar (la única elevación real es
8dp en el pie del carrito). Radios: solo el óvalo `shape_white_circle`. 59 layouts están
envueltos en `androidx.core.view.insets.ProtectionLayout` (edge-to-edge sobre targetSdk 36).

**Feedback táctil**: ripple global `@drawable/ripple_effect` con color `#bcd8c1`; las filas
usan `item_selector` (foreground) + `item_list_selector` (fondo según estado); checkbox
tintado por `item_checkbox_color` (marcado `#bcd8c1`, sin marcar `#bdbdbd`).

**Iconografía**: mezcla de **bitmaps solo-hdpi** (`barcode_white`, `comida.jpg`, `camera`,
`lista_vazia`, `calculator_inv`, `money`, `premium`, `header_background`) y unos pocos
vectores. Los estados vacíos son **imágenes por idioma** (`drawable-es-rES-hdpi`,
`drawable-de-hdpi`, …). Es una deuda técnica de la app: **en Quid usa `lucide-react`**, que
ya tienes.

### 8.2 Anatomía de la pantalla principal

**Importante:** la app tiene pares de layouts (`*` y `*_2`) y los que realmente se usan son
los **`_2`**. `ItensListaFragment` infla `itens_lista_fragment_2`; `ItemActivity` elige
`activity_item` o `activity_item_2` según el ajuste de layout del usuario. Lo que sigue
describe la variante activa.

`activity_main.xml` → `DrawerLayout` con:
- contenido: un `<fragment>` de `ItensListaFragment` a pantalla completa;
- `NavigationView` en `layout_gravity="start"` con
  `app:headerLayout="@layout/navigation_drawer_header"` y
  `app:menu="@menu/navigation_drawer"`; iconos sin tintar.

La cabecera del drawer son 160dp de `@drawable/header_background` con un icono de cuenta de
48dp y `ic_arrow_drop_down_white_24dp`; al tocarla se abre un selector de cuenta y el menú
se conmuta a `@menu/navigation_drawer_2` (una segunda variante del menú).

Estructura de `itens_lista_fragment_2.xml`:

```
RelativeLayout (bg @color/backgroundColor)
├── CoordinatorLayout
│   ├── AppBarLayout (theme AppTheme.AppBarOverlay)
│   │   └── Toolbar (bg ?attr/colorPrimary)
│   │       └── Spinner (@id/spinner)   ← MainActivity lo puebla para cambiar de lista activa
│   ├── <include itens_list_content>    ← un único RecyclerView (@id/recyclerView)
│   ├── <include itens_lista_vazia>     ← estado vacío (@android:id/empty)
│   ├── FAB fabBarcode  (end, anclado al fab, tint @color/md_blue_grey_500, gone por defecto)
│   ├── View whiteCircle (76dp, @drawable/shape_white_circle, halo, gone)
│   └── FAB fab         (end|bottom, 16dp de margen, tint @color/md_blue_700, icono +)
└── <include itens_list_footer>         ← barra de resumen
```

Es un **drawer lateral**, no bottom navigation. La barra superior es un `Toolbar` con tema
`DarkActionBar` (el `AppBarLayout` va a `elevation=0dp`), y el contenido es un
**`RecyclerView`**, no un `ListView`. Los FAB son **azules** (`#1976d2`), no verdes: es el
punto donde el segundo acento de la app se cuela en la pantalla principal.

### 8.3 Anatomía de la fila de ítem (`itens_lista_row_2.xml`)

`FrameLayout` (`foreground=@drawable/item_selector`, es decir el ripple) que contiene un
`RelativeLayout` con `background=@drawable/item_list_selector` y padding
**16dp izquierda / 4dp derecha**.

```
[ Imagen circular ] [ Nombre (Subhead, 1 línea)          ]  [ Cupón ] [ Check ] [ ⣿ ]
  48dp CircleImageView[ 1 Un x 1,99 - $ Valor ( ± tax/cup ) - Obs ]
                     min-height 60dp
```

Detalle verificado:

- **Imagen**: `de.hdodenhof.circleimageview.CircleImageView`, lado
  `?android:attr/listPreferredItemHeightSmall` (≈48dp), **circular** (no cuadrada), con
  fallback `@drawable/comida`.
- **Columna central** (`LinearContent`): `minHeight=@dimen/item_list_height_two_line_avatar_dense`
  (**60dp**), `marginRight=8dp` respecto a la imagen.
- **Línea 1**: nombre, `TextAppearance.AppCompat.Subhead`, `maxLines=1`, `ellipsize=end`.
- **Línea 2**: `TextAppearance.AppCompat.Body1` + `?android:attr/textColorSecondary` en
  **todos** los fragmentos. Orden exacto:
  `cantidad` · `unidad` · `x` · `precioUnitario` · `-` · `moneda` · `valor` ·
  `( ± impuesto/cupón )` · `- Obs`.
  El bloque de impuesto/cupón (`linearLayoutTaxCoupon`) está `gone` y solo aparece si
  aplica; los iconos `imgTax` / `imgCoupon2` son de `27px`.
  **El precio va dentro de la línea de detalle, no al final de la fila.**
- **Zona derecha** (`linearChecado`, `clickable=true`, `minWidth=48dp`): `CheckBox`
  (`clickable=false`, tintado con `@drawable/item_checkbox_color`) **+** un
  `ImageView imgSortOrder` de 48dp con `ic_reorder_black_24dp` para arrastrar/reordenar.
  Por eso la fila tiene *dos* controles a la derecha además del cupón global (`imgCoupon`,
  `gone`).
- **Cabeceras de sección** (tipos de vista del adapter, no filas persistentes):
  `itens_lista_header_categoria_2` (48dp, `@color/md_grey_300`, nombre a la izquierda y
  total opcional a la derecha) y `itens_lista_header_carrinho_2`
  (48dp, `@color/softlist_claro`, rótulo "Cart").
- **Fila marcada**: fondo `@drawable/selected_item_list` = `#daffda`, y texto tachado si
  `CROSS_OFF=1`.

### 8.4 Puntos de referencia medibles

Valores concretos que un diseñador puede copiar sin ambigüedad:

| Elemento | Valor observado | Fuente |
|---|---|---|
| Padding de página | `@dimen/activity_horizontal_margin` = `activity_vertical_margin` = **16dp** | `dimens.xml` (243 usos) |
| Altura de fila de una línea | `@dimen/item_list_height_single_line` = **48dp** | `dimens.xml` |
| Fila de una línea con avatar | `_single_line_avatar` = **56dp** | `dimens.xml` |
| **Fila de dos líneas con avatar** (la real) | `_two_line_avatar_dense` = **60dp** | `itens_lista_row_2.xml:37` |
| Cabecera de sección | `@dimen/item_list_header` = **48dp** | `dimens.xml` |
| Padding de fila | **16dp** izquierda / **4dp** derecha | `itens_lista_row_2.xml:11-12` |
| Separación imagen ↔ contenido | 8dp | `itens_lista_row_2.xml:21` |
| Separación intra-línea-2 | 2–5dp | `itens_lista_row_2.xml:73,87,96,106,116,126` |
| Divisor de lista | 1dp, color `#1f000000` | `@color/separador` |
| Separación entre campos del formulario | 8dp | `activity_item_campos.xml:52,96,151,224,255,276` |
| Área táctil de voz | 44dp de ancho | `activity_item_campos.xml:40-41` |
| Foto del ítem | `ImageButton` 150×150dp, `fitCenter` | `activity_item_campos.xml:278-286` |
| Tamaño de iconos de impuesto/cupón en fila | 27px | `itens_lista_row_2.xml:157,175,206` |
| Tamaño de las etiquetas del formulario | `@dimen/label_text_size` | `activity_item_campos.xml:160` |
| Elevación | 0dp (53 layouts); 8dp solo en el pie del carrito | — |
| Radios | sin `CardView`; solo el óvalo `shape_white_circle` | — |

**Pie de totales** (`itens_list_footer`, incluido como `@id/footer`): opcionalmente un
banner premium descartable (`@color/md_grey_700`) encima de una banda de **dos columnas**
sobre `@color/colorPrimaryLight` (el verde `#12824f` al 67 % de alfa), con importes a
**18sp** en `@color/primaryText`:

```
[ 🧮 Total (12)        ]   [ 🛒 Carrito (7)       ]
[    148.320           ]   [    92.450           ]
```

Es la pieza de UI que más define la pantalla. En un rediseño minimalista conviene dejar
**una sola cifra dominante** (el total del carrito, que es la que importa mientras compras)
y el total general en tipografía menor.

Estados vacíos: son **imágenes bitmap por idioma** (`itens_lista_vazia`, `@drawable/lista_vazia`
en `drawable-es-rES-hdpi`, `drawable-de-hdpi`, …) para la lista, y `empty_cart.xml`
(28sp, `serif`, `@color/Gray`) para el carrito.

### 8.5 Anatomía del editor de ítem (`activity_item_campos.xml`)

Es un formulario vertical dentro de un `ScrollView` (`activity_item.xml`), con `AppBarLayout`
+ `Toolbar` arriba y `elevation=0dp` (plano). Orden exacto de campos:

| # | Campo | Widget | Detalle |
|---|---|---|---|
| 1 | **Nombre** | `TextInputLayout` + `CustomAutoCompleteView` | `maxLength=255`, `textCapSentences`, `imeOptions=actionNext`, `selectAllOnFocus`, icono de micrófono a la derecha |
| 2 | (Voz) | `TextView` 44dp clicable con `android:onClick="entradaVoz"` | superpuesto al `TextInputLayout` |
| 3 | **Cantidad** | `CustomEditText` `inputType=numberDecimal` | hint `"1"`, ocupa 50 % |
| 4 | **Unidad** | `Spinner` con `AppTheme.SpinnerUnderlined` | etiqueta `12sp` arriba, ocupa el otro 50 % |
| 5 | **Precio** | `CustomEditText` `inputType=numberDecimal` | hint `"0.00"`, 50 % |
| 6 | **Poner en carrito** | `CheckBox` + `ImageView` de carrito | 50 %; la etiqueta es `inserir_no_carrinho` |
| 7 | **Impuesto / Cupón** | 2 `EditText` `focusable=false`, `clickable=true`, `editable=false`, `drawableRight=arrow_button_dropdown` | en un bloque con `visibility=gone` que solo aparece si la feature está habilitada; cada uno abre su diálogo (`enterTax` / `enterCoupon`) |
| 8 | **Categoría** | `Spinner` + `Button` con icono de edición | el botón lanza `abreListaCategorias` |
| 9 | **Observación** | `CustomEditText` `textMultiLine` | `maxLength=255` |
| 10 | **Foto** | `Etiqueta` + `ImageButton` 150×150dp | `scaleType=fitCenter`, `onClick=escolherImagem` |

Detalle de UX notable: los `TextInputLayout` usan `android:textColorHint="@android:color/transparent"`
en los `EditText` hijos, es decir **el hint vive en el `TextInputLayout`, no en el input** —
evita el doble hint flotante. Es un detalle fino que vale la pena replicar.

`ItemActivity` elige entre `activity_item` / `activity_item_2` (y por tanto
`activity_item_campos` / `activity_item_campos_2`) según el ajuste de layout del usuario.
La variante `_2` es la que añade el paso 3b: **unidad de precio** (`spnPriceUnit`) junto al
precio. El layout base no tiene control de unidad de precio.

**Diálogos usados por el editor** (todos `DialogFragment`): confirmación genérica
(título/mensaje/positivo/negativo por ids de string), informativo, selector de origen de
imagen (`intent_listview_row`), diálogo de progreso bloqueante, y los específicos de
impuesto y cupón.

### 8.6 Qué se ve en la lista (features visuales)
Del sistema de settings (§9), las features visuales conmutables de la pantalla de lista son:

| Setting | Default | Efecto |
|---|---|---|
| `SHOW_IMAGES` | **1** | muestra la miniatura por fila |
| `CROSS_OFF` | **1** | tacha el texto del ítem marcado |
| `SHOW_FOOTER_TOTALS` | **1** | pie con subtotal/total |
| `SHOW_SUBTOTALS` | 0 (premium) | subtotales por categoría |
| `SHOW_IMAGES_PRODUCTS` | **1** | miniatura en el catálogo de productos |
| `SHOW_STORE_PENDING_ITEMS` | 0 (premium) | total de pendientes por tienda |
| `SHOW_UNIT_PRICE` | 0 | precio unitario por fila |
| `LIST_ORDER` | 0 (custom) | orden de las listas |
| `LIST_ITEMS_ORDER` | 0 (category) | orden de los ítems |
| `UNITS_ORDER` | 0 | orden de las unidades |
| `CART_ORDER` | true | orden del carrito |
| `SIMPLE_LIST` / lista simple | — | variante "Simple List" vs "Full list" |

Nota: `SHOW_SUBTOTALS` tiene un efecto secundario documentado por la propia app
(`category_subtotals_message`): *"los ítems marcados no se mueven al final de la lista"*.
Es decir, el marcado **reordena** la lista por defecto — comportamiento que conviene evitar
en el rediseño minimalista (ver §8.6).

### 8.7 Diagnóstico de "carga visual" (por qué se siente cargada)

Problemas concretos del diseño actual, útiles como lista de "qué no hacer":

1. **Dos/tres acentos compitiendo**: verde `#12824f` (toolbar, splash, action mode),
   azul `#1976d2` (todos los FAB) y teal `#00796b` declarado como `colorAccent`.
   El accent declarado (`#8bc34a`) es otro verde más que casi no se usa.
2. **Fila densa**: la segunda línea puede llevar hasta **9 fragmentos** de texto
   (cantidad, unidad, ×, precio, −, moneda, valor, paréntesis impuesto/cupón, observación),
   con separaciones de 2, 3 y 5dp mezcladas.
3. **Dos indicadores de cupón** simultáneos (`imgCoupon` e `imgCoupon2`) en el mismo layout,
   más un paréntesis textual de impuesto/cupón.
4. **Unidades de medida mezcladas**: 27px en los iconos de fila, `sp` en las apariencias,
   16dp de padding y `@dimen` en los formularios. Conviven px, dp y sp sin criterio.
5. **Fila seleccionada en verde** (`#daffda`) sobre fondo `#fafafa` con cabeceras grises: tres
   familias de color de fondo en la misma pantalla, más la banda verde translúcida del pie.
6. **13 ajustes visuales conmutables**: la pantalla puede verse de muchísimas formas
   distintas, y ninguna está diseñada como "la" vista canónica.
7. **Drawer con 13 destinos** en 4 grupos: navegación profunda para una app de lista.
8. **Imágenes BLOB** que obligan a decodificar bitmaps en cada fila, con bitmaps solo-hdpi
   como iconografía (borroso en pantallas modernas) y estados vacíos como imágenes **por
   idioma**.
9. **Dos layouts para lo mismo** (`X` y `X_2`) y tema base AppCompat con parches Material
   encima: la deuda de una migración a medias, que multiplica el costo de cualquier cambio.
10. **Cero `CardView` y elevación 0dp en todo**: el diseño es plano por completo, así que la
    jerarquía se sostiene solo con color y tipografía — y por eso cualquier color de más se
    siente como ruido.

### 8.8 Propuesta de adaptación minimalista (para Quid)

Mantén la **estructura de información** de SoftList y elimina la densidad visual:

| SoftList | Quid minimalista |
|---|---|
| Drawer 13 destinos / 4 grupos | **4 tabs**: Nevera · Mercado · Recetas · Salud (ya lo tienes en `pantry-page.tsx`) |
| Acento verde + azul | **un solo acento ámbar** (ya está: `from-amber-600 to-orange-500`), gris neutro para todo lo demás |
| Fondo de fila verde + fondo `#fafafa` | **una sola superficie**; el estado se comunica con el badge, no con el fondo |
| Línea 2 con 9 fragmentos | **máximo 2 datos**: cantidad+unidad, y precio **solo si el ajuste "ver precio" está activo** |
| Cupón + impuesto inline | Ocultos tras un "＋ detalles" del ítem |
| `#daffda` en filas marcadas | Sin cambio de fondo; solo el texto atenuado/tachado y el checkbox |
| Imagen circular 48dp | Icono de categoría 36dp + color semántico (ya definido en `pantry-view.tsx`, 9 categorías con paleta) |
| Cabeceras `TIPO=1` persistidas | Agrupación **derivada en render** por categoría (`Collapsible` — ya lo tienes) |
| 13 settings visuales | **3**: agrupar por categoría · mostrar precios · mostrar agotados |

Y aprovecha lo que ya está bien en tu `pantry-view.tsx`: los chips de categoría, el
`Collapsible` por grupo, el contador de "stock bajo", y el CTA plano de ancho completo. Lo
que falta es exactamente lo de la §7: nada de la capa visual.

### 8.9 Tokens visuales concretos (derivados de tu código actual)

De `pantry-view.tsx` (ya implementado, mantener):

| Rol | Valor |
|---|---|
| Acento primario | gradiente `amber-600 → orange-500` |
| Acento de módulo (icono nevera) | `text-amber-600 dark:text-amber-400` |
| Superficie | `bg-white dark:bg-gray-800/70`, radio `rounded-2xl` |
| Fila de ítem | `rounded-xl`, altura objetivo 56px |
| Card contenedora | `rounded-2xl` + `shadow-sm` |
| Radio de controles | `rounded-xl` (inputs, botones) |
| Tipografía título | `text-[15px] font-semibold` |
| Tipografía metadato | `text-[11px]` / `text-[10.5px] font-semibold` (badges) |
| Badge "stock bajo" | `bg-amber-50 text-amber-600 dark:bg-amber-950/40` |
| Badge neutro | `bg-gray-100 text-gray-500 dark:bg-gray-800` |
| Animación de entrada | `opacity 0→1, y 8→0`, stagger 0.04s |
| CTA principal | `h-11 w-full rounded-xl` gradiente + `shadow-lg shadow-orange-500/20` |

Paleta de categorías ya definida en tu código (9 categorías, con variante dark): sky, red,
green, yellow, amber, cyan, pink, orange, gray. **Reutilízala** en lugar de inventar una
nueva — es coherente y ya está probada en modo claro y oscuro.

Añadidos que necesitarás para la nevera y que aún no existen:

| Rol | Sugerencia | Motivo |
|---|---|---|
| Badge "agotado" | `bg-red-50 text-red-600 dark:bg-red-950/40` | estado crítico, distinto de "stock bajo" (ámbar) |
| Badge "vence pronto" | `bg-orange-50 text-orange-600` | más urgente que stock bajo, menos que agotado |
| Indicador de nivel de stock | barra fina de 3px o punto de color | comunica nivel sin sumar texto |
| Chip de ubicación | `nevera` / `alacena` / `congelador`, gris neutro | filtra sin ruido |

---

## 9. Sistema de ajustes completo

Todas las preferencias viven en `SharedPreferences("preferences")` salvo las de `CONFIGURACOES`.
Extraído de `p252i3/AbstractC5726g`, `settings.*Activity` y las lecturas literales en el código.

### 9.1 Booleanos y sus defaults reales

| Clave | Default | Significado | Quién lo lee |
|---|---|---|---|
| `ALLOW_DIFFERENT_PRODUCTS_TYPE` | `false` | permitir tipos de producto distintos por tienda | `ProdutoActivity` |
| `MULTI_STORE` | `false` | *Sort your list by store* (premium) | `ItensListaFragment`, `StoreActivity` |
| `NEW_ITEMS_HAVE_TAX` | **`true`** | aplicar impuesto a ítems nuevos | `ItemActivity` |
| `PESQUISA_SEMPRE_VISIVEL` | `false` | barra de búsqueda siempre visible | lista |
| `REMEMBER_NOTES` | `false` | recordar la observación del producto | `ItemActivity` |
| `TAX_CUPOMS_ENABLED` | `false` | habilitar la feature de impuestos/cupones | `ItemActivity` |
| `UNIT_CONVERTER` | `false` | conversión de unidades (premium) | `ItemActivity` |
| `DEFAULT_TAX` | `0.0f` | tasa de impuesto por defecto (fracción) | `ItemActivity` |
| `CART_ORDER` | **`true`** | ordenar el carrito | `CartListFragment` |
| `LEMBRAR_PRECO` | `0` (tabla `CONFIGURACOES`) | recordar el último valor reportado | `ItemActivity` |
| `SHOW_IMAGES` | **`1`** | imágenes en la lista | `ItensListaFragment` |
| `CROSS_OFF` | **`1`** | tachar los marcados | `ItensListaFragment` |
| `SHOW_FOOTER_TOTALS` | **`1`** | pie con totales | `CartListFragment` |
| `SHOW_SUBTOTALS` | `0` (premium) | subtotales por categoría | `ItensListaFragment` |
| `SHOW_IMAGES_PRODUCTS` | **`1`** | imágenes en el catálogo | `ProdutosListaActivity` |
| `SHOW_STORE_PENDING_ITEMS` | `0` (premium) | pendientes por tienda | `StoreListActivity` |
| `SHOW_UNIT_PRICE` | `0` | precio unitario en la lista | `ItensListaFragment` |
| `BARCODE_READER_TYPE` | `1` | 1 = lectura única, otro = continua | `AbstractActivityC3379a` |
| `SAVE_STORE_PRICE` | — | recordar precio por tienda | `ItemActivity` |

### 9.2 Ints / strings

| Clave | Default | Dominio |
|---|---|---|
| `LIST_ORDER` | `0` | índice en `R.array.sort_order_1` = `{Customized, Name}` |
| `LIST_ITEMS_ORDER` | `0` | índice en `R.array.sort_order_2` = `{Category, Product name, Customized}` |
| `UNITS_ORDER` | `0` | orden de unidades |
| `SORT_MODE` | `0` | modo de orden de listas |
| `GROUPBY` | — | agrupación de la lista |
| `ORDERBY` | — | campo de orden |
| `SHOW_FOOTER_TOTALS` | `1` | (int, no bool) |
| `SIMBOLO_MOEDA` / `MONETARY_SYMBOL` | `R.string.moeda` | símbolo de moneda (localizado: `£`, `R$`, …) |
| `SELECTED_STORE` | — | tienda activa |
| `SELECTED_LIST` | — | lista activa **por tienda** |
| `CATEGORIES_LIST_ID`, `PRODUCTS_LIST_ID` | — | scope activo |
| `DEFAULT_TAX` (float) | `0.0f` | tasa |
| `SOUND_VOLUME` | — | `R.array.sound_volume` = `{Loud, Low, No sound}` |

### 9.3 Ajustes por pantalla

- **`SettingsActivity`** (menú de 13 entradas con `id` 1..21 y tipo 0/1/2/4):
  rotación de pantalla · opciones de menú · precio unitario · recordar último valor ·
  recordar notas · formato decimal · tipo de lector de código · apariencia ·
  orden · conversor de unidades · impuestos/cupones · ordenar por tienda · símbolo de moneda
  · (si avanzado) soporte/envío de base de datos.
- **`LayoutSettingsActivity`**: `SHOW_IMAGES`, `CROSS_OFF`, `SHOW_FOOTER_TOTALS`,
  `SHOW_SUBTOTALS`, `SHOW_IMAGES_PRODUCTS`, `SHOW_STORE_PENDING_ITEMS`.
  Los dos premium aparecen con candado si `MULTI_STORE` está desactivado.
- **`SortSettingsActivity`**: `LIST_ORDER`, `LIST_ITEMS_ORDER`, `UNITS_ORDER` (spinners) +
  `CART_ORDER` (switch).
- **`MenuSettingsActivity`**: visibilidad de las opciones del drawer.
- **`BarcodeSettingsActivity`**: tipo de lectura + beep.

### 9.4 Localización

**93 carpetas `values-<locale>`** con `strings.xml` (la base `values/` es **inglés**, 862
strings): `values-pt-rBR` con 793, `it`/`fr`/`es` con 763, hasta `he`/`id` con 4 +
`values-en-rXC` y `values-b+sr+Latn` de librerías. **Hay español** (`es`, `es-rES`, `es-rUS`,
`es-rGT`, `b+es+419`), así que las etiquetas de la §5.1 son traducibles directamente.

**El símbolo de moneda, las unidades, las categorías y la tabla de palabras clave de
imágenes son recursos localizados, no código:**

| Recurso | `values/` (inglés) | `values-pt-rBR` | `values-es` |
|---|---|---|---|
| `@string/moeda` | **`£`** | `R$` | `$` |
| `@array/unidades` | `Piece, oz, lb, gal, qt, Can, ml, L, kg, g, Box, Pack, Gallon, Bottle, Can, Package` | `un, dz, ml, L, kg, g, Caixa, Embalagem, Galão, Garrafa, Lata, Pacote` | — |
| `@array/categorias` | 12 `@string/categoria_*` | igual | igual |
| `@array/imagens` | tabla portugués→clave de imagen, duplicada por locale | ídem | ídem |

Dato relevante para ti: **el símbolo por defecto (inglés) es `£`, no `$`.** Si algún día
reutilizas esa tabla, no la tomes como referencia de moneda — tu default es COP.

Además existen recursos `drawable-es-*`, `drawable-de-*`, `drawable-fr-*`, `drawable-it-*`,
`drawable-ru-*`, `drawable-zh-*`, `drawable-pt-*`: **imágenes localizadas por idioma**
(los productos precargados tienen foto distinta según locale, y los estados vacíos también).

**La concatenación de la línea de detalle se hace en Java**, no en el layout: el formateo
por fila usa `NumberFormat.getInstance(locale de configuración)`, el operador `x` / `=` es un
literal hardcodeado, y el prefijo `"- Obs"` está escrito en el XML. Es decir: la app
localiza las etiquetas pero **no** la composición de la línea. En Quid esto se resuelve con
`Intl.NumberFormat` + `i18n` (ya tienes `src/i18n`).

Nombres de producto/unidad/categoría **sí se localizan** desde recursos en el primer
sembrado; después son datos de usuario (no cambian con el idioma).

---

## 10. Apéndice: inventario de artefactos del análisis

Todo el material de trabajo quedó en disco para que puedas profundizar sin repetir el trabajo.

| Ruta | Contenido |
|---|---|
| `C:\Users\rqqui\rea-work\SoftList.apk` | copia de trabajo del APK |
| `C:\Users\rqqui\rea-work\apk\` | APK descomprimido (DEX, recursos binarios) |
| `C:\Users\rqqui\rea-work\jadx\` | distribución JADX 1.5.6 CLI |
| `C:\Users\rqqui\rea-work\src\sources\` | **12.960 archivos `.java` decompilados** |
| `C:\Users\rqqui\rea-work\srcres\resources\res\` | recursos **decodificados a XML legible** (layouts, values, menu, arrays) |
| `C:\Users\rqqui\rea-work\out\softlist_ux_report.md` | informe de UX/estilo de las pantallas secundarias |
| `C:\Users\rqqui\rea-work\out\AndroidManifest.xml` | manifiesto en texto |
| `C:\Users\rqqui\rea-work\out\resources_index.json` | mapa de 7.300 recursos (id → tipo/nombre/valor) |
| `C:\Users\rqqui\rea-work\out\res_values.json` | valores resueltos por tipo |
| `C:\Users\rqqui\rea-work\tools\` | parsers propios: `axml.py`, `read_manifest.py`, `read_arsc.py`, `dump_strings.py` |

### 10.1 Limitaciones de este análisis (para que no te sorprenda)

1. **No se ejecutó la app.** Todo es estático. Comportamientos dependientes de red
   (sync, licencias premium, lookup de códigos de barras remoto, búsqueda de imágenes) se
   describen por su código, no por observación.
2. **87 clases fallaron en la decompilación** (`finished with errors, count: 87`) de 8.294.
   Son mayormente de librerías; el paquete propio `br.com.ridsoftware.shoppinglist` está
   completo (120 archivos) **salvo `CategoriaActivity`** (usado por
   `categorias.CategoriaActivity`), que no aparece en el árbol extraído. Su comportamiento
   se infirió del editor de unidad homólogo (`UnidadeActivity`) y del DDL.
3. **Los nombres de métodos y campos son de JADX** (`m19755U0`, `f16104A`, `p252i3`). No son
   los nombres originales del autor; son renombrados de forma estable y reproducible dentro
   de este análisis.
4. **`STORE.TYPE`, `STORE.item_status`, `STORE.sort_order` y `CATEGORIAS.VISIVEL`** están en
   el DDL pero **no se encontró ningún código que ramifique sobre ellos**. Son columnas sin
   efecto observado en esta build.
5. **Sin `adb` ni emulador** en el entorno de análisis: no hubo observación dinámica,
   captura de tráfico, ni lectura de una base de datos real de usuario.
6. **Los reportes** se documentaron por su SQL y su fragmento de cálculo; el render de los
   gráficos (MPAndroidChart y equivalentes) no se analizó.

---

## 11. Checklist de implementación para Quid

Ordenado por impacto/riesgo. Todo esto es trabajo en `Quid-App/`.

### Fase 0 — Cimientos (sin UI)

- [ ] Migración Prisma: añadir a `PantryItem` → `nameNormalized`, `location`, `isFavorite`,
      `isActive`, `sortOrder`, `defaultUnitId`, `priceUnitId`, `multiplyQuantity`, `notes`,
      y `@@unique([userId, nameNormalized, unit])`.
- [ ] Migración Prisma: `PantryMovement` → enum `PantryMovementType`, `sourceStore`,
      `unitPrice`, `occurredAt`.
- [ ] Utilidad `normalizeName()` portando el algoritmo de §6.1 (NFD → strip `\p{M}` →
      lowercase → sin espacios).
- [ ] Utilidad `lineAmount()` de §7.6 con tests unitarios (los 6 casos: multiply on/off ×
      cupón fijo/porcentaje × impuesto on/off).
- [ ] Utilidad `convertQuantity(qty, fromUnit, toUnit, unitWeightFactor)`.

### Fase 1 — Vía 1: parámetros

- [ ] `POST/PATCH/DELETE /api/pantry` con `minStock`, `targetQuantity`, `location`.
- [ ] `POST /api/pantry/[id]/adjust` generando `PantryMovement` (`adjust`/`out`/`waste`).
- [ ] `GET /api/pantry` devolviendo `deficit`, `isLow`, `isStale`, `expirationWarning`.
- [ ] `PantryItemForm`: añadir mínimo, objetivo, ubicación, vencimiento, notas.

### Fase 2 — Vía 3: por producto

- [ ] Toggle "Llevar control de stock" en la ficha (activa `minStock`/`targetQuantity`).
- [ ] Badge de stock en el catálogo de productos y en el carrito.
- [ ] Acción "fijar stock" al vuelo desde el mercado.

### Fase 3 — Vía 2: lista → stock (mejorar lo existente)

- [ ] Reescribir el bloque de conversión de `confirm/route.ts` para escribir
      `PantryMovement` + `PriceHistory` en vez de `increment` directo.
- [ ] Auto-match por `nameNormalized` antes de crear un `PantryItem` nuevo.
- [ ] Heredar `category` y `unit` de la línea de lista (no forzar `"other"`).
- [ ] Aplicar `unitWeightFactor` al sumar cantidades.
- [ ] `minMode` por-ítem en lugar de global.

### Fase 4 — Generación de lista desde la nevera

- [ ] `POST /api/shopping-lists/[id]/generate` extendido: poblar desde los ítems con
      `deficit > 0`, con `quantity = deficit` y `estimatedPrice` desde `PriceHistory`.
- [ ] Botón "Llenar desde la nevera" en `ShoppingListsView`.
- [ ] Priorización: agotados → stock bajo → por vencer.

### Fase 5 — Visual minimalista

- [ ] Consolidar a **un solo acento** ámbar; retirar cualquier fondo verde de fila.
- [ ] Fila de ítem: máximo 2 datos visibles (cantidad+unidad, y precio si el ajuste está
      activo).
- [ ] Cabeceras de categoría **derivadas en render** (no persistidas).
- [ ] Badges nuevos: `agotado`, `vence pronto`; indicador de nivel de stock.
- [ ] Reducir los ajustes visuales a 3: agrupar por categoría · mostrar precios ·
      mostrar agotados.
- [ ] Modo oscuro consistente en los badges nuevos (reusar la paleta de `pantry-view.tsx`).

### Fase 6 — Reportes (opcional, reusa lo que ya tendrás)

- [ ] Con `PriceHistory` poblado, el reporte de **variación de precio por producto** es
      `GROUP BY itemId ORDER BY date`.
- [ ] Gasto por categoría del módulo despensa sale de `Transaction` con
      `sourceModule = "pantry"` (ya lo escribes).
- [ ] Comparación de precios entre tiendas sale de `PriceHistory` + `sourceStore`.
