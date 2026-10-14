# Drivvo — Ingeniería inversa del módulo de Transporte y su conexión con Finanzas

**Propósito:** documentar cómo funciona el módulo de vehículo/transporte de Drivvo y cómo conecta con
finanzas, para decidir qué replicar en el módulo de Transporte de **Quid-App** y cómo integrarlo con
el módulo de Finanzas.

**Alcance:** análisis estático de la APK. No se ejecutó la aplicación. Este documento describe
**diseño, fórmulas y reglas de negocio**, no copia código fuente de terceros.

**Complementa** (no reemplaza) a [`ideas_drivvo_para_quip_app.md`](./ideas_drivvo_para_quip_app.md),
que se hizo navegando la app por ADB. Este documento va un nivel más abajo: código decompilado y
recursos, con evidencia trazable.

---

## 1. Metodología y trazabilidad

| Dato | Valor |
|---|---|
| Artefacto analizado | `Drivvo.apk` — 17.683.250 bytes |
| Paquete real | `br.com.ctncardoso.ctncar` (CTN Cardoso — la empresa detrás de Drivvo) |
| Decompilador | jadx **1.5.6** (release oficial, SHA-256 verificado: `545ea2be…e8974`) |
| Resultado | **8.407 archivos Java**, 7.487 clases, 63 errores de decompilación no bloqueantes |
| Framework | **Java/Kotlin nativo**. Un solo `classes.dex` (9,34 MB), **cero** librerías en `lib/` → no es Flutter, ni React Native, ni Unity |
| Ofuscación | **Parcial.** Nombres de paquete, clase y de dominio preservados (294 referencias a `br/com/ctncardoso/ctncar`), pero **algunos nombres de miembros están ofuscados** — p. ej. `CalculadoraFlexDTO` expone `v`, `w`, `x`. Esto limita la lectura de ciertas clases y se indica donde aplica |
| Recursos | `resources.arsc` + `res/values/strings.xml` (141 KB) y `arrays.xml` (16 KB) legibles |

**Nota sobre REA:** se intentó primero el carril Android de REA (`inspect_android_package`). Falla en
este entorno con `Open Windows path component failed [C:\] (Win32 32)` — una violación de
compartición al abrir el raíz del volumen en su capa de admisión de rutas nativa. Se comprobó que el
error **sigue al `TEMP`** (con `TEMP` en `F:`, reporta `[F:\]`), por lo que no depende de la APK ni de
la ruta elegida. Se usó jadx directamente. REA queda operativo para otros carriles (JS, artefactos,
.NET, web).

### Límites de esta ingeniería inversa

1. **Ofuscación parcial real.** Además de los campos con nombres de una letra, parte de la app está
   protegida con una **máquina virtual nativa** (referencias a un `VMRunner.invoke("<id>", …)`): esos
   flujos **no son recuperables del dex**. También hay **clases señuelo** que esconden literales de
   SQL y nombres de columna: algunos literales se descifran en runtime y no son legibles
   estáticamente.
2. **Parte del cálculo está corrompido por el decompilador.** En la clase de previsión de
   recordatorios, jadx produjo **bloques duplicados y contradictorios**, y un camino con posible
   excepción de puntero nulo que es artefacto de la reconstrucción de flujo. Donde eso ocurre se
   trianguló con dos implementaciones gemelas (la previsualización del formulario y el generador de
   textos), y se indica en el texto que el valor exacto de un umbral no es verificable.
3. **Valores de enums numéricos no establecidos.** Los códigos de unidad de medida, distancia,
   criterio de eficiencia, tipo de campo e insignia viven en recursos o en el backend, no en las
   clases. **No se inventaron.**
4. **Algunos rótulos no son verificables.** Ciertas etiquetas de métricas existen **solo como IDs de
   recurso** y se usan desde layouts XML que no forman parte de la decompilación de código. Sus
   **fórmulas equivalentes sí** están verificadas en el motor de informes, pero el texto exacto que ve
   el usuario para ese rótulo concreto no se pudo confirmar.
5. **Nada de este documento es código copiado.** Se documentan diseño, fórmulas y reglas.

### Cómo reproducir

```powershell
# 1. Decompilar
jadx -d <carpeta-salida> Drivvo.apk

# 2. Catálogos maestros de la app
#    <salida>\resources\res\values\arrays.xml
# 3. Textos de UI (etiquetas de métricas y notificaciones)
#    <salida>\resources\res\values\strings.xml
# 4. Modelo de datos LEGIBLE: contrato de servidor (claves JSON explícitas)
#    <salida>\sources\br\com\ctncardoso\ctncar\ws\model\models\   (46 clases Ws*DTO)
# 5. Esquema SQLite local (nombres de columna y mapeo campo↔columna)
#    <salida>\sources\br\com\ctncardoso\ctncar\db\               (campos ofuscados)
# 6. Pantallas (62 activities)
#    <salida>\sources\br\com\ctncardoso\ctncar\activity\
# 7. Motor de cálculo (clases ofuscadas en el paquete por defecto)
#    <salida>\sources\defpackage\   p. ej. on.java (tanque-a-tanque), jj.java (unidades)
```

---

## 2. Inventario de funciones

62 Activities, con nombres de dominio legibles. Agrupadas por área:

### Núcleo de vehículo y operación

| Pantalla | Función |
|---|---|
| `CadastroVeiculoActivity`, `CadastroVeiculoSimplesActivity`, `OnboardingVeiculoActivity` | Alta de vehículo (completa y simplificada) |
| `CadastroAbastecimentoActivity`, `OnboardingAbastecimentoActivity`, `PerguntaAbastecimentoActivity` | Registro de carga de combustible; la pantalla "Pergunta" pregunta lo que cierra el ciclo de cálculo |
| `CadastroLeituraActivity` | Lectura de odómetro (sin carga) |
| `CadastroServicoActivity` | Servicio / mantenimiento |
| `CadastroLembreteActivity` | Recordatorio |
| `CadastroPercursoActivity` | Ruta / viaje |
| `CadastroChecklistActivity` | Checklist pre-uso del vehículo |
| `RelatorioFiltroActivity`, `GraficoDefaultActivity`, `ListagemDefaultActivity`, `VisualizarDefaultActivity` | Motor genérico de **reportes, gráficos, listados y detalle** reutilizado por cada entidad |

### Finanzas del vehículo

| Pantalla | Función |
|---|---|
| `CadastroDespesaActivity` | Gasto |
| `CadastroReceitaActivity` | **Ingreso** |
| `CadastroTipoDespesaActivity`, `CadastroTipoReceitaActivity` | Categorías de gasto e ingreso |
| `CadastroFormaPagamentoActivity` | Formas de pago |
| `CadastroTransferenciaActivity`, `ListagemTransferenciaActivity`, `CadastroResgatarTransferenciaActivity` | **Transferencia de vehículo entre usuarios por código** |

### Combustible colaborativo (precios de estaciones)

`PostoCombustivelActivity`, `CadastroPostoCombustivelActivity`, `PostoAtualizarPrecosActivity`,
`PostosPrecosActivity`, `PostoFontesActivity`, `PostoCombustivelSugestaoActivity`,
`PostoSugestaoActivity` — catálogo de estaciones, actualización de precios y comparación contra el
promedio.

### Flota, cuenta y monetización

`CadastroColaboradorActivity` (conductores), `CadastroPerfilActivity` (perfiles de permiso),
`PlanosNovoActivity`, `PlanosFrotaActivity`, `SincronizacaoActivity`, `RestaurarBackupActivity`.

**Permisos declarados:** solo `INTERNET`, `VIBRATE`, `WAKE_LOCK`, `DUMP`. Sin permisos de ubicación
→ los precios de estación no se geolocalizan por GPS.

---

## 3. Catálogos maestros (`arrays.xml`)

Estos catálogos son directamente reutilizables como semilla para Quid.

### Tipos de combustible (8)

`Gasoline`, `Gas Midgrade`, `Gas Premium`, `Ethanol`, `Diesel`, `LPG`, `CNG`, `Electric (Slow)`

Agrupados en 4 categorías físicas: **Liquids**, **LPG**, **CNG**, **Electrical**.

### Tipos de gasto (8)

`Financing`, `Fine`, `Parking`, `Licensing`, `Taxes`, `Reimbursement`, `Toll`, `Insurance`

### Tipos de ingreso (5)

`Reimbursement`, `Freight`, `Carpool`, `Ride-hailing App`, `Vehicle Sale`

> El ingreso por app de transporte (Uber/DiDi) y por venta del vehículo están modelados de fábrica.

### Tipos de servicio (18)

`Oil Change`, `Air Conditioning`, `Air Filter`, `Battery`, `Brake Fluid`, `Brake Pads`,
`Fuel Filter`, `Oil Filter`, `Suspension/Shock Absorbers`, `Lights`, `New Tires`,
`Tires - Pressure`, `Tires - Rotation`, `Tires - Alignment/Balancing`, `Scheduled Maintenance`,
`Labor Cost`, `Belts`, `Car Wash`

> Dos detalles de diseño: la **mano de obra** ("Labor Cost") es un tipo de servicio de primera clase,
> y los neumáticos se desglosan en 4 tipos (nuevos / presión / rotación / alineación).

### Motivo del registro (2)

`Work`, `Personal` → permite etiquetar cada gasto o servicio como laboral o personal. Es la base de
la deducibilidad y del reporte de kilometraje de trabajo.

### Unidades

- Líquidos: `Liter (L)`, `Gallon US`, `Gallon Imperial`
- Gas: `kg`, `m³`, `GGE`
- **Eficiencia (12 unidades configurables):** Km/Liter, Km/Gallon US, Km/Gallon Imperial,
  Liter/100Km, Gallon US/100Km, Gallon Imperial/100Km, y las equivalentes en millas.

### Formas de pago (3)

`Cash`, `Credit card`, `Debit card`

### Tipos de campo de formulario (5)

`text`, `textarea`, `checkbox`, `radio`, `select` → hay un **motor de formularios dinámicos**
(`FormularioDTO`, `TipoCampoDTO`) para que el usuario arme sus propias planillas.

---

## 4. Modelo de dominio

> **Advertencia de método.** La capa `db/` está **ofuscada a nivel de miembros**: `AbastecimentoDTO`
> tiene campos llamados `D, E, F, L, N, O, P…` y sus imports son rutas basura inyectadas
> (`com.google.android.gms.ads.mediation.uA.OKYDOes`). Los nombres de campo **no** aportan semántica.
> La semántica se recupera de tres fuentes autoritativas: los arrays de columnas, el mapeo
> `campo ← cursor.getColumnIndex("Columna")`, y la capa de servidor
> **`ws/model/models/Ws*DTO.java`** (46 clases con nombres legibles y anotaciones JSON
> `@s42("clave")`). El modelo que sigue está reconstruido desde esas tres fuentes.

### 4.1 Esquema de base de datos verificado

- SQLite **`ctncar.db`, versión de esquema 45**, con **WAL** activado.
- **29 tablas propias.** **Sin claves foráneas declaradas**: la integridad referencial es de
  aplicación.
- **Bloque de auditoría y sincronización** heredado por toda tabla de negocio:
  `IdXxxWeb` (PK remota), `IdUnico` (UUID de sincronización), `DataAlteracao` (base de la sync
  incremental) y `Status CHAR(1)` con `I` = insertado, `U` = modificado, `S` = sincronizado. Los
  borrados se propagan como *tombstones* en `TbExcluir(IdTabela, Tabela)`.
  → **Directamente relevante para Quid**: es el mismo problema que ya encara el plan local-first
  ([INDEXEDDB_LOCAL_FIRST_PLAN.md](./INDEXEDDB_LOCAL_FIRST_PLAN.md)) con su cola de mutaciones.

### 4.2 Tablas del núcleo

| Tabla | Columnas propias (además del bloque de auditoría) |
|---|---|
| `TbVeiculo` | IdTipoVeiculo, IdMarca, Ativo, Ano, Nome, Placa, Marca, Modelo, **Chassi**, **Renavam**, **Bicombustivel**, IdTipoCombustivel, VolumeTanque, **IdTipoCombustivelDois, VolumeTanqueDois**, Principal, Ajustar, UnidadeDistancia, **ValorCompra, ValorVenda**, Observacao |
| `TbAbastecimento` | IdVeiculo, IdCombustivel, **IdCombustivelDois, IdCombustivelTres**, IdPostoCombustivel, IdTipoMotivo, IdFormaPagamento, IdMotorista, Odometro, Data, Preco/PrecoDois/PrecoTres, ValorTotal/…Dois/…Tres, **SemCusto/…Dois/…Tres**, Volume/…Dois/…Tres, **TanqueCheio/…Dois/…Tres**, **EsqueceuAnterior**, **BateriaInicialPct, BateriaFinalPct, DuracaoMinutos**, Latitude, Longitude, Desconto, Observacao |
| `TbDespesa` | IdVeiculo, IdLocal, IdTipoMotivo, IdFormaPagamento, IdMotorista, Odometro, Data, Titulo, Desconto, **QtdParcelas, PeriodoParcelas**, Observacao |
| `TbDespesaTipoDespesa` | IdDespesa, IdTipoDespesa, **Valor** |
| `TbServico` | IdVeiculo, IdLocal, IdFormaPagamento, IdMotorista, Odometro, Data, Titulo, Desconto, QtdParcelas, PeriodoParcelas, Observacao |
| `TbServicoTipoServico` | IdServico, IdTipoServico, **Valor** |
| `TbReceita` | IdVeiculo, IdTipoReceita, IdMotorista, Odometro, Data, **Valor**, QtdParcelas, PeriodoParcelas, Observacao |
| `TbParcela` | **IdModulo, IdTabela**, Numero, DataVencimento, Valor |
| `TbLeitura` | IdVeiculo, IdMotorista, Odometro, Data, Observacao |
| `TbLembrete` | IdVeiculo, **Tipo**, UnicoRepetir, IdTipoServico, IdTipoDespesa, Odometro, Data, RepetirTempo, Periodo, RepetirDistancia, Observacao |
| `TbPercurso` | IdVeiculo, **IdLocalOrigem, IdLocalDestino**, IdTipoMotivo, IdMotorista, OdometroInicial, OdometroFinal, DataHoraInicial, DataHoraFinal, ValorDistancia, **IdTipoCarga, IdUnidadeMedida, Contratante, Quantidade, Peso, VolumeM3, ValorFrete**, QtdParcelas, PeriodoParcelas, Iniciado, Observacao |
| `TbChecklist` | IdFormulario, IdVeiculo, IdMotorista, Data, Odometro, Observacao, **Respostas (TEXT serializado)** |
| `TbFormulario` | Ativo, Titulo, Descricao, **Questoes (TEXT, JSON)** |
| `TbArquivo` | **IdTipoArquivo, IdTabela**, Nome, NomeOriginal, Tamanho, MimeType, Observacao |
| `TbPostoCombustivel` | IdEmpresa, Nome, **PlaceId**, Endereco, Latitude, Longitude, Ativo, Observacao |
| `TbCombustivel` | IdTipoCombustivel, IdCombustivelEmpresa, IdCorrenteRecarga, **MediaSeparada**, Nome, Ativo, Observacao |
| `TbLocal` | Nome, PlaceId, Endereco, Latitude, Longitude, Ativo, Observacao |
| `TbVeiculoUsuario` | IdVeiculo, **IdUsuario (→ TbColaborador)**, TempoIndeterminado, DataInicial, DataFinal, Ativo |
| `TbColaborador` | IdPerfil, Ativo, Nome, Sobrenome, Email, Telefone, **Cnh, CnhCategoria, CnhValidade** |
| `TbPerfil` | Nome, **EscopoVeiculo** (`todos`/`atribuidos`), **EscopoDados** (`todos`/`proprios`), Permissoes (TEXT) |
| `TbConfiguracao` | Fila única de ajustes: unidades (medida, gas, distancia), criterio de eficiencia, MostrarMediaUltimoAbastecimento, **LembreteDistancia, LembreteDias, LembreteHoraNotificacion**, NotificacaoAbastecimento, NotificacaoCalibragem, NotificacaoPostoCombustivel, NotificacaoVibrar, formatos de fecha/valor e idioma |
| Catálogos | `TbTipoDespesa`, `TbTipoReceita`, `TbTipoServico`, `TbTipoMotivo`, `TbFormaPagamento` — todas con la misma forma: `Nome, Ativo, Observacao` |

**Catálogos en memoria, sin tabla** (verificado: no existen `TbMarca`, `TbTipoVeiculo`,
`TbTipoCombustivel` ni `TbBandeira`): marcas (~2.000), tipos de vehículo (8: carro, moto, ómnibus,
camión, avión, barco, tractor, **generador**), banderas de estación, tipos de carga de flete (12) y
unidades de flete (11).

### 4.3 Tres decisiones de diseño que vale la pena estudiar

1. **El importe vive en el detalle, no en la cabecera.** Ni `TbDespesa` ni `TbServico` tienen columna
   de total: el total es `SUM(detalle) − Desconto`. Un mismo servicio cubre varios tipos a la vez
   (aceite + filtro + alineación) con importe por ítem.
2. **Cuotas polimórficas en una sola tabla.** `TbParcela(IdModulo, IdTabela, Numero,
   DataVencimiento, Valor)` sirve a gastos (2), **ingresos (3)**, servicios (4) y viajes (5). Es un
   patrón compacto: una tabla de vencimientos para todo el sistema, en lugar de una tabla de cuotas
   por entidad.
3. **Adjuntos también polimórficos.** `TbArquivo(IdTipoArquivo, IdTabela)` con
   `IdTipoArquivo`: 1=Usuario, 2=Despesa, 3=Receita, 4=Servico, 5=Percurso, 6=Checklist, 7=Leitura.
   Reemplaza al `Attachment` transversal de Quid, con la diferencia de que Quid ya tiene un modelo
   `Attachment` propio.

### 4.4 Combustible: la tabla más rica

`TbAbastecimento` revela capacidades que Quid no tiene:

- **Hasta 3 combustibles en una misma carga**, cada uno con su propio precio, importe, volumen y
  bandera de tanque lleno → vehículos **bi-combustible** (nafta + GNV, típico en la región).
- **`EsqueceuAnterior`**: bandera de "olvidé registrar la carga anterior". Es la válvula de escape
  para que un olvido no arruine el cálculo de eficiencia.
- **`SemCusto` por combustible**: una carga puede registrarse sin costo (cortesía, carga de empresa)
  y no debe sumar al gasto pero **sí** al volumen para la eficiencia.
- **Vehículos eléctricos**: `BateriaInicialPct`, `BateriaFinalPct`, `DuracaoMinutos` (tiempo de
  recarga). Drivvo modela la carga eléctrica en la misma tabla que el combustible líquido.
- **`Desconto`** a nivel de carga, y **coordenadas** por registro.

**No hay `lib/`**: cero procesamiento de imagen o ML nativo. Toda la inteligencia (eficiencia,
predicción, reportes) es lógica de aplicación.

---

### 4.5 Contrato de sincronización (la capa `ws`)

Drivvo tiene una arquitectura **offline-first con sincronización incremental**, y su contrato está en
`ws/model/models/Ws*DTO.java` (46 clases con nombres legibles y claves JSON explícitas).

**Convención de identidad:** cada entidad declara su PK de servidor en una clave JSON propia
(`id_vehiculo`, `id_despesa`, `id_abastecimento`…) pero **el campo Java se llama siempre `idWeb`**.
No confundir con `id_referencia` (referencia local genérica). El sobre de sincronización
(`WsTabelaDTO`) agrega `acao`, `data_acao` e `id_unico`.

**Protocolo:** `WsSync` declara **27 entidades sincronizables**, cada una con un par
`*_data` (marca temporal, cursor) + `*_num` (contador). Las entidades coinciden con las tablas
propias de la base local. Detalle notable: **las cuotas no se sincronizan como entidad propia** —
viajan anidadas dentro de gasto, ingreso, servicio y viaje, mientras que en la base local son una
tabla polimórfica. Es el mismo dato con dos formas según el lado.

> **Relevancia alta para Quid.** Quid enfrenta exactamente este problema en su plan local-first:
> el patrón de Drivvo (**UUID por fila + estado de fila `I/U/S` + cursor temporal por entidad +
> tombstones de borrado en una tabla aparte**) es una solución probada y simple para sincronización
> bidireccional por entidad. Vale la pena compararlo con la cola de mutaciones de Quid
> ([INDEXEDDB_LOCAL_FIRST_PLAN.md](./INDEXEDDB_LOCAL_FIRST_PLAN.md)) antes de definir el protocolo.

### 4.6 El ecosistema de precios de estación (crowdsourcing)

Es una de las partes más elaboradas de la app y Quid solo la tiene esbozada:

- **`WsCombustivelPrecoDTO`** — precio por combustible y estación, con **bandera `suspeito`** y una
  ventana de **7 días** de recencia (`DIAS_PRECO_RECENTE = 7`). Es decir: un precio viejo o marcado
  como dudoso se trata distinto.
- **`WsContribuicaoPostoDTO`** — aportes de precio por combustible con `total` (cuántos aportes).
- **`WsSugestaoPostoDTO`** — **validación por votos de la comunidad**: `votos`, `necessarios`
  (umbral para aceptar), `meuVoto`, `situacao` y `tem`. La comunidad propone y la comunidad valida;
  nada se acepta con un solo aporte.
- **`WsFontePostoDTO`** — cada fuente de datos trae `credito`, `licenca`, `url`: Drivvo **licencia
  datos de precios de terceros** en lugar de depender solo de sus usuarios.
- **`WsEmpresaDTO`** — entidad rica de estación: dirección desglosada (barrio, ciudad, estado, CEP),
  `place_id` de Google, bandera, `combustiveis` disponibles, `servicos`, `bandeirasRegiao`,
  `historicoPrecos`, `site` y coordenadas.

> **Para Quid:** el modelo `FuelPrice` + `fuel-price-widget.tsx` alcanza para **precios propios y
> promedios locales**, que es lo razonable sin backend comunitario. Lo que sí conviene copiar es la
> **bandera de precio dudoso/antiguo** y la **ventana de recencia**, porque un precio de hace meses
> distorsiona cualquier cálculo de costo por km. El crowdsourcing con votos queda fuera de alcance.

---

## 5. Vocabulario de métricas (lo que la app realmente calcula)

Extraído de `strings.xml`. Esto define el alcance del reporte de Drivvo:

| Etiqueta | Clave de recurso | Significado |
|---|---|---|
| Cost | `custo` | Costo |
| **Cost / Km** | `custo_km` | Costo por kilómetro |
| **Cost / Hour** | `custo_hora` | Costo por hora |
| Cost / Mile | `custo_milha` | Costo por milla |
| **Total cost** | `custo_total` | Costo total del vehículo |
| **Fuel efficiency** | `media` | Rendimiento (km/l). *"média"* es el término de la app para eficiencia |
| Fuel efficiency (%) | `media_efi` | Eficiencia con unidad |
| General average | `media_geral` | Promedio general |
| Period average | `media_periodo` | Promedio del período |
| Daily average | `media_diaria` | Promedio diario |
| Estimated range | `autonomia_estimada` | Autonomía estimada |
| Real tank range | `insight_autonomia` | Autonomía real por tanque |
| Cost per … | `insight_custo_km` | Tarjeta de costo por distancia |
| … per full tank | `insight_v_autonomia` | Valor por tanque lleno |
| **… per day** | `insight_v_por_dia`, `devolutiva_por_dia` | Valor por día |
| Average speed | `devolutiva_velocidade_media` | Velocidad media (viajes) |
| Autonomy difference | `diferenca_autonomia` | Diferencia de autonomía |
| Price vs average | `preco_acima_media`, `preco_abaixo_media`, `preco_na_media` | Precio de estación contra el promedio |

### Gráficos disponibles

`grafico_custos_receitas` (costos e ingresos), `grafico_despesas`, `grafico_receitas`,
`grafico_receitas_mensais`, `grafico_medias`, **`grafico_medias_combustiveis`** (promedios por
combustible), **`grafico_medias_postos_combustiveis`** (promedios por estación),
`grafico_medias_tipo_motivo` (promedio por motivo), `grafico_tipo_despesa`, `grafico_tipo_receita`.

> Existe **una sola vista de gráfico** parametrizada (`GraficoDefaultActivity`), no una por reporte.

---

## 6. La regla del ciclo de eficiencia (hallazgo central)

Drivvo no promedia la eficiencia sobre todos los registros. Usa un **ciclo cerrado entre dos tanques
llenos**. Textos de la propia app:

- *"The fuel efficiency is always calculated between two full tanks. When you fill up the tank, you
  close the cycle of the previous refueling and start a new one. When a cycle closes, the distance
  driven and the fuel efficiency are calculated."* (`strings.xml:1366`)
- *"The average is calculated between two full tanks."* (`strings.xml:1421`)
- *"Default. The fuel efficiency stays on the first of the two full-tank refuelings."*
  (`strings.xml:1364`)

### Regla operativa

1. Cada carga marca el inicio o el cierre de un ciclo.
2. Solo una **carga a tanque lleno** cierra el ciclo anterior.
3. Al cerrar: `eficiencia = (km_actual − km_cierre_anterior) / litros_cargados_en_el_ciclo`
   — es decir, los litros repuestos **en la carga que cierra** equivalen a lo consumido desde la
   carga llena previa.
4. Las cargas parciales intermedias **suman litros** sin cerrar ciclo.

### Dos sutilezas de diseño que vale la pena copiar

- **"Separate average"** (`media_separada_descricao`): un combustible puede registrarse como
  *combustible que no mueve el vehículo* (por ejemplo, para un generador). Su promedio y su costo se
  calculan aparte del resto, del mismo tipo. Sin esto, un consumo atípico contamina el histórico.
- **"Where to show the fuel efficiency"** (`media_onde_exibir`): el usuario elige si el indicador de
  eficiencia se muestra sobre la **primera** o la **última** de las dos cargas que forman el ciclo.
  Aclaración explícita en la app: *"The calculation and the value do not change"* — es solo
  presentación.

> **Impacto para Quid:** Quid ya tiene la lógica de tanque-lleno en
> [`fuel-level.ts`](../src/lib/fuel-level.ts) (filtra `isFullTank`, acumula galones) y deriva
> `avgKmPerGallon`. Lo que falta es **exponer la eficiencia por ciclo como dato de primera clase**
> (histórico por carga, promedio por tipo de combustible, promedio por estación) y no solo como un
> escalar único por vehículo.

---

### Fórmula exacta (verificada en código)

**El volumen que se usa no es el volumen guardado.** Se recalcula siempre a partir del importe y el
precio unitario:

```
volumen(ranura) = SemCusto ? volumenEscrito : (precioUnitario > 0 ? valorTotal / precioUnitario : 0)
```

Al guardar, el volumen escrito se persiste como 0 cuando no es "sin costo"; todo se recalcula en
cada lectura. El **descuento se prorratea por ranura de combustible**:
`descuentoProporcional = (costoRanura / costoTotalCarga) × descuento`, y el precio neto usado en el
cálculo es `(costo − descuentoProporcional) / volumen`. Los tres valores monetarios se persisten
redondeados a 3 decimales (HALF_EVEN).

**El ciclo, en pseudocódigo:**

```
// Un acumulador por CLAVE de combustible.
// clave = tipo de combustible  —  o  "c"+idCombustible si el combustible tiene MediaSeparada
acum = { costoNeto: 0, volumen: 0, precioNetoAnterior: 0, odomTanqueLleno: 0, hayCiclo: false }

para cada carga (ordenada por ODÓMETRO, no por fecha):
  para cada ranura de combustible de esa carga:
    precioNeto = (costo - descuentoProrrateado) / volumen

    si (ranura.tanqueLleno):
        si (acum.hayCiclo):                        // ← CIERRE DE CICLO
            acum.costoNeto += acum.precioNetoAnterior * volumen    // volumen valuado al precio previo
            volumenTotal    = acum.volumen + volumen
            distancia       = odometroCarga - acum.odomTanqueLleno
            si (distancia > 0 y volumenTotal > 0):
                eficiencia  = convertir(distancia, volumenTotal, tipo)   // km/l, según unidad
                costoPorKm  = acum.costoNeto / distancia
                propagar a TODAS las cargas del ciclo cerrado
        acum = { hayCiclo: true, costoNeto: 0, volumen: 0,
                 odomTanqueLleno: odometroCarga, precioNetoAnterior: precioNeto }
    si no:                                          // ← CARGA PARCIAL: solo acumula
        acum.costoNeto += acum.precioNetoAnterior * volumen
        acum.volumen   += volumen
        acum.precioNetoAnterior = precioNeto
```

Cuatro consecuencias que hay que respetar al replicarlo:

1. **No se promedian promedios.** La eficiencia del período es un **cociente de sumas**
   (`Σdistancia / Σvolumen`), no la media de las eficiencias.
2. **La eficiencia se propaga hacia atrás** a todas las cargas del ciclo cerrado, no solo a la carga
   que lo cierra. Por eso la app ofrece elegir en qué carga del par se muestra el indicador.
3. **`esqueceu_anterior` invalida el ciclo abierto**: pone a cero las eficiencias ya calculadas de
   las cargas de ese ciclo, las marca como "sin dato", resetea el acumulador y obliga a un nuevo
   tanque lleno para recomenzar. Es la válvula de escape para un olvido.
4. **`mostrarMediaUltimoAbastecimiento`** decide si la carga que cierra el ciclo entra en la lista de
   propagación antes o después — es decir, si el indicador aparece en la primera o en la última del
   par. El cálculo no cambia.

### Conversión de unidades (12 combinaciones)

La eficiencia se calcula internamente en litros y kilómetros, y se convierte a la unidad elegida por
el usuario. Constantes: `0,264172` L/galón US · `0,219969` L/galón imperial · `1,609344` km/milla.

| # | Unidad | Fórmula |
|---|---|---|
| 1 | km/L | `km / litros` |
| 2 | km/galón US | `km / (litros × 0,264172)` |
| 3 | km/galón imperial | `km / (litros × 0,219969)` |
| 4 | L/100 km | `(litros / km) × 100` |
| 5-6 | galón US / imperial por 100 km | `((litros × factor) / km) × 100` |
| 7-9 | milla/L, milla/galón US, milla/galón imp. | `millas / (litros × factor)` |
| 10-12 | L, galón US, galón imp. por 100 millas | `((litros × factor) / millas) × 100` |

Para **eléctricos** (combustible tipo "eléctrico") la energía entra en kWh y las mismas 12 posiciones
devuelven km/kWh o kWh/100 km. Todo se redondea a 3 decimales.

> **Relevante para Colombia:** Quid trabaja hoy en galones fijos. Drivvo demuestra que la unidad debe
> ser **configuración del usuario** (12 combinaciones de eficiencia + 3 de volumen + 3 de gas), porque
> el mismo producto se usa con litros, galones y kWh. Como mínimo, Quid debería rotular correctamente
> y permitir litros para quien cargue así.

### Fórmulas de los reportes

Verificadas en el motor de informes:

```
distancia      = max(odómetro) − min(odómetro) del período
gastoTotal     = Σ(costos de carga) − Σ(descuentos)
días           = días calendario entre primera y última carga, INCLUSIVE (+1)
costoPorDía    = gastoTotal / días
costoPorKm     = gastoTotal / distancia          // o por hora si la unidad de distancia es "hora"
proyecciónMes  = costoPorDía × 30
volumenPorDía  = volumenTotal / días
precioMedio    = Σcosto / Σvolumen               // ponderado, no media de medias
precioMenor/Mayor = min/max del precio unitario por carga
%TanqueLleno   = (cargas con tanque lleno × 100) / totalCargas
distanciaEntreCargas = distancia / (nºCargas − 1)
díasEntreCargas      = (días − 1) / (nºCargas − 1)
```

**Métricas de los insights mensuales** (una capa más analítica, agrupada por mes):

```
costoPorKmMes        = gastoMes / distanciaMes
lucroPorKm           = (ingresosMes − gastoMes) / distanciaMes      ← ¡balance por km!
kmPorDía             = distanciaMes / díasDelMes
%categoría           = round(categoría × 100 / gastoMes)            // combustible / servicio / gasto
variaciónPrecioMes   = ((precioMesActual − precioMesAnterior) × 100) / precioMesAnterior
variaciónGastoAnual  = comparación contra el mismo mes del año anterior
costoMantenimientoPorKm = Σservicios / distanciaMes
```

**Por estación de servicio** (esto es lo que habilita "esta estación rinde más"):

```
precioEstación = Σ(importe_i) / Σ(importe_i / precio_i)     // precio ponderado real de la estación
desvíoEstación = ((precioEstación − precioMedioGlobal) / precioMedioGlobal) × 100
ahorroEstimado = (precioMedioGlobal − precioMejorEstación) × Σvolumen
```

La "mejor estación" exige **al menos 2 registros** para no coronar a alguien por una sola carga. El
ahorro anualizado se calcula escalando el ahorro del período a 365 días.

### Validación de odómetro (regla precisa)

Es una de las partes mejor pensadas y Quid no la tiene formalizada. La regla es doble:

```
odómetro debe ser  ≥  max(odómetro de los registros con fecha ANTERIOR)
              y    ≤  min(odómetro de los registros con fecha POSTERIOR)
```

Fuentes consideradas: cargas, gastos, servicios, ingresos, lecturas y checklists del mismo vehículo
(con odómetro > 0), excluyendo el registro que se está editando. Además:

- Si el odómetro supera **5 × el máximo histórico** del vehículo → aviso de "odómetro sospechoso".
- Odómetro duplicado en la misma fecha y vehículo → **bloquea** el guardado.
- Si al violar la secuencia hay registros reordenables, la app ofrece **reordenar** en lugar de
  rechazar.
- El motor de consumo ordena por **odómetro**, no por fecha: un odómetro mal cargado desordena los
  ciclos.
- La validación ocurre **solo en la UI** de alta/edición: los datos importados o sincronizados no se
  revalidan. Es un hueco que conviene no copiar.

### Vehículos eléctricos

- En una carga eléctrica, **"tanque lleno" se deriva** de `bateríaFinalPct >= 100` en lugar de
  marcarse a mano.
- La energía cargada se calcula como
  `energía (kWh) = ((bateríaFinalPct − bateríaInicialPct) / 100) × capacidadBatería`.
- El bloque eléctrico se ignora si los datos de batería son inválidos
  (`final > 0 && (inicial > 0 || final < 100)`).

> Para Colombia esto habilita híbridos y eléctricos con el mismo modelo, sin tabla aparte — el mismo
> enfoque que Drivvo ya usa en su tabla única de carga.

### Casos borde que hay que decidir explícitamente

| Situación | Qué hace Drivvo |
|---|---|
| Primera carga, o antes del primer tanque lleno | Sin eficiencia; la UI dice "aún no hay" |
| Carga parcial | Solo acumula; la eficiencia llega con el próximo tanque lleno y se propaga a todo el ciclo |
| `esqueceu_anterior` | Invalida el ciclo abierto y obliga a recomenzar |
| Distancia ≤ 0 o volumen ≤ 0 al cerrar | No calcula eficiencia |
| Precio unitario 0 sin `SemCusto` | Volumen 0 ⇒ sin eficiencia |
| Todos los importes 0 con descuento > 0 | Descuento prorrateado = 0 |
| Descuento mayor que la suma de importes | **Bloquea** el guardado |
| Precio > 3× el último del mismo combustible | Aviso no bloqueante |
| Volumen implícito > 3× el último | Aviso no bloqueante |
| Reporte con una sola carga | Días = 0 ⇒ costo/día y proyección = 0 |
| Reporte sin distancia (max = min odómetro) | Costo/km = 0 |
| Dos ranuras con la misma clave en una carga | Un solo acumulador; conserva el **primer** tanque lleno y suma volúmenes (sin chequeo de coherencia) |
| Carga con volumen 0 dentro de un ciclo | Infla el km/L del ciclo; **no está contemplado** |

> Los dos últimos son **defectos latentes** de Drivvo. Al replicar, conviene resolverlos: agrupar por
> combinación de combustible y rechazar o marcar una carga de volumen cero dentro de un ciclo abierto.

## 7. Motor de predicción

Hay dos predicciones distintas en la app, y conviene no confundirlas.

### 7.1 Predicción de tanqueo (retención)

Textos de notificación (`strings.xml:1507-1513`):

- *"%1$s are due for a fill-up record."*
- *"Your tank must be running low. Latest fuel efficiency: %1$s. Log the fill-up and see if it holds."*
- *"Your tank must be running low. Log the fill-up to keep your history up to date."*
- Umbrales `_10` y `_25`: *"Filled up already?"* / *"Shall we pick it back up?"* con los textos
  *"Log it and your fuel efficiency and cost per distance stay up to date."* y *"One record now
  reconnects your vehicle history."*

**Mecánica verificada (corrige la interpretación inicial).** Los umbrales `0 / 10 / 25` **no son
días sin registrar**: son **días de atraso respecto de la fecha estimada de tanqueo**. La cadena es:

```
km_por_dia      = (odómetro_máx − odómetro_mín del combustible) / días entre primera y última carga
días_hasta_next = autonomía_restante / km_por_dia          (fallback: 10 días)
fecha_estimada  = fecha_último_tanqueo + días_hasta_next
```

Se notifica exactamente cuando el atraso contra esa fecha estimada es 0, 10 o 25 días (cualquier
otro valor no dispara). Si hay varios combustibles, se toma el **mayor** km/día entre ellos.

> **Este es el único lugar de la app donde existe una tasa de km/día**, y sirve al pronóstico de
> tanqueo, no al mantenimiento. Es un dato relevante para Quid: demuestra que la técnica es
> confiable para combustible (donde hay muchos registros) pero **Drivvo no la aplica al
> mantenimiento**, donde los registros son escasos.

### 7.2 Previsión de recordatorios de mantenimiento

- `previsao_proximo_lembrete` — *"Next reminder forecast"*
- `previsao_lembrete_base_servico` — *"Based on a registered service."*
- `previsao_lembrete_base_despesa` — *"Based on a registered expense."*

Es decir: la previsión del próximo vencimiento se **ancla en el último servicio o gasto registrado**
para ese concepto, y se proyecta con la periodicidad configurada.

#### Cómo funciona (verificado en código)

`LembretePrevisaoDTO` **no es una tabla**: es un *view-model calculado* que se construye con
`(contexto, vehículo, odómetro actual, recordatorio, configuración)` y deriva todo lo que la UI
necesita mostrar. Su mecánica:

1. **El recordatorio es de un solo tipo.** El booleano `Tipo` de `TbLembrete` decide si es un
   recordatorio de **gasto** (`IdTipoDespesa`) o de **servicio** (`IdTipoServicio`). Nunca ambos.
2. **Busca el último hecho comparable**: si es de gasto, el último `Despesa` de ese vehículo con ese
   tipo; si es de servicio, el último `Servico` con ese tipo. De ahí obtiene **odómetro y fecha de
   referencia**.
3. **Dos ejes de vencimiento independientes y combinables**, tal como los almacena la tabla:
   - por **distancia**: `Odometro` objetivo y `RepetirDistancia` (cada X km)
   - por **tiempo**: `Data` objetivo y `RepetirTempo` + `Periodo` (cada X días/meses)
   - `UnicoRepetir` distingue recordatorio **único** de **repetible**.
4. **Deriva el estado**: si está vencido/atrasado, el delta (en km o en días), textos ya formateados
   del tipo *"hoy"*, *"en X km"*, *"hace X días"*, la fecha objetivo formateada, los días restantes y
   un color de semáforo.
5. **La anticipación del aviso es configuración global**, no del recordatorio:
   `TbConfiguracao.LembreteDistancia` (km de antelación) y `LembreteDias` (días de antelación), más
   `LembreteHoraNotificacion` (hora del día para notificar) y los interruptores de notificación
   (`NotificacaoAbastecimento`, `NotificacaoCalibragem`, `NotificacaoPostoCombustivel`,
   `NotificacaoVibrar`).

6. **El motor es determinista y sin aprendizaje.** La proyección es literalmente
   `próximo = último_registro_real + intervalo` — **no extrapola ni estima tasas**. La única
   heurística del motor es una normalización para *ordenar* la lista por urgencia
   (`min(días/30, km/1000)`), con divisores fijos que representan "1 mes ≈ 1.000 km", **no** una tasa
   medida.
7. **No hay reprogramación explícita ni marca de "hecho".** Verificado: no existe ningún `UPDATE`
   de negocio sobre la tabla de recordatorios. El "próximo vencimiento" **se recalcula en cada
   render** consultando el último registro real de ese tipo (`ORDER BY Data DESC`). La
   reprogramación es un **efecto emergente**: cuando el usuario registra el servicio o gasto, ese
   registro pasa a ser la nueva base del ciclo y la proyección avanza sola.

#### Máquina de estados de la notificación (lo más replicable)

El disparador es una escalada monótona con memoria mínima:

- Una **clave de ciclo** `ref = fecha_proyectada + "_" + odómetro_proyectado` se guarda en
  preferencias. Si cambia, se reinician los estados de notificación. **Es la única memoria por
  recordatorio, y no vive en la base de datos.**
- **Etapa por fecha**, según días de diferencia con la fecha proyectada: atrasado ≥7 días → 3;
  ≥3 días → 2; hoy o atrasado → 1; dentro de la ventana de anticipación → 0; fuera → sin aviso.
- **Etapa por km**: objetivo alcanzado → 1; faltan ≤ anticipación configurada → 0; si no, sin aviso.
- **Solo se notifica si la etapa nueva es mayor que la almacenada** → sin repeticiones y sin
  retrocesos. Una vez alcanzada la etapa máxima, no vuelve a molestar hasta que el ciclo cambie.
- La notificación ofrece una acción secundaria **"Registrar gasto/servicio"** que abre el formulario
  ya prellenado con el tipo correspondiente.
- Programación: **WorkManager** (trabajo periódico único diario a la hora configurada, intervalo 24 h
  con 5 min de flexibilidad), **no `AlarmManager`**. No hay ninguna referencia a `AlarmManager` en la
  app.
- Además hay una notificación de odómetro con **respuesta en línea**: valida que el valor sea mayor
  que el odómetro actual y menor que este + 100.000, y lo inserta como lectura — lo que **sube
  `MAX(odómetro)` y corrige las proyecciones** sin abrir la app.

> **Defecto detectado en Drivvo (no copiar):** el inicializador de configuración lee la preferencia
> de km de anticipación pero **no** la de días, y fija 30 por defecto. Si el usuario elige los días
> antes del primer arranque, ese valor se pierde. Además, el mismo par de valores (km y días) se
> reutiliza como umbral de color (dividido por 2), lo que mezcla dos conceptos distintos.

> **Observación de diseño:** la anticipación vive en la **configuración global** (dos números), no en
> cada recordatorio. Es más simple pero menos flexible que Quid, que ya tiene `warningKm` y
> `warningDays` **por recordatorio** — Quid está mejor aquí y conviene conservarlo.

> **Impacto para Quid:** el modelo `VehicleReminder` de Quid ya tiene `triggerMode: date | km |
> hybrid`, `dueDate`, `dueKm`, `warningKm`, `warningDays`, `repeatIntervalKm`,
> `repeatIntervalDays`. Lo que conviene copiar de Drivvo es el patrón de **anclar la referencia en el
> último servicio o gasto registrado** (`ORDER BY Data DESC`) en lugar de confiar solo en el número
> guardado en el recordatorio — así el ciclo avanza solo cuando el usuario registra el hecho, y no
> hay que mantener una marca de "hecho".
>
> Y hay una **mejora que Drivvo no tiene y Quid sí puede dar**: como Drivvo no extrapola con tasa de
> km/día para el mantenimiento, un recordatorio por kilometraje solo muestra *"faltan 800 km"*, sin
> fecha. Quid ya calcula `avgKmPerDay` en [`fuel-level.ts:226`](../src/lib/fuel-level.ts#L226), así
> que puede mostrar además **"≈ 12 de marzo"**. Sería una ventaja competitiva concreta, no una copia,
> y el esfuerzo es bajo.

---

## 8. El puente Transporte → Finanzas

### 8.1 Estructura

Drivvo modela el dinero del vehículo como **gastos + ingresos**, ambos atados al vehículo, con
categoría propia y forma de pago:

```
Veiculo ──┬── Abastecimento ── (costo, litros, precio)
          ├── Servico ──────── (costo, tipos de servicio[])
          ├── Despesa ──────── TipoDespesa + FormaPagamento (+ Parcela = cuotas)
          ├── Receita ──────── TipoReceita + FormaPagamento
          └── Percurso ─────── distancia, velocidad media, finanzas del viaje
```

Puntos clave (verificados en el esquema):

1. **Gastos e ingresos son entidades separadas y simétricas**, cada una con su catálogo de tipos:
   `TbDespesa` + `TbDespesaTipoDespesa` y `TbReceita`. **Ambas cuelgan del vehículo**
   (`IdVeiculo NOT NULL`).
2. **El importe no vive en la cabecera.** `TbDespesa` y `TbServico` no tienen columna de total: el
   total es `SUM(ítems del detalle) − Desconto`. Un servicio puede cubrir varios tipos a la vez
   (aceite + filtro + alineación) con importe por ítem.
3. **Cuotas en una tabla polimórfica**: `TbParcela(IdModulo, IdTabela, Numero, DataVencimiento,
   Valor)` con `IdModulo` 2=gasto, **3=ingreso**, 4=servicio, 5=viaje. Es decir, Drivvo puede
   **financiar y cobrar en cuotas tanto gastos como ingresos**, servicios y fletes.
4. **La carga de combustible y el servicio son independientes de `Despesa`/`Receita`.** Verificado:
   `TbAbastecimento` no referencia ninguna despesa y `TbDespesa` no referencia ningún abastecimiento
   ni servicio. **No hay asiento financiero automático**: cada tabla lleva su propio costo y los
   reportes los **agregan** por vehículo y período. Esto es una diferencia de arquitectura
   importante frente a Quid (ver abajo).
5. **Todo se atribuye a un conductor.** `IdMotorista` está presente en `TbAbastecimento`,
   `TbDespesa`, `TbServico`, `TbReceita`, `TbLeitura`, `TbPercurso` y `TbChecklist`. Es la base para
   imputar costos e ingresos por conductor en un contexto de flota.
6. **Etiqueta de motivo** (`IdTipoMotivo` → `Work` / `Personal`) en `TbAbastecimento`, `TbDespesa` y
   `TbPercurso`.
7. **El viaje tiene su propia liquidación**: `ValorDistancia`, `ValorFrete`, `Contratante`,
   `Quantidade`, `Peso`, `VolumeM3`, `IdTipoCarga`, `IdUnidadeMedida`, más cuotas propias. Un viaje
   con `IdTipoCarga > 0` es un **flete facturable** y aparece como ingreso.

### 8.1.1 La fórmula del balance por vehículo (verificada)

Esto es lo que Drivvo entrega y Quid no tiene. El agregado por vehículo combina **seis
subagregadores** (combustible, gastos, ingresos, servicios, viajes/fletes y lecturas) y produce:

```
costoTotal   = combustible + gastos + servicios
ingresoTotal = ingresos + fletes
hayGanancia  = ingresoTotal > costoTotal
resultado    = |ingresoTotal − costoTotal|          // se muestra con ícono de ganancia o pérdida
```

Y cada uno de esos tres valores se expone en **tres vistas simultáneas**: total del período,
**por día** y **por distancia**. El costo también se desglosa por componente (combustible / gastos /
servicios / ingresos) en las mismas tres vistas.

**Detalles estructurales confirmados** (útiles para el modelado):

- **El gasto y el servicio llevan el importe en su tabla hija**, desglosado por categoría, con
  `total = Σ categorías − Descuento`. El **ingreso**, en cambio, lleva el importe directo en su
  cabecera. Es una asimetría deliberada: un gasto suele repartirse entre categorías, un ingreso no.
- **El motivo (`Work`/`Personal`) es transversal** a carga de combustible, gasto y viaje — pero
  **no** a servicio.
- **Solo el gasto, el ingreso, el servicio y el viaje se pueden dar en cuotas**; la carga de
  combustible no tiene columnas de cuotas. Los módulos de cuota son
  1=carga, 2=gasto, 3=ingreso, 4=servicio, 5=viaje.
- **Todo se sincroniza por tabla con delta temporal** (encabezado de fecha de acción + contadores por
  entidad), y las cuotas y los desgloses de categoría viajan **anidados dentro del padre**, no como
  entidades propias.

### 8.1.2 Contraste con el diseño de Quid

| Aspecto | Drivvo | Quid |
|---|---|---|
| Registro contable | **Tablas separadas por tipo** (`Despesa`, `Receita`, `Abastecimento`, `Servico`, `Percurso`), agregadas solo en reportes | **Un libro único** (`Transaction`) con `sourceModule` + `sourceId` apuntando al registro de origen |
| Asiento automático desde transporte | **No existe** | **Sí**: [`transport-finance.ts`](../src/lib/transport-finance.ts) crea `Transaction`/`Installment` al registrar el gasto |
| Cuotas | Tabla polimórfica para gastos, ingresos, servicios y viajes | `Installment` ligado a `Debt` (tarjeta de crédito) |
| Ingresos del vehículo | Entidad de primera clase | **No existe** |

> **Conclusión de arquitectura:** el diseño de Quid (libro único con trazabilidad por
> `sourceModule`/`sourceId`) es **más sólido** que el de Drivvo para el objetivo de Quid, porque
> evita duplicar la lógica contable en cinco tablas y ya resuelve presupuesto, saldo y cuotas. **No
> conviene copiar el modelo de tablas separadas.** Lo que sí hay que copiar de Drivvo es la
> **cobertura**: que el libro acepte también **ingresos** originados en transporte, con su catálogo
> de tipos y su atribución al vehículo y al conductor.

### 8.2 Transferencia de vehículo entre usuarios

Textos de la app: `codigo_transferencia` (*"Transfer code"*),
`compartilhar_concluir_transferencia` (*"To complete the transfer, enter this code on the transfer
redemption screen."*) y `msg_transferencia_concluida` (*"Transfer completed successfully!"*).

**Modelo verificado** (`WsTransferenciaDTO`): la transferencia se identifica por un **código** con
**`data_expiracao`** y **`tempo_restante`**, apunta a un `id_vehiculo`, y — esto es lo interesante —
lleva **banderas por tipo de dato a transferir**: `abastecimento`, `despesa`, `receita`, `servico`,
`percurso`, `leitura`, `lembrete`.

Es decir: no es un traspaso todo-o-nada. El emisor **elige qué historial viaja** con el vehículo.
El caso de uso es vender el vehículo y pasarle al comprador la historia de mantenimiento (que
sostiene el valor de reventa) pudiendo excluir lo financiero.

**Confirmaciones importantes:** el código se compone de **dos partes** que se comparten como texto
(el receptor las pega en la pantalla de canje), tiene **expiración**, y **no mueve dinero** — no hay
importe, saldo ni cuenta destino en el modelo. Es una **copia selectiva de historial entre cuentas**,
y **requiere plan pago**. Al canjear, la app lleva al usuario a la pantalla de sincronización para
bajar lo recibido.

> **Para Quid:** es la funcionalidad que cierra el ciclo de vida del vehículo y Quid no tiene nada
> equivalente. Si se implementa, el patrón es reutilizable: Quid ya tiene el concepto de invitación
> por token en `AccountInvitation`, y `Transaction.sourceModule`/`sourceId` permite reasignar el
> historial financiero sin duplicarlo. **Prioridad baja** salvo que el producto apunte a compraventa
> de vehículos usados.

### 8.3 Flota y multiusuario

Textos de la app:

- `atribuicao_motorista_veiculo` — *"Driver/vehicle assignment"*
- `descricao_motorista` — *"The driver has access only to the vehicle selected by the fleet
  manager."* → **alcance por rol**: el conductor ve solo el vehículo que le asignaron
- `gerencia_uma_frota`, `planos_frota`, `plano_frota` — planes de flota por cantidad de vehículos
- `corp_bloqueio_motorista_texto`, `expira_texto_frota` — al vencer la suscripción se **bloquean
  los registros nuevos para todo el equipo**, pero los existentes siguen visibles

#### Implementación verificada

- **`TbVeiculoUsuario`** es el puente **N:M vehículo ↔ conductor con vigencia temporal**:
  `(IdVehiculo, IdUsuario, TempoIndeterminado, DataInicial, DataFinal, Ativo)`. Un vehículo puede
  pasar por varios conductores a lo largo del tiempo, y las consultas de listado de vehículos se
  filtran con un JOIN triple sobre esta tabla cuando el usuario es corporativo.
- **Perfiles fijos, con permisos granulares.** Hay tres roles predefinidos:
  **Administrador** y **Manager** (idénticos: ven todos los vehículos y todos los datos) y
  **Conductor** (vehículos **asignados** y datos **propios**; sin acceso a reportes, sin alta/edición
  de usuarios ni de vehículos). Por encima de esos tres, el sistema permite **perfiles
  personalizados** con un mapa de permisos por módulo y acción: 16 módulos (carga, gasto, ingreso,
  servicio, viaje, checklist, recordatorio, lectura, combustible, estación, local y los 5 catálogos)
  × 4 acciones (ver, crear, editar, eliminar).
- **El filtro de datos por conductor es real**: cuando el perfil es "datos propios", **cada consulta**
  agrega la condición de que el registro sea de ese conductor, tanto en SQL como en los agregados de
  los reportes.
- **Detalle importante:** `IdUsuario` en `TbVeiculoUsuario` apunta a **`TbColaborador`**, no a
  `TbUsuario`, y la vinculación con el usuario remoto se resuelve por `IdColaboradorWeb`. La
  distinción "dueño de cuenta" vs "conductor" está separada en el modelo.
- **El conductor también tiene ficha propia** (`TbColaborador`) con datos de licencia: `Cnh`,
  `CnhCategoria`, `CnhValidade` — con vencimiento de licencia, algo que Quid no tiene.

> **Impacto para Quid:** `Vehicle.userId` es único, así que hoy no hay forma de compartir un
> vehículo. Si Quid va hacia flotas, el patrón de Drivvo (**puente N:M con vigencia + perfil con
> escopo de vehículos y datos**) es el camino probado, y se apoya en el mismo patrón que Quid ya usa
> en `SharedAccountUser` para cuentas compartidas. También vale la pena copiar la **ficha de
> conductor con vencimiento de licencia**, que habilita un recordatorio que Quid puede resolver sin
> ningún modelo nuevo.

### 8.4 Monetización (relevante para el diseño de producto)

| Límite | Evidencia |
|---|---|
| **1 ingreso por mes en el plan gratuito** | `limite_receita_titulo`: *"1 income entry per month on the free plan"*; `bloqueio_receita_novo_plano` |
| Ingresos ilimitados | `receitas_ilimitadas` |
| Checklists solo en plan Flota | `bloqueio_checklist_novo_plano`: *"To use Checklists, upgrade to a Fleet plan"* |
| Hasta 2 conductores | `ate_dois_motoristas_voce_dependente` |
| Flota > 100 vehículos: plan a medida | `frota_acima_de_100` |
| Perfiles personalizados | `perfis_personalizados` (pago) |

> Decisión de producto interesante: **el ingreso es la función que se cobra**. Es coherente con el
> público objetivo (conductores de app, fleteros) para quienes el ingreso es el dato que más vale.

**Límites aplicados (verificados en código, no solo en textos).** Son más precisos que lo que sugieren
las cadenas de UI:

| Límite del plan gratuito | Implementación |
|---|---|
| **2 vehículos** | Bloquea el alta del tercero |
| **1 ingreso por vehículo por mes** | Cuenta los ingresos del mes de ese vehículo y bloquea el segundo |
| Conductores | Tope por plan; **el dueño (perfil administrador) no consume cupo** |
| Adjuntos | Bloqueados por completo |
| Exportar datos | Bloqueado |
| Checklist, formularios y perfiles personalizados | Requieren cuenta corporativa/flota |

Que el **ingreso sea la función medida y limitada por mes** confirma la hipótesis de producto: es el
dato que el usuario objetivo más valora y el que sostiene la conversión a pago.

---

## 9. Análisis de brecha contra Quid-App

Auditoría de lo que Quid **ya tiene** (para no reimplementar) y lo que falta.

### 9.1 Quid ya está a la par o mejor

| Capacidad | Quid | Comparación con Drivvo |
|---|---|---|
| Detección de anomalía de consumo | [`fuel-level.ts:240-262`](../src/lib/fuel-level.ts#L240) — umbral 30% sobre consumo esperado | **Quid es mejor**: Drivvo no expone detección de anomalías |
| Autonomía y días hasta el tanqueo | `estimatedRange`, `daysUntilRefuel`, `refuelByDate` | A la par |
| Costo por km | [`transport-page.tsx:2505`](../src/components/transport/transport-page.tsx#L2505) | A la par |
| Recordatorios por fecha / km / híbrido | `VehicleReminder.triggerMode`, `warningKm`, `warningDays`, `repeatInterval*` | A la par |
| Documentos con vencimiento y aviso | `VehicleDocument` con `expiryDate` + `reminderDays` (SOAT, tecnomecánica) | **Quid es mejor**: Drivvo lo cubre con gasto + recordatorio genérico |
| Pago con cuenta/bolsillo/tarjeta **y cuotas** | [`transport-finance.ts`](../src/lib/transport-finance.ts) crea `Transaction` o `Installment` con impacto en presupuesto, saldo y deuda | **Quid es mejor**: Drivvo solo tiene cash/crédito/débito sin cuotas ni impacto en presupuesto |
| Reversión del asiento financiero | `reverseFinanceEntry` | **Quid es mejor** |
| Logros / gamificación | `AchievementProgress` + `api/achievements` | A la par |
| Precio de combustible | modelo `FuelPrice` + `fuel-price-widget.tsx` | Parcial (ver 9.2) |

**Detalle verificado de la gamificación de Drivvo** (para calibrar la comparación): son **20 insignias**
con umbrales explícitos — cantidad de cargas (1, 25, 50, 75, 100, 250, 500, 1000), tanques llenos
(15, 45, 90, 150), años de uso (1–4), 10 estaciones distintas, y niveles "VIP" (25 y 50). Están
atadas al **volumen de uso registrado**, y son **revocables**: si el usuario borra registros y baja del
umbral, la insignia se retira. Es un diseño de retención por acumulación, no por calidad de datos.
Quid ya tiene `AchievementProgress` y una API de logros, así que la brecha acá es de **catálogo**, no
de infraestructura.

### 9.2 Brechas reales, ordenadas por valor

| # | Brecha | Drivvo | Quid hoy | Esfuerzo |
|---|---|---|---|---|
| 1 | **Eficiencia por ciclo y por combustible** | Ciclo tanque-a-tanque + promedio general/período/por combustible/por estación | Un escalar `avgKmPerGallon` por vehículo | Bajo |
| 2 | **Fecha estimada de vencimiento por km** | `LembretePrevisaoDTO` proyecta el próximo vencimiento | `dueKm` sin proyectar a fecha, pese a tener `avgKmPerDay` | Bajo |
| 3 | **Costo por día y costo por hora** | `insight_v_por_dia`, `custo_hora` | Solo costo por km y costo mensual | Bajo |
| 4 | **Ingresos por vehículo + balance** | `Receita` con 5 tipos, gráfico costos vs ingresos | **No existe**: el puente es solo de gastos | Medio |
| 5 | **Etiqueta trabajo/personal** | `tipo_motivo` (Work/Personal) | No existe | Bajo |
| 6 | **Eficiencia por estación de servicio** | `grafico_medias_postos_combustiveis` | `FuelLog.station` es texto libre, sin entidad estación | Medio |
| 7 | **Comparación de combustibles** | Calculadora flex: relación etanol/gasolina contra umbral ajustable (default 70%) | No existe | Bajo-Medio |
| 8 | **Viajes con finanzas y velocidad media** | `PercursoDTO` + `financeiro_viagem` | No hay modelo de viaje | Medio |
| 9 | **Flota / conductores con roles** | Asignación conductor↔vehículo, scoping por rol | `Vehicle.userId` único | Alto |
| 10 | **Checklist pre-uso** | 9 ítems de inspección básica | No existe | Medio |
| 11 | **Fletes** (carga y unidades) | 11 unidades de carga, valor de flete | No existe | Medio (nicho) |
| 12 | **Transferencia de vehículo por código** | Código de traspaso con historial | No existe | Alto |
| 13 | **Unidad de medida configurable** | 12 unidades de eficiencia + L/gal | Galones fijos | Bajo |

> **La brecha #1 y #5 son las de mejor relación valor/esfuerzo**, y #2 es casi trivial porque el dato
> ya se calcula. #4 es la brecha conceptual más importante: sin ingresos, el módulo de transporte no
> puede cerrar un balance por vehículo, que es justamente lo que un conductor necesita.

---

## 10. Plan de integración propuesto

### Fase 1 — Métricas y etiquetas (bajo esfuerzo, alto valor)

1. **Eficiencia por ciclo** — derivar en el servidor (o en un helper nuevo
   `src/lib/fuel-efficiency.ts`) los ciclos tanque-a-tanque desde `FuelLog` (`isFullTank`, `km`,
   `gallons`, `date`) y exponer:
   - eficiencia del último ciclo
   - promedio general y del período
   - promedio **por `fuelType`** y **por `station`**
   - Reutilizar el criterio ya presente en `fuel-level.ts` para no divergir.
2. **Costo por día y costo por hora** — junto al `selectedCostPerKm` existente en
   `transport-page.tsx`, agregar `costoPorDia = costoTotal / díasTranscurridos` y
   `costoPorHora` si se registra tiempo de uso.
3. **Etiqueta `motivo` (`work` / `personal`)** en `FuelLog`, `MaintenanceRecord` y `VehicleDocument`
   (`purpose String? @default("personal")`), para habilitar reporte de kilometraje laboral.
4. **Proyección de recordatorios** — nuevo helper que, para cada `VehicleReminder` con `dueKm`,
   calcule `fechaEstimada = hoy + (dueKm − currentKm) / avgKmPerDay`, reutilizando
   `avgKmPerDay` de `fuel-level.ts`. Mostrarlo en el detalle del vehículo.

### Fase 2 — Ingresos y balance (cierra el puente con Finanzas)

1. Nuevo modelo `VehicleIncome` (o reutilizar `Transaction` con `type: "income"` +
   `sourceModule: "transport"`), con `vehicleId`, `type` (catálogo de 5), `amount`, `date`,
   `paymentMethod`, `accountId`, `subAccountId`.
2. Extender [`transport-finance.ts`](../src/lib/transport-finance.ts) con `createIncomeEntry()`
   simétrico a `createFinanceEntry()`: acredita saldo en cuenta/bolsillo, ajusta presupuesto de
   ingreso, y registra `Transaction` con `sourceModule/sourceId`. La reversión ya está resuelta por
   `reverseFinanceEntry` (que hoy asume gasto: hay que hacerla consciente del tipo).
3. **Balance por vehículo**: `ingresos − (combustible + mantenimiento + documentos + gastos)`, con
   desglose por categoría. Esto es el "Costs and income chart" de Drivvo.
4. Catálogo de tipos de ingreso adaptado a Colombia: Uber/DiDi/Rappi, fletes, acarreos, venta de
   vehículo, reembolsos.

### Fase 3 — Comparación de combustibles y viajes

1. **Comparador de combustibles** adaptado a Colombia: corriente / extra / diésel / GNV. La fórmula
   correcta no es la regla fija del 70% brasileña, sino **costo por kilómetro de cada opción**:
   `costoPorKm = precioUnidad / eficienciaUnidad`, con la eficiencia histórica por combustible. Se
   elige el de menor costo por km y se muestra el ahorro.
2. **Modelo de viaje** (`Trip`): distancia, duración, velocidad media, motivo, ingreso asociado.
   Habilita el reporte de kilometraje laboral de la Fase 1.

### Fase 4 — Flota (solo si el producto va hacia flotas)

1. `VehicleUser` (asignación conductor↔vehículo) + roles reutilizando el patrón de
   `SharedAccountUser`.
2. Checklist pre-uso (los 9 ítems de Drivvo son una buena semilla).
3. Transferencia de vehículo por código, reutilizando el patrón de `AccountInvitation`.

### Cambios de esquema concretos (fase 1 y 2)

```prisma
// Fase 1: etiqueta de motivo y eficiencia por ciclo
model FuelLog {
  // ...campos actuales...
  purpose          String?   @default("personal") // work | personal  (nuevo)
  // La eficiencia por ciclo se puede derivar; si se persiste por rendimiento:
  cycleEfficiency  Float?    // km por unidad del ciclo cerrado por esta carga (nuevo)
}

// Fase 2: ingresos del vehículo
model VehicleIncome {
  id            String   @id @default(cuid())
  vehicleId     String
  userId        String
  type          String   // ride_hailing | freight | carpool | sale | reimbursement | other
  amount        Decimal
  date          DateTime
  paymentType   String   @default("account") // account | credit_card | cash
  accountId     String?
  subAccountId  String?
  purpose       String   @default("personal")
  notes         String?
  createdAt     DateTime @default(now())

  vehicle       Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([vehicleId])
  @@map("vehicle_incomes")
}
```

### Archivos de Quid a tocar

| Archivo | Cambio |
|---|---|
| `src/lib/fuel-efficiency.ts` (nuevo) | Cálculo de ciclos tanque-a-tanque y promedios |
| [`src/lib/fuel-level.ts`](../src/lib/fuel-level.ts) | Reutilizar `avgKmPerDay` para proyectar recordatorios; no duplicar lógica |
| [`src/lib/transport-finance.ts`](../src/lib/transport-finance.ts) | `createIncomeEntry()`; hacer `reverseFinanceEntry` consciente del tipo |
| [`src/lib/transport-maintenance-rules.ts`](../src/lib/transport-maintenance-rules.ts) | Proyección de fecha estimada desde `intervalKm` y `avgKmPerDay` |
| [`src/lib/constants/transport-catalog.ts`](../src/lib/constants/transport-catalog.ts) | Semilla de catálogos: 18 servicios, 8 gastos, 5 ingresos, motivo work/personal |
| [`src/components/transport/transport-page.tsx`](../src/components/transport/transport-page.tsx) | Tarjetas de costo/día, costo/hora, eficiencia por ciclo, balance |
| `prisma/schema.prisma` | `FuelLog.purpose`, `VehicleIncome` |

### Cuidado con datos en producción

La app tiene usuarios en producción (Oracle). **Nada de esto requiere borrar o migrar datos
existentes**: todos los cambios son campos opcionales nuevos y tablas nuevas. Cualquier migración
debe ser aditiva y reversible, según lo ya establecido en el proyecto.

---

## 11. Adaptación a Colombia (diferencias no trasladables)

| Aspecto | Drivvo (Brasil) | Quid (Colombia) |
|---|---|---|
| Unidad de volumen | Litro | **Galón** (Quid ya trabaja en galones) |
| Combustibles | Gasolina, etanol, GNV, GLP, diésel, eléctrico | Corriente, extra/premium, diésel, **GNV** |
| Cálculo flex | **Regla de umbral ajustable**: etanol si `precio_etanol / precio_gasolina × 100 < umbral`, con umbral por defecto **70%** | Comparar **costo por km** entre corriente/extra/GNV |
| Documentos obligatorios | Licenciamiento, impuestos, seguro | **SOAT** y **Tecnomecánica** (Quid ya los modela con vencimiento) |
| Gasto vial | Peaje, estacionamiento, multas | Peajes (muy relevantes), comparendos, **pico y placa** |
| Moneda | BRL, formato pt-BR | COP, formato es-CO |
| Ingresos típicos | App de transporte, flete, carpool | Uber/DiDi/Rappi, flete, acarreo, venta |

**Cómo funciona la calculadora flex (verificado).** Es una regla de umbral clásica y **ajustable por
el usuario**:

```
ratio = (precio_etanol / precio_gasolina) × 100
si (umbral > ratio)  → recomienda ETANOL
si no                → recomienda GASOLINA
```

El umbral viene con **70% por defecto** y el usuario lo mueve con un deslizador. Si cualquiera de los
dos precios no es mayor que cero, la calculadora **oculta ambas recomendaciones** en lugar de
arriesgar un consejo. El estado no se persiste: vive solo en el `Bundle` de la pantalla.

**Recomendación para Quid:** la regla del 70% es un atajo válido cuando se comparan **dos**
combustibles con el mismo motor (nafta vs etanol en un flex brasileño). Para Colombia el escenario es
distinto — corriente, extra y GNV, con eficiencias muy dispares por combustible — así que el criterio
correcto y general es comparar **costo por kilómetro** usando la eficiencia histórica real de cada
combustible en ese vehículo:

```
costoPorKm(combustible) = precioUnidad / eficienciaUnidad
```

Se elige el menor y se muestra el ahorro estimado. Es más general que el umbral y se apoya en datos
reales del vehículo en lugar de una constante de mercado.

---

## 12. Qué NO se replica

- **Código fuente**: este documento describe diseño y fórmulas. No se copió código de Drivvo. La
  implementación en Quid es TypeScript/Next.js, no Java/Android, así que copiar sería a la vez
  inviable y legalmente problemático.
- **Precios de estación colaborativos** (crowdsourcing con servidor): requiere backend y comunidad
  de usuarios que Quid no tiene. Quid ya tiene `FuelPrice` y un widget: alcanza para precios
  propios y promedios locales.
- **Integración con `web.drivvo.com`** y su modelo de sincronización (65 clases en `ws/`): es
  infraestructura propia de Drivvo, no un patrón a reutilizar.
- **Formularios dinámicos** (`FormularioDTO` + 5 tipos de campo): funcionalidad avanzada, sin
  relación con el objetivo de finanzas.

---

## 13. Resumen ejecutivo

1. **Es un caso de estudio viable a pesar de la ofuscación parcial**: el paquete
   `br.com.ctncardoso.ctncar` está legible a nivel de clases (62 pantallas) y su **contrato de
   servidor** (`ws/model/models/`) expone 46 entidades con nombres y claves JSON explícitas. La capa
   local `db/` tiene los campos ofuscados, pero es decodificable porque cada DTO declara su array de
   columnas y su mapeo campo↔columna.
2. **Su aporte central no es el registro de datos, es el cálculo**: ciclo de eficiencia
   tanque-a-tanque, costo por km/día/hora, costo total, promedios por combustible y por estación, y
   proyección del próximo mantenimiento.
3. **Quid ya cubre más de lo esperado**: costo por km, autonomía, días hasta el tanqueo, detección
   de anomalías de consumo, recordatorios híbridos y un puente financiero con cuentas, bolsillos,
   tarjeta y cuotas que **Drivvo no tiene**.
4. **La brecha conceptual es una sola: los ingresos.** Drivvo modela gastos e ingresos del vehículo
   y cierra un balance; Quid solo registra gastos. Para un conductor de app o un fletero colombiano,
   ese balance es la razón de ser del módulo.
5. **Orden de trabajo recomendado:** eficiencia por ciclo + motivo trabajo/personal + proyección de
   recordatorios (barato, alto valor) → ingresos y balance por vehículo (cierra el puente con
   Finanzas) → comparador de combustibles y viajes → flota.
