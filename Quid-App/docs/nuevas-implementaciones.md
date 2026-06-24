# Propuesta: Panel de Administración Nativo en Quid-App

## Visión General
Implementar un "Modo Administrador" integrado directamente en la aplicación, exclusivo y seguro, atado al correo del propietario (`rqcquintero@gmail.com`). El objetivo principal es tener un lugar desde donde hacer limpieza y mantenimiento de la base de datos (PostgreSQL) sin necesidad de acceder a herramientas de desarrollo como Prisma Studio o conectarse directamente por SQL.

## Características Propuestas

### 1. Interfaz de Usuario Condicional (Seguridad Visual)
El botón o acceso al "Modo Administrador" solo se renderizará en el menú de "Ajustes" si el usuario activo tiene una sesión donde el `email` coincide exactamente con el del administrador. Para el resto de los usuarios (nuevos o existentes), esta opción simplemente no existirá en su pantalla.

### 2. Dashboard de Gestión de Usuarios
Una interfaz que liste a los usuarios registrados en la base de datos y permita visualizar:
* Fecha de registro.
* Estado y cantidad de datos (cuántas cuentas tienen, transacciones, etc.).

### 3. Borrado Seguro y en Cascada
Un botón de eliminación directa de un usuario. Al presionarlo, el sistema no solo borrará al usuario de la tabla `User`, sino que, al aprovechar las relaciones de cascada configuradas en el esquema de Prisma (PostgreSQL), limpiará automáticamente todas sus dependencias asociadas (cuentas, presupuestos, transacciones, etc.), garantizando que no queden "registros huérfanos".

### 4. Búsqueda y Limpieza de Huérfanos
Una herramienta que analice registros que pudieran haber quedado desligados de un usuario válido (por fallos o testing antiguo) y ofrezca la posibilidad de eliminarlos con un solo clic.

## Arquitectura de Seguridad (Doble Capa)

* **Protección Frontend (Ocultamiento):** Ocultar los botones/enlaces en la interfaz.
* **Protección Backend (API y Rutas):** 
  * Las rutas (ej. `/admin`) validarán la sesión mediante `getServerSession`. Si el correo no es de admin, la página retornará un error 404 (Not Found), escondiendo el hecho de que la ruta siquiera existe.
  * Cualquier endpoint de la API (`/api/admin/...`) rechazará inmediatamente cualquier petición con un error de autorización (401 o 403) si el solicitante no es el administrador.

## Beneficios
* Control total del mantenimiento de la base de datos de producción desde la propia app.
* No requiere abrir puertos extra en el servidor Oracle.
* Interfaz amigable para tareas que, de otro modo, requerirían ejecutar scripts SQL manualmente.

---

# Propuesta: Sistema Inteligente de Sugerencia de Fondo de Emergencia

## Visión General
Dentro del módulo de finanzas, en el apartado de **Metas (Savings Goals)**, integrar un sistema analítico (o apoyado por Aura) que detecte de manera proactiva momentos ideales para sugerir al usuario la creación o aportación a un "Fondo de Emergencia".

## Parámetros Analizados para la Sugerencia
El sistema (o Aura) evaluará el panorama financiero actual del usuario utilizando las siguientes variables antes de hacer la sugerencia:

1. **Liquidez Disponible:** Hay dinero líquido en las cuentas principales.
2. **Cobertura de Pagos:** Los pagos recurrentes y cuotas de deudas (Installments) del mes actual ya están cubiertos o el saldo restante es superior al dinero necesario para cubrirlos.
3. **Inactividad de Gastos:** Se detectan varios días recientes sin salidas de dinero (no se ha gastado, lo que indica estabilidad o control temporal).
4. **Ingresos Próximos (Quincena/Nómina):** Por el historial de transacciones o ingresos recurrentes detectados, el sistema prevé que el usuario está próximo a recibir una inyección de dinero (ej. en los próximos 3-5 días).

Cuando esta matriz de condiciones se cumpla, el sistema mostrará un prompt proactivo:
> *"Oye, tienes dinero disponible y estás próximo a recibir tus ingresos. ¿Qué te parece si creamos/aportamos a un fondo de emergencia?"*

## Estructura del Fondo de Emergencia
Si el usuario acepta la propuesta, el sistema auto-configurará la estructura ideal del fondo:

* **Monto Meta (Target Amount):** Calculado automáticamente multiplicando el promedio de gastos mensuales esenciales (o la sumatoria de pagos recurrentes) por **3 a 6 meses**.
* **Plazo de Tiempo (Time Horizon):** Tiempo sugerido para alcanzar la meta (ej. 1 año).
* **Aporte Mensual Sugerido:** La cuota mensual necesaria para llegar a la meta en el tiempo estipulado, adaptada a la liquidez promedio del usuario.

---

# Propuesta: Sistema de Recordatorios Personalizados para Vehículos (Inspiración Drivvo)

## Visión General
Mejorar el módulo de Transportes/Vehículos añadiendo una sección completa y personalizable para la gestión del mantenimiento preventivo. El objetivo es ofrecer una experiencia similar a aplicaciones especializadas como *Drivvo*, pero sin publicidad y totalmente integrada en el ecosistema Quid.

## Características Propuestas

### 1. Gestión Integral de Recordatorios (CRUD)
* **Añadir, Editar y Eliminar:** Interfaz completa para gestionar alertas de mantenimiento para cualquier componente (cambio de aceite, revisión de bujías, cambio de filtros, empaques, llantas, etc.).

### 2. Triggers (Desencadenadores) Personalizables
A diferencia del sistema actual que usa asignaciones de kilometraje fijas, el nuevo sistema permitirá total libertad para que el usuario defina *cómo* y *cuándo* ser notificado:
* **Por Tiempo:** "Avisarme cada X meses/días".
* **Por Kilometraje:** "Avisarme cada X kilómetros recorridos".
* **Híbrido (Lo que ocurra primero):** "Avisarme a los 10,000 km o en 6 meses".

### 3. Interfaz de Usuario (UI) Modular y por Pestañas
Para evitar sobrecargar la pantalla con demasiada información (evitando scroll infinito), el módulo completo de Transporte/Vehículos se reestructurará utilizando el mismo sistema de pestañas (tabs) que ya usamos en el módulo de Finanzas. La navegación quedará dividida en apartados limpios:

* **Resumen:** Una pantalla inicial con *widgets* e indicadores clave (gasto total del mes, próximo mantenimiento más urgente, consumo promedio, etc.).
* **Combustible:** Historial y métricas exclusivas de recargas y rendimiento de combustible.
* **Mantenimiento:** Historial de facturas, gastos de taller y reparaciones ya realizadas.
* **Recordatorios:** La nueva pantalla dedicada exclusivamente a gestionar las alertas futuras. Aquí cada recordatorio tendrá su propia tarjeta visual (card) que mostrará, mediante barras de progreso y colores (verde, amarillo, rojo), qué tan cerca está de requerir servicio.

---

# Propuesta: Reestructuración del Formulario de Mantenimiento (Vehículos)

## Visión General
Actualmente, el registro de un nuevo mantenimiento está limitado. Si se requiere añadir un ítem que no está en la lista estándar, el formulario solo permite añadir el nombre, pero no el precio individual. Además, se dificulta agregar múltiples ítems nuevos en la misma transacción. La propuesta es rediseñar este formulario para que funcione de manera dinámica, similar a un "carrito de compras".

## Características Propuestas

### 1. Formulario Dinámico (Estilo Carrito de Compras)
* El usuario podrá añadir múltiples ítems en un solo registro de mantenimiento. Por ejemplo, en una sola visita al taller podrá registrar: Cambio de aceite, Compra de 3 repuestos diferentes, y Mano de obra, todo en la misma factura.

### 2. Asignación de Precios Individuales
* Cada vez que se seleccione o se añada un nuevo ítem personalizado, el sistema permitirá y exigirá colocar el precio exacto de ese ítem. El costo total del mantenimiento se calculará automáticamente como la sumatoria de todos los ítems en el "carrito".

### 3. Guardado en el Listado Maestro
* Cualquier ítem nuevo creado por el usuario (ej. "Empaque de culata") no solo servirá para ese registro, sino que quedará guardado permanentemente en su listado estándar de ítems. De este modo, en futuros mantenimientos podrá seleccionarlo directamente de la lista.

---

# Propuesta: Gestor de Medicamentos en el Módulo de Salud

## Visión General
Se requiere empezar a modelar el módulo de Salud incorporando un completo "Gestor de Medicamentos". El objetivo es llevar un control riguroso tanto de las tomas como de las existencias (inventario) de cada medicina, asegurando la adherencia a los tratamientos médicos y brindando inteligencia asistida sobre cada fármaco.

## Características Propuestas

### 1. Registro Asistido con Autocompletado (Internet/API)
* Al añadir el nombre del medicamento o de la enfermedad, la aplicación consumirá una API médica de internet para ofrecer **autocompletado predictivo**. Por ejemplo, al escribir "acet", el sistema sugerirá en tiempo real "Acetaminofén" y otras variantes válidas, estandarizando los nombres de medicinas y diagnósticos.

### 2. Resumen Clínico Inteligente (Validado por Aura)
* Una vez el usuario finalice el registro (indicando cantidad total, dosis y frecuencia), el sistema (a través del LLM/Aura) generará y mostrará una **ficha resumen** que incluirá:
  * Para qué sirve realmente el medicamento.
  * Los principales efectos secundarios esperados.
  * Una validación de si la pastilla introducida es verdaderamente efectiva y congruente con la enfermedad que el usuario seleccionó.

### 3. Control de Inventario (Existencias)
* El sistema llevará la cuenta de la cantidad física disponible (pastillas, dosis, mililitros). Al ir confirmando las tomas, el inventario se reducirá automáticamente, pudiendo avisar oportunamente cuando sea necesario comprar más.

### 4. Recordatorios con Sonido Distintivo (Dosificación)
* Se configurarán alertas precisas indicando la frecuencia y el horario exacto de cada toma.
* Las notificaciones push en el celular tendrán un **sonido característico y personalizado (similar al sonido de agitar un pastillero)**. Esto permitirá que el usuario sepa inmediatamente de qué trata la alarma sin siquiera tener que mirar la pantalla.

### 5. Recomendaciones de Consumo y Pestaña de Asistencia
* El sistema (impulsado por Aura) emitirá recomendaciones médicas personalizadas sobre *cómo* debe consumirse cada pastilla:
  * Si se debe tomar en ayunas o con alimentos.
  * Si es preferible tomarla de día o de noche según sus efectos secundarios (ej. somnolencia).
  * Advertencias de interacciones peligrosas si se cruza con otros medicamentos ya registrados en tu perfil.
* Toda esta inteligencia se consolidará en una **pestaña dedicada de "Recomendaciones"** dentro del módulo de Salud. Así, el usuario sentirá que cuenta con un verdadero asistente clínico velando por su seguridad, evitando tomar medicinas de forma incorrecta por desconocimiento.

---

# Propuesta: Gestor de Citas Médicas Integrado (Módulo de Salud)

## Visión General
Se añadirá una sección para gestionar Citas Médicas dentro del módulo de Salud. Esta sección no solo permitirá llevar la agenda médica, sino que estará profundamente interconectada con el módulo de Finanzas para automatizar el registro de copagos y gastos médicos.

## Características Propuestas

### 1. Gestión de Citas y Alertas Previas
* **Registro Detallado:** Permite registrar qué especialista vas a visitar, qué te van a tratar, fecha y hora.
* **Sistema de Recordatorios Escalonados:**
  * Alertas previas configurables: 1, 2 o 3 días antes de la cita.
  * Alerta el mismo día: Horas antes de la cita para preparar la salida.
* **Reprogramación:** Opción ágil para modificar la fecha u hora si la clínica la aplaza.

### 2. Flujo de Finalización e Interconexión Financiera (Copagos)
* Al marcar una cita como "Completada", el sistema desplegará automáticamente un formulario consultando si se generó algún **copago o gasto médico**, y si se generó una **Orden Médica** (medicamentos o controles).
* Si hubo gasto, pedirá el monto y permitirá seleccionar con qué cuenta financiera se pagó (Efectivo, Tarjeta de Crédito, Cuenta Débito, etc., listando tus cuentas reales de Quid).
* **Viaje de Datos Automático:** Al confirmar, este pago viajará de inmediato al módulo de Finanzas, registrándose como una transacción de gasto.
* **Viaje a Salud:** Si se generó una orden médica, el usuario será guiado a registrar los medicamentos recetados, atándolos inmediatamente a esta cita.

### 3. Reversión y Eliminación Segura
* **Reversión (Undo):** Si marcaste la cita como completada por error, puedes revertirla. Esto buscará automáticamente la transacción en el módulo de Finanzas y la eliminará/revertirá para devolver el saldo.
* **Eliminación Total:** Si borras la cita médica por completo, se eliminá junto con todo su historial asociado (pagos de copago, recordatorios), asegurando que los registros financieros queden intactos y sincronizados.

---

# Propuesta: Gestor de Órdenes Médicas y Entregas Pendientes

## Visión General
A menudo, tras una cita médica, se emite una fórmula u orden para varios meses de tratamiento, pero la farmacia solo entrega medicamentos para un mes (o no tienen inventario de alguno). Este submódulo gestionará esas entregas parciales y reclamaciones futuras, conectando el mundo de las citas con el inventario de medicinas.

## Características Propuestas

### 1. Trazabilidad (Vinculación a la Cita)
* Toda orden médica podrá vincularse directamente a la **Cita Médica** que la originó y a un **Número de Orden** específico. Esto crea un historial limpio donde se sabe exactamente qué médico recetó qué cosa y cuándo.

### 2. Control Lógico de Entregas Parciales (Dosis por Meses)
* El usuario registrará la receta médica completa (ej. 30 pastillas de un medicamento X para un tratamiento de 3 meses). El sistema subdividirá esto matemáticamente en "entregas" o "dosis mensuales" (ej. 3 entregas de 10 pastillas cada una).
* Al ir a la farmacia, la app desplegará un formulario interactivo detallando lo que se debe recibir en esa entrega. El usuario verificará exactamente qué le dieron de esa lista.
* **Separación Visual de Pendientes:** Para no mezclar información, habrá una ventana o pestaña independiente dedicada exclusivamente a los "Pendientes". Al entrar allí, el usuario verá dos mundos claramente divididos:
  1. **Pendientes de la Dosis Actual (Faltantes de inventario):** Lo que te debieron entregar hoy pero la farmacia no tenía (ej. te dieron la Medicina A, pero quedaron debiendo la B).
  2. **Pendientes por Reclamar a Futuro (Próximas entregas):** Las dosis completas de los meses venideros (ej. la entrega 2 y 3 del tratamiento).
* Esta división garantiza un seguimiento matemático estricto y una visualización limpia de lo que la EPS o farmacia te debe a corto y largo plazo.

### 3. Evidencia Fotográfica (Soporte Físico)
* El sistema permitirá adjuntar una **fotografía de la orden médica física o del comprobante de pendientes** emitido por la farmacia. Esto servirá como "testigo" o soporte visual al momento de volver a reclamar, evitando los problemas si se pierde la fórmula en papel.

### 4. Recordatorios de Reclamación Futura
* Para los medicamentos que quedaron pendientes para el mes siguiente, el sistema programará automáticamente un recordatorio (ej. en 25 días) alertando al usuario: *"Es hora de ir a reclamar la siguiente entrega de tu tratamiento de la Orden #12345"*.

---

# Propuesta: Módulo de Despensa (Nevera Virtual)

## Visión General
Crear un módulo dedicado a la gestión de alimentos del hogar. Funcionará como una "Nevera Virtual" donde el usuario podrá llevar un inventario en tiempo real de lo que tiene en su cocina, automatizando la creación de listas de mercado y recibiendo sugerencias de recetas inteligentes adaptadas a su perfil de salud.

## Características Propuestas

### 1. Inventario Base (Stock de Alimentos)
* El usuario podrá registrar su "mercado base" o inventario ideal (ej. 1 lb de tomates, 1 lb de cebolla, 2 lb de carne).
* A medida que se consumen, se puede ir restando del inventario virtual.

### 2. Generación Inteligente de Lista de Mercado
* Cuando el inventario esté bajo, un botón de **"Generar Lista de Mercado"** calculará automáticamente los faltantes basándose en el stock ideal y creará la lista de compras.
* **Control de Precios y Unidades:** La lista permitirá relacionar precios, cantidades y **unidad de medida**. 
* **Conversión de Unidades Automática:** Si el precio histórico de un producto está registrado por Kilogramo, pero el usuario va a comprar en Libras o Gramos, el sistema debe hacer la conversión matemática automática para proyectar el costo exacto.

### 3. Generador de Recetas Inteligente (Impulsado por Aura)
* **Con lo que hay en la Nevera:** Aura propondrá recetas creativas utilizando exclusivamente los ingredientes disponibles en el inventario actual.
* **Recetas con Faltantes:** También podrá proponer una receta ideal y advertir: *"Te faltan estos ingredientes"*, dando la opción inmediata de agregarlos a la Lista de Mercado.

### 4. Perfiles de Salud Múltiples e Invitaciones (Familia/Invitados)
* **Invitaciones entre Usuarios Quid:** Si un familiar o pareja también usa Quid, el usuario podrá enviarle una "invitación de conexión". Si la otra persona acepta, su Perfil de Salud completo (restricciones alimentarias, alergias, enfermedades) se vinculará y reflejará automáticamente en la cuenta del anfitrión. Esto evita el trabajo de registrar a mano las condiciones de salud de otros y funciona de forma bidireccional.
* **Perfiles Locales (Manuales):** Para niños, invitados esporádicos o personas que no usan la app, el usuario podrá seguir creando perfiles manualmente con sus restricciones (ej. celiaquía o alergia a nueces).
* **Dietas Cruzadas (Inteligencia Colectiva):** Al momento de generar una receta, el usuario seleccionará para quiénes cocinará. Aura cruzará automáticamente las restricciones de todos los perfiles elegidos (ej. la diabetes del anfitrión + la intolerancia a la lactosa del invitado vinculado) para proponer un plato 100% seguro para todos los comensales.

### 5. Interconexión Financiera del Mercado
* Al regresar del supermercado, el usuario abrirá su "Lista de Mercado" en la app para confirmar que todos los productos llegaron y verificará que los precios finales sean correctos.
* **Viaje de Datos Automático:** Al confirmar la compra, el sistema preguntará con qué cuenta se pagó (Efectivo, Tarjeta, etc.) y enviará automáticamente este valor total al módulo de Finanzas, registrándolo como un gasto para mantener el presupuesto perfectamente cuadrado.

---

# Estado de Implementación y Faltantes (Actualizado 2026-05-24)

## Resumen Ejecutivo del Estado del Sistema

Tras una auditoría exhaustiva del código fuente (Prisma, controladores de API y componentes de React), podemos confirmar que **Quid-App se encuentra en un estado sumamente maduro, cercano al 85% de cobertura total del roadmap original**. 

Se han implementado transacciones financieras ACID cruzadas y robustas que conectan la despensa, el mantenimiento de vehículos y la salud con el módulo central de Finanzas.

---

## 1. Panel de Administración Interno
**Estado:** `90% - Estabilización`

### ¡Al 100% de lo propuesto!
*   **Acceso y Seguridad Visual/Backend:** Protección estricta contra `ADMIN_EMAILS` (con `rqcquintero@gmail.com` como administrador principal). Doble capa de seguridad que retorna 404 en la UI y 401/403 en endpoints de la API si no coincide el correo.
*   **Estadísticas y Conteo de Usuarios:** Listado de usuarios con desglose de la cantidad de registros por módulo (cuentas, vehículos, recetas, etc.) para monitorear el uso real.
*   **Borrado Seguro en Cascada:** Implementado y validado en `/api/admin/users/[id]`. Aprovecha las relaciones en cascada de Prisma/PostgreSQL para eliminar a un usuario de forma limpia y segura, liberando espacio sin dejar registros huérfanos.
*   **Búsqueda y Limpieza de Huérfanos:** Endpoint `/api/admin/orphans` operativo para barrer registros desligados.

### Lo que hace falta para lograr el objetivo completo:
*   **Pantalla de Resumen de Salud del Sistema:** Un widget administrativo que muestre variables críticas configuradas (`OLLAMA_URL`, `AURA_API_KEY`, `CRON_SECRET`), versión del backend, estado de la base de datos PostgreSQL activa y el timestamp del último cron ejecutado.
*   **Bitácora de Auditoría:** Una tabla o log protegido que registre las acciones críticas tomadas por el administrador (ej. fecha y hora de eliminación de un usuario o limpiezas manuales) para mantener trazabilidad operativa en Oracle.

---

## 2. Transporte 2.0 y Reestructuración de Mantenimiento
**Estado:** `100% - Completado` ¡Excelente trabajo!

### ¡Al 100% de lo propuesto!
*   **UI Dinámica en 4 Pestañas:** Navegación centralizada e impecable organizada en *Resumen*, *Combustible*, *Mantenimiento* y *Recordatorios*.
*   **Recordatorios Inteligentes (Triggers):** Notificación por kilometraje, tiempo o híbrido (lo que ocurra primero), perfectamente configurado en base al historial del vehículo.
*   **Formulario Dinámico "Carrito de Compras":** Permite registrar una factura de taller agregando múltiples ítems estandarizados o personalizados simultáneamente, con asignación de precios individuales y cálculo automático del total.
*   **Catálogo Maestro Persistente:** Los ítems de mantenimiento creados en caliente se persisten en base de datos. La API `/api/vehicles/maintenance/custom-items` los ofrece automáticamente con autocompletado inteligente en futuras visitas al taller.
*   **Integración Financiera Total:** Integrado con el selector de método de pago (`PaymentMethodSelector`). Permite pagar desde una cuenta/subcuenta principal (descontando saldo) o financiado con tarjeta de crédito (generando cuotas amortizables y deudas).

---

## 3. Aura Inteligente Integrada
**Estado:** `75% - En estabilización e interacciones por botones` (La carga dinámica de categorías y subcategorías personalizadas en los botones de Telegram se encuentra en revisión y ajuste de autorizaciones).

### ¡Al 100% de lo propuesto!
*   **Canal Telegram & Conector local:** Enlace por token seguro utilizando `AURA_API_KEY` y `telegramId` del usuario. Integrado con Ollama utilizando el modelo de inferencia `hermes3:8b`.
*   **Lectura Analítica de Datos:** Aura puede leer y reportar saldos, movimientos,planner, metas de ahorro, deudas, CDTs, despensa y recordatorios de vehículos de forma rápida y contextualizada.
*   **Acciones Básicas de Escritura:** Registra transacciones sencillas y recargas de combustible en base a prompts explícitos.

### Lo que hace falta para lograr el objetivo completo:
*   **Gateway de Herramientas Estructurado (`/api/aura/tools`):** Actualmente la lógica es un archivo monolítico en `index.ts`. El directorio `src/lib/aura/tools` está vacío. Es necesario crear ficheros modulares para cada herramienta y un endpoint que exponga sus JSON Schemas para que modelos avanzados realicen *Tool Calling* nativo.
*   **Máquina de Estados de Confirmación en dos pasos:** Implementar un flujo interactivo donde Aura proponga una transacción (ej. al faltar datos como la cuenta o categoría) y no la registre hasta que el usuario pulse un botón físico en Telegram o el chat interno (`[Confirmar]` / `[Cancelar]`).
*   **Expandir Skills de Escritura:** Habilitar a Aura para realizar transferencias entre cuentas propias, registrar abonos a deudas/TC, configurar metas de ahorro y añadir recordatorios de vehículos.
*   **Persistencia de Preferencias de Aura en Base de Datos:** Guardar los valores de los Ajustes de Aura (Modelo LLM, Permisos de Escritura, Skills activos y Tono) en PostgreSQL (por ejemplo, ampliando la tabla `UserSettings` o creando una tabla `AuraSettings` asociada al usuario), evitando que sean solo estados volátiles de la interfaz.
*   **Factibilidad y Selección de Modelos Inteligentes:**
    *   *Opción Local (Ollama):* Evaluar la viabilidad de descargar y ejecutar un modelo sumamente liviano (ej. Gemini Nano local mediante APIs nativas, o modelos de Ollama de 1.5B o 3B como `Llama-3.2:1b` o `Qwen2.5:1.5b` o `Gemma-2:2b`) para garantizar velocidad extrema y compatibilidad de procesamiento local en hardware limitado.
    *   *Opción Cloud:* Permitir la selección del motor oficial de Gemini (vía clave API de Google) de forma que el usuario pueda usar la potencia de `gemini-1.5-flash` o `gemini-1.5-pro` directamente si así lo desea.
*   **Controladores Activos de Escritura Directa:** Si el usuario deshabilita "Escritura Directa" en la UI, Aura debe rechazar amigablemente cualquier intento de registro en Telegram, respondiendo con un mensaje guiado e indicando la ruta exacta dentro del panel web de Ajustes para activarlo.
*   **Filtros Dinámicos de Habilidades (Skills) y Tono:**
    *   *Skills:* Si un skill (ej. Salud) está inactivo, interceptar las peticiones en Quid-App para que Aura decline la solicitud y responda que dicha habilidad se encuentra apagada en la aplicación principal.
    *   *Tono:* Inyectar de manera dinámica el tono configurado por el usuario (Amigable, Profesional, Sarcástico, etc.) directamente en el `systemPrompt` que recibe el LLM.

---

## 4. Fondo de Emergencia Inteligente
**Estado:** `100% - Completado` ¡Excelente trabajo!

### ¡Al 100% de lo propuesto!
*   **Algoritmo Analítico Avanzado (`emergency-suggestion/route.ts`):** Analiza el historial de transacciones de los últimos 90 días, ingresos promedio y gastos.
*   **Exclusión de Transferencias:** Descarta correctamente transacciones marcadas como "Ahorros" o "Transferencias" y respeta la columna `excludeFromBudget` para evitar sesgar el cálculo.
*   **Integración de Reglas de Categoría:** El usuario parametriza qué categorías son verdaderamente "ingreso real" (ej. Nómina) y cuáles representan "gasto fijo/esencial" (ej. Renta, Servicios) mediante la tabla `CategoryRule`.
*   **Cálculo Dinámico de Liquidez:** Evalúa saldos de cuentas disponibles descartando cuentas de ahorro a largo plazo configuradas con `excludeFromAvailable: true`.
*   **Sugerencia e Impacto:** Auto-calcula el monto meta ideal (3 a 6 meses de gastos esenciales), define el plazo, calcula el aporte mensual e integra una advertencia en lenguaje natural si el aporte excede el 10% del salario real del usuario.

---

## 4.1 Presupuesto, Categorías y Exclusiones
**Estado:** `100% - Completado` ¡Excelente trabajo!

### ¡Al 100% de lo propuesto!
*   **Exclusiones Editables:** El CRUD de transacciones permite alternar `excludeFromBudget` en caliente y reajusta dinámicamente la columna `spent` de la tabla `Budget` en tiempo real.
*   **Sincronización Multimódulo:** Toda compra con TC desde Transporte, Salud, Pagos Recurrentes o Despensa alimenta el presupuesto real en su categoría respectiva.
*   **Sincronización por Fecha de Corte:** Las cuotas y deudas se cruzan basándose en su `nextPaymentDate` (corte del mes de pago) y no solo por la fecha física de la transacción, logrando consistencia absoluta.
*   **Bloque "Por Clasificar" (Widget Interactivo):** Widget visual premium integrado en la pestaña de Presupuesto. Agrupa los movimientos del mes/periodo activo que no tienen asignada categoría o subcategoría. Permite al usuario clasificar de forma interactiva con un solo clic utilizando el formulario de transacción nativo.

---

## 5. Salud 2.0 (Medicinas, Citas y Copagos)
**Estado:** `75% - Avanzado Parcial`

### ¡Al 100% de lo propuesto!
*   **Gestión de Fármacos y Stock:** CRUD de medicamentos con stock inteligente, dosis, umbral de alerta e historial de tomas confirmadas.
*   **Interacciones Farmacológicas Inteligentes (`medication-form.tsx`):**
    *   Valida en tiempo real interacciones peligrosas entre medicamentos registrados (ej. Fluoxetina y Tramadol) advirtiendo sobre riesgos clínicos.
    *   Identifica choques de horarios entre medicinas y sugiere alternativas para espaciar las tomas de forma segura.
    *   Genera fichas resumen clínico dinámicas mediante el endpoint `/api/ai/medication-info` impulsado por IA.
*   **Copagos de Citas Médicas Integrados (`appointments/[id]/route.ts`):**
    *   Al marcar una cita médica como "Completada", si hay un copago registrado y un método de pago real seleccionado, **viaja de forma automática** a Finanzas creando la transacción de gasto.
    *   **Reversión en Cascada Segura:** Si la cita se edita para volver a estar incompleta, o se elimina por completo, el sistema ejecuta `reverseHealthFinanceEntry`, eliminando la transacción financiera asociada sin descuadrar saldos.

### Lo que hace falta para lograr el objetivo completo:
*   **Entregas Parciales y Pendientes de Farmacia:** Crear el submódulo para dividir recetas médicas de varios meses en entregas mensuales. Falta la separación visual entre "Pendientes de la Dosis Actual" (lo que la EPS te quedó debiendo hoy) y "Próximas Entregas" (futuros meses del tratamiento).
*   **Evidencia Fotográfica / Adjuntos:** Permitir subir y almacenar una imagen de la orden médica o fórmula física en la base de datos para soporte del usuario.

---

## 6. Despensa e Integración Financiera del Mercado
**Estado:** `90% - Estabilización`

### ¡Al 100% de lo propuesto!
*   **Nevera Virtual & Stock:** Gestión de existencias e inventario de alimentos.
*   **Dietas Cruzadas Bidireccionales:** Permite vincular de forma bidireccional los perfiles de salud de familiares o invitados (usuarios reales de Quid) para que el generador de recetas de Aura evite alimentos restringidos o alérgenos para cualquiera de los comensales elegidos.
*   **Flujo Financiero Avanzado y Completo de Compra (`confirm/route.ts`):** 
    *   Al completar y verificar la lista de mercado, el formulario de confirmación de compra permite pagar mediante **Cuenta/Subcuenta** (descontando saldo y creando la transacción en `Alimentación / Mercado`) o **Tarjeta de Crédito** (generando el registro de cuotas `Installment` amortizables con cálculo dinámico de pago e intereses y aumentando el saldo de la deuda).
    *   Actualiza instantáneamente el presupuesto mensual de Alimentación y aumenta el inventario de despensa con los productos comprados.

### Lo que hace falta para lograr el objetivo completo:
*   **Conversor de Unidades en Cotización Histórica:** Aunque la utilidad `unit-converter.tsx` existe, se requiere integrarla a nivel de base de datos para que si una compra anterior de un ingrediente se cotizó en Kilogramos, el sistema calcule el costo proyectado si se agrega a la lista de compras por Libras de forma automática.

---

## 7. Notificaciones Proactivas y Oracle Cloud
**Estado:** `80% - Estabilización`

### ¡Al 100% de lo propuesto!
*   **Infraestructura de Notificaciones Push:** Suscripciones Web Push funcionales con API de alertas configurada.
*   **Servicio de Recordatorios (`server-reminders`):** Barrido de pagos recurrentes, deudas, combustible y recordatorios clínicos.
*   **Digest de Aura:** Envío automatizado de digest de pendientes.
*   **Runbook para Oracle Cloud:** Configurado con secretos de webhook e integración segura.

### Lo que hace falta para lograr el objetivo completo:
*   **Diagnóstico de Producción:** Confirmar el comportamiento del service worker con la PWA cerrada en Android y registrar el timestamp del último cron exitoso para visualizarlo en el panel administrativo.

---

## Prioridad Recomendada Desde Ahora

1.  **Aura Modular (Tools):** Refactorizar `src/lib/aura/index.ts` dividiendo la lógica en subficheros dentro de `src/lib/aura/tools` y habilitando el gateway formal `/api/aura/tools`.
2.  **QA Responsive y PWA:** Realizar auditoría visual fina en viewports pequeños (360px a 390px) para las vistas complejas de Transporte (Placas de vehículos) y Salud (Alertas farmacológicas).
3.  **Entregas Parciales en Salud:** Desarrollar el control lógico de medicamentos debidos por farmacia en órdenes multi-mes.

---

# Auditoría vigente Codex - 2026-05-24

> Esta sección reemplaza como fuente de verdad los porcentajes anteriores del documento. Un punto solo se considera **100% cumplido** cuando el código existe, está integrado en UI/API, conserva la contabilidad entre módulos, y queda pendiente únicamente de prueba funcional del usuario.

## A. Completado funcional, pendiente de prueba fina del usuario

### A.1 PostgreSQL / Oracle
**Estado:** `100% aplicado - pendiente de monitoreo operativo`

- PostgreSQL ya es la base principal y Oracle ya fue migrado.
- Queda como rutina obligatoria antes de nuevos despliegues: `npm run lint`, `npm test`, `npm run build`, `docker compose build quid-app`, `docker compose up -d quid-app`, revisión de logs y consola del navegador.
- El archivo SQLite anterior debe seguir archivado como respaldo histórico, no eliminado.

### A.2 Panel Admin básico
**Estado:** `85%`

Cumplido:
- Acceso condicionado por administrador.
- Listado de usuarios.
- Conteos por módulo.
- Borrado de usuario probado localmente por el usuario.
- Auditoría básica de huérfanos.

Falta para considerarlo 100%:
- Bitácora de acciones admin: quién borró, qué borró, cuándo y resultado.
- Panel de salud del sistema: estado PostgreSQL, versión/build, `OLLAMA_URL`, `AURA_API_KEY`, `CRON_SECRET`, último cron exitoso y último digest de Aura.
- Doble confirmación más explícita para acciones destructivas en producción.

### A.3 Transporte 2.0
**Estado:** `93%`

Cumplido:
- Tabs principales: resumen, combustible, mantenimiento y recordatorios.
- Placa en vehículo.
- Widget visual de tanque/combustible.
- Registro de combustible con pago por cuenta o tarjeta.
- Mantenimiento tipo carrito con ítems, precios y catálogo reutilizable.
- Recordatorios por fecha, kilometraje o ambos.
- Sincronización de recordatorios cuando se registra mantenimiento con kilometraje actual.
- Parámetros editables de mantenimiento por usuario (`/api/vehicles/maintenance/rules`): cada servicio puede definir intervalo por kilometraje, meses, aviso previo y si genera recordatorio automático. Esto evita valores quemados como aceite cada 5000 km y permite configurar aceite, bujías, llantas, balanceo, etc. desde la UI de Transporte.

Falta para considerarlo 100%:
- Prueba real de notificaciones push con app cerrada en Android.
- QA visual en móviles pequeños para tabs, tarjetas y detalle del vehículo.
- Confirmar que todos los reversos de combustible/mantenimiento restauran saldo, deuda y presupuesto en todos los escenarios.
- Validar con datos reales que al cambiar un intervalo, el siguiente mantenimiento registrado cree el recordatorio con el nuevo kilometraje esperado.

### A.4 Fondo de emergencia inteligente
**Estado:** `95%`

Cumplido:
- Calcula meta usando ingresos reales y gastos fijos mediante reglas de categoría/subcategoría.
- Permite configurar meses, frecuencia, cuenta de aporte y estructura similar a crear meta.
- Crea la meta/recurrente con datos más controlados.

Falta para considerarlo 100%:
- Validar con datos reales que las reglas marcadas como `Ingreso real` y `Gasto fijo` eliminan ingresos inflados por transferencias.
- Mostrar en UI una explicación auditable: ingresos considerados, gastos fijos considerados y exclusiones aplicadas.

### A.5 Presupuesto, exclusiones y tarjetas
**Estado:** `90%`

Cumplido:
- Transacciones pueden excluirse del presupuesto.
- Hay endpoint para transacciones excluidas.
- Hay bloque visual de excluidos en presupuesto.
- Hay bloque de movimientos sin clasificar.
- Compras con tarjeta desde módulos como transporte/despensa impactan la categoría real de la compra, no una categoría genérica de deuda.

Falta para considerarlo 100%:
- Auditar todos los flujos de escritura: finanzas, recurrentes, transporte, salud, despensa, Aura y compras directas con TC.
- Evitar lenguaje demasiado específico como "Chucherías y Antojos" para cualquier transacción excluida; debe ser neutral: "Excluidos del presupuesto".
- Definir si las categorías/subcategorías siguen siendo la base del presupuesto o si se simplifica a categorías con opción de excluir por movimiento.
- Validar que pagos de tarjeta y transferencias internas nunca dupliquen presupuesto.
- Añadir resumen por periodo: gasto total, presupuestado, no presupuestado, excluido y por clasificar.
- Ajustar colores: 100% usado no siempre es malo; rojo debe reservarse para sobrepasar presupuesto.

### A.6 Despensa / mercado conectado a Finanzas
**Estado:** `85%`

Cumplido:
- Inventario base.
- Listas de mercado.
- Confirmación de compra con cuenta/subcuenta o tarjeta.
- Impacto financiero en `Alimentación / Mercado`.
- Actualización de presupuesto e inventario al confirmar.

Falta para considerarlo 100%:
- Reversar/anular una lista ya confirmada restaurando inventario, saldo/deuda y presupuesto.
- Conversión de unidades con historial de precio: kg, libra, gramo, unidad.
- Recetas conectadas de forma más fuerte con stock ideal, faltantes y perfiles de salud.
- QA de confirmación con tarjeta en varias cuotas.

## B. Implementado parcial, prioridad alta

### B.1 Aura como asistente real con herramientas
**Estado:** `50%`

Cumplido:
- Chat interno/API.
- Integración Telegram por `telegramId`.
- Conexión con Ollama/Hermes.
- Digest básico.
- Algunas herramientas ya empezaron a separarse en `src/lib/aura/tools`: `registrar_transaccion.ts` y `registrar_tanqueo.ts`.
- Aura puede leer partes del contexto y hacer algunos registros básicos.
- Telegram ya responde y puede proponer registros con botones de cuenta.
- El endpoint `/api/aura/categories` fue ajustado para priorizar categorías reales del usuario y no imprimir secretos en consola.

Falta para considerarlo 100%:
- Crear gateway formal `/api/aura/tools`.
- Definir JSON Schemas de herramientas.
- Máquina de estados de confirmación: propuesta -> botones/opciones -> confirmar/cancelar -> escritura real.
- Botones en Telegram y chat interno para elegir cuenta, tarjeta, categoría, vehículo, medicamento, fecha y cuotas.
- Corregir en el bot externo el consumo del endpoint de categorías para que el botón `Categorías` pinte las categorías/subcategorías reales devueltas por Quid, no una lista genérica interna.
- Skills de lectura: saldos, gastos por rango, ingresos reales, transferencias, presupuestos, deudas/TC, cuotas, CDTs, metas, recurrentes, planner, transporte, salud, despensa.
- Skills de escritura: gasto, ingreso, transferencia, abono a deuda/TC, compra con TC, recarga combustible, mantenimiento, mercado, cita, copago, medicamento, orden médica, recordatorio.
- Guardrails: Aura no debe consultar cripto/precios externos cuando la intención claramente pertenece a QUID.
- Aura no debe escribir datos incompletos ni inventar cuenta, tarjeta, categoría, vehículo o medicamento.
- Salud en Aura debe ser educativa y segura: explicar para qué sirve un medicamento, efectos secundarios, cómo tomarlo y advertencias, sin reemplazar diagnóstico médico.
- **Persistencia de Ajustes en DB:** Guardar el modelo LLM, permisos de escritura, toggles de skills y tono en `UserSettings` o en una tabla de configuración dedicada.
- **Factibilidad de Modelos Livianos:** Probar la ejecución de modelos locales muy pequeños y eficientes (ej. `Llama-3.2:1b`, `Qwen2.5:1.5b` o `Gemma-2:2b`) para agilizar respuestas locales en Ollama o explorar la vinculación directa con el SDK web de Gemini para procesar en cliente/nube de forma optimizada.
- **Validación de Escritura Directa:** Si "Permisos de escritura directa" está desactivado, Aura en Telegram bloqueará la creación de registros y redirigirá al usuario con la ruta exacta de configuración.
- **Filtros de Skills y Tono:** Deshabilitar los skills no marcados en Ajustes y modificar el comportamiento conversacional agregando el tono elegido en el prompt principal.

### B.2 Salud 2.0
**Estado:** `75%`

Cumplido:
- Medicamentos con inventario, dosis y horarios.
- Vista de inventario.
- Recomendaciones con apoyo de IA.
- Citas médicas.
- Copagos conectados a Finanzas.
- Órdenes médicas básicas con ítems, cantidad ordenada, entregada y pendiente.
- Al completar una cita, la UI ahora debe pedir si hubo copago/gasto, permitir editar valor y escoger cuenta o tarjeta para enviar el movimiento a Finanzas.

Falta para considerarlo 100%:
- **Flujo Completo de Autorizaciones Médicas (EPS) con Control de Vencimiento y Renovación:**
  - **Máquina de Estados de Citas Derivadas:** Las citas derivadas de una orden médica transicionan de manera controlada por: `Pendiente de Autorización` (en trámite ante la EPS) ➡️ `Autorizada / Pendiente de Agendamiento` (código de autorización listo, esperando llamada) ➡️ `Programada` (con fecha y hora asignadas).
  - **Vigencia Parametrizable:** El sistema solicitará de manera obligatoria la `fecha de autorización` y los `días de vigencia` (ej. 30, 60, 90 días o personalizado), calculando de forma automática en base de datos la `fechaVencimientoCalculada`.
  - **Historial de Renovación y Prórrogas:** Si una autorización expira antes de poder concretar el agendamiento, el usuario podrá acceder a la autorización vencida y renovarla/ampliarla. El sistema guardará un registro histórico de todas las fechas y estados de autorización previos para conservar una bitácora de auditoría clínica prístina.
  - **Validaciones al Agendar:** Al asignar fecha a la cita, el backend y frontend validarán que la fecha de la cita se encuentre dentro de la vigencia, emitiendo tres niveles de control:
    * *Cita posterior al vencimiento:* Advertencia de rechazo inminente por la clínica.
    * *Autorización expirada:* Advertencia de que el documento no es válido y debe ser renovado.
    * *Coincidencia crítica:* Alerta si la cita coincide en el último día de vigencia de la autorización.
  - **Integración de Notificaciones:** El servicio de cron y Aura en Telegram generarán recordatorios proactivos automáticos cuando haya órdenes autorizadas pendientes de agendar que estén próximas a vencer.
- **Bolsa de Medicamentos Pendientes por Reclamar (Abastecimiento y Farmacia):**
  - **Registro Enlazado a la Cita de Origen:** Al completar una cita médica, el usuario puede ingresar la receta completa (medicamento, dosis y cantidad total formulada, ej: Ibuprofeno 90 pastillas por 3 meses). Este bloque de medicamentos queda enlazado históricamente con la cita de origen.
  - **Auto-registro del Catálogo:** Si la receta médica incluye un principio activo o medicamento nuevo que no existe en el catálogo, el sistema lo creará automáticamente en la base de datos sin obligar al usuario a crearlo de manera manual individual.
  - **Bolsa Virtual de Suministros Pendientes:** La orden crea una "bolsa virtual" de medicamentos pendientes de reclamar en la farmacia. Al retirar fármacos (ej. dosis mensual de 30 pastillas), el usuario marca el reclamo y el sistema:
    1. **Resta** esa cantidad de la bolsa de pendientes (quedando 60 restantes).
    2. **Suma** de manera atómica esa cantidad al inventario físico real para el consumo regular en el hogar.
  - **Entregas Parciales y Soporte Documental (Foto de Recibo Pendiente):** Si la farmacia no entrega la orden completa o quedan medicamentos a medias:
    1. Se calcula el restante exacto y se almacena en una bolsa de pendientes específica vinculada a esa dosis.
    2. Se habilita la opción de tomar una fotografía o adjuntar un archivo digital del recibo físico de "Pendiente" emitido por la farmacia, sirviendo como soporte legal del saldo de medicamentos adeudado.
- **Validar reversos financieros de copago en edición/eliminación.**
- **Ampliar Aura Salud con base de conocimiento controlada y mensajes de seguridad.**
- **Ampliar catálogo/autocompletado de medicamentos con una fuente más completa y controlada. No basta con agregar una lista manual corta: se necesita estrategia de dataset/API/cache local para nombres comerciales, principios activos y variantes difíciles de escribir.**
- **Gestor de documentos clínicos y soportes locales/nube:**
  - Permitir adjuntar o tomar foto/PDF desde el celular para: historias clínicas, órdenes médicas, órdenes de medicamentos, autorizaciones EPS, incapacidades y recibos de pendientes de medicamentos.
  - Guardar cada archivo enlazado al registro que lo originó: cita, autorización, orden médica, pendiente de farmacia o medicamento.
  - Crear una trazabilidad clínica bidireccional entre cita, historia clínica, incapacidad, orden médica, orden de medicamentos, autorización EPS y entregas/pendientes de farmacia. Desde cualquier registro se debe poder ver qué cita lo originó y qué otros documentos o trámites quedaron relacionados.
  - Añadir registros específicos para **Historias clínicas**, **Incapacidades** y **Laboratorios/Resultados clínicos**, o un gestor común `DocumentoClinico` con tipo controlado (`historia_clinica`, `incapacidad`, `orden_medica`, `orden_medicamentos`, `autorizacion_eps`, `resultado_examen`, `laboratorio`, `recibo_pendiente`). La decisión técnica debe favorecer trazabilidad, historial y posibilidad de compartir el archivo original.
  - En la vista de citas completadas, mostrar un histórico expandible: al tocar una cita debe verse todo lo generado por esa atención médica: historia clínica, incapacidades, órdenes de medicamentos, órdenes para especialista/procedimiento, autorizaciones derivadas, citas agendadas desde esas autorizaciones y pendientes de farmacia.
  - En cada apartado de salud, mostrar la trazabilidad inversa. Ejemplo: al abrir una autorización, indicar la cita y orden médica que la originaron; al abrir una historia clínica, indicar la cita asociada y los demás documentos derivados; al abrir una orden médica, indicar si tiene autorización, incapacidad, historia clínica o entrega pendiente relacionada.
  - Añadir una sección de **Laboratorios** para registrar exámenes solicitados, fecha de toma, laboratorio/entidad, estado (`pendiente`, `tomado`, `resultado_recibido`, `revisado_con_medico`) y soporte PDF/imagen. Si el laboratorio nace de una cita, debe quedar ligado a esa cita; si se carga después, debe permitir relacionarlo manualmente.
  - Cuando un laboratorio quede como `resultado_recibido`, permitir que Aura lea el PDF o imagen y genere un resumen educativo: valores fuera de rango, señales que conviene preguntar al médico, posibles hábitos a revisar y preguntas sugeridas para la próxima consulta. Debe mostrar siempre el aviso de que no reemplaza diagnóstico médico ni modifica tratamientos.
  - La interpretación de laboratorios también debe poder llegar por Telegram: el usuario puede enviar el PDF/foto a Aura, Aura lo analiza con el mismo criterio seguro y propone guardarlo en Quid como soporte de laboratorio relacionado con una cita u orden.
  - Permitir crear primero el registro sin adjunto y adjuntar o reemplazar el soporte después, tanto desde la cita origen como desde el registro específico.
  - Permitir abrir/ver el documento y, en fase APK/nativa, compartir el archivo original por WhatsApp, correo, Drive u otra app compatible. La vista interna puede usar previsualización liviana, pero la acción de compartir debe usar el archivo original cargado por el usuario.
  - En primera fase, guardar usando almacenamiento local/app o selector nativo de archivos del teléfono, aprovechando que el usuario puede escoger una carpeta sincronizada por Drive/OneDrive si la tiene instalada en el dispositivo.
  - Sugerir en la UI, de forma ligera y no invasiva: "Puedes escoger una carpeta sincronizada de Drive o OneDrive si quieres tener respaldo en la nube".
  - Crear una estructura sugerida de carpetas: `Salud/Ordenes medicas`, `Salud/Ordenes de medicamentos`, `Salud/Autorizaciones`, `Salud/Historias clinicas`, `Salud/Incapacidades` y `Salud/Pendientes medicamentos/Recibos`.
  - En fase posterior, añadir integración directa con Google Drive/OneDrive para sincronización explícita, selección de cuenta, permisos OAuth y respaldo automático.
  - Criterio de éxito: desde una cita, autorización u orden se puede ver el documento adjunto, reemplazarlo, eliminarlo y conservar trazabilidad sin romper Finanzas ni inventario.

### B.3 Notificaciones proactivas / PWA / Oracle
**Estado:** `70%`

Cumplido:
- Web Push y suscripción existen.
- Endpoint de recordatorios de servidor existe.
- Digest de Aura existe.
- Hay infraestructura para cron mediante secreto.

Falta para considerarlo 100%:
- Prueba real en Android con app cerrada.
- Registrar último cron exitoso.
- Mostrar estado de cron/push en panel admin.
- Confirmar que Oracle ejecuta cron de pagos, transporte, salud, despensa y digest Aura.
- Definir expectativas PWA vs APK: PWA sirve para push estándar; sonidos personalizados fuertes, widgets Android o integraciones nativas profundas quedan para fase APK/nativa.

### B.4 Responsive/PWA multi-dispositivo
**Estado:** `65%`

Cumplido:
- Varias pantallas ya usan `h-dvh`, `overflow-y-auto`, `pb-safe` y scroll interno.
- Sidebar ya tiene header fijo, contenido scrolleable y logout fijo.

Falta para considerarlo 100%:
- Auditoría visual con capturas Playwright en 360x800, 390x844, 768x1024 y desktop.
- Revisar formularios largos, dialogs, sheets, tabs y bottom nav.
- Validar que nada queda recortado al final de la pantalla.
- Reducir escalas visuales donde números/cards se ven sobredimensionados en móviles tipo Redmi.
- Permitir zoom del usuario si todavía existe configuración que lo bloquee.

## C. Nuevo requerimiento: Ajustes clasificados por módulo

**Estado:** `0% - pendiente de implementación`

Problema actual:
- La pantalla `Ajustes` está centralizada en `src/components/settings/settings-page.tsx` y mezcla ajustes generales, Aura, admin, seguridad, finanzas, cuentas, categorías, cargue de datos, respaldo, logros y gestión destructiva.
- El sidebar solo tiene una entrada global llamada `Ajustes`.
- Esto ya no escala porque QUID tiene módulos grandes con configuraciones propias.

Objetivo:
- Reorganizar el menú de ajustes para que cada módulo tenga su propia sección de configuración.

Propuesta de estructura:
- **Ajustes generales:** tema, color de acento, seguridad, push, respaldo, cuenta, invitación, actualización/PWA.
- **Ajustes de Finanzas:** día de corte, festivos, categorías/subcategorías, reglas de ingreso real/gasto fijo, exclusiones, presupuesto, importación financiera, cuentas, deudas, CDTs, metas.
- **Ajustes de Transporte:** precio combustible, recordatorios de mantenimiento, documentos, parámetros de tanque/rendimiento, catálogos de servicios.
- **Ajustes de Salud:** horarios de medicamentos, inventario, recomendaciones, órdenes, recordatorios, privacidad clínica.
- **Ajustes de Despensa:** stock ideal, unidades, conversión, perfiles alimentarios, recetas, lista de mercado.
- **Ajustes de Aura:** Telegram, modelo, herramientas habilitadas, permisos de escritura, digest diario, tono/frecuencia de mensajes.
- **Ajustes Admin:** usuarios, huérfanos, salud del sistema, bitácora.

Criterio de éxito:
- Desde el sidebar se puede entrar a `Ajustes` y ver navegación por categorías/módulos.
- Al abrir Finanzas dentro de Ajustes solo se muestran opciones financieras.
- Las acciones destructivas quedan separadas de las configuraciones normales.
- En móvil, el panel de ajustes no se vuelve una lista infinita difícil de recorrer.

## D. Próximo orden recomendado de implementación

1. **Cerrar presupuesto y exclusiones:** neutralizar lenguaje, terminar resumen por periodo y auditar todos los flujos con TC/recurrentes/salud/despensa/Aura.
2. **Reorganizar Ajustes por módulo:** separar UI y componentes antes de que crezca más.
3. **Aura tools v1:** gateway, schemas, confirmación con botones y skills financieras principales.
4. **Notificaciones reales:** cron observable en admin y prueba Android con app cerrada.
5. **Salud entregas parciales:** pendientes actuales/futuros, adjuntos y recordatorios.
6. **Responsive QA:** capturas automatizadas y correcciones por viewport.
7. **Despensa avanzada:** reversos, conversión de unidades y recetas con faltantes.

## E. Snapshot de auditoría vigente - 2026-06-06

Esta sección deja evidenciado el estado real revisado en código para no depender del historial del chat.

### E.1 Salud

Ya existe base real:
- Medicamentos con inventario, dosis, horarios y recordatorios.
- Citas médicas.
- Copagos conectados a Finanzas.
- Órdenes médicas con ítems, cantidad formulada, entregada y pendiente.
- Autorizaciones EPS.
- Pestaña de pendientes de farmacia.
- Campo básico `receiptUrl`/`receiptThumbnail` para soporte o recibo.

Falta complementar:
- Gestor real de documentos clínicos con archivo/foto/PDF, vista previa, reemplazo, eliminación, enlace al registro origen y trazabilidad bidireccional.
- Estructura de carpetas sugeridas: historias clínicas, órdenes médicas, órdenes de medicamentos, autorizaciones, incapacidades y recibos de pendientes.
- Histórico clínico expandible por cita completada y trazabilidad inversa desde órdenes, autorizaciones, historias clínicas e incapacidades.
- Registro específico o documento clínico tipado para historias clínicas, incapacidades y laboratorios/resultados clínicos, con opción de crear sin adjunto y adjuntar soporte después.
- Al completar una cita médica, permitir registrar **varias salidas clínicas a la vez**, no solo una orden. Debe comportarse como checklist/listado dinámico con tipos como: orden de medicamentos, incapacidad, historia clínica, laboratorio/examen, rayos X/imagenología, procedimiento, control, remisión a especialista, terapia u otro. Cada opción debe permitir detalle, notas, fecha estimada, soporte opcional y vínculo con la cita origen.
- El flujo de completado debe preguntar de forma guiada: "¿El médico te envió medicamentos?", "¿generó control o especialista?", "¿ordenó laboratorio/procedimiento?", "¿hubo incapacidad o historia clínica?". El usuario debe poder crear varios registros derivados en una sola confirmación.
- Sección de laboratorios con estado, soporte PDF/imagen, vínculo a cita/orden y lectura segura por Aura.
- Interpretación asistida de laboratorios por Aura: resumen educativo, valores fuera de rango, preguntas para el médico y recomendaciones generales no diagnósticas. Este flujo puede operar desde la app o desde Telegram, guardando el soporte en Quid si el usuario confirma.
- Compartir el archivo original desde la app, especialmente en APK Android con integración nativa.
- Selector de carpeta raíz para soportes de salud en primera configuración. Quid debe crear subcarpetas por tipo y nombrar archivos con estrategia anti-duplicados: tipo legible + fecha + identificador corto, conservando el nombre original como metadato cuando aplique. Ejemplo: `historia-clinica-2026-06-24-a1b2.pdf`.
- Adjuntos PDF o imagen con tamaño realista para cámara móvil/escáner. La app puede generar previsualización liviana, pero debe conservar y compartir el archivo original cargado.
- Flujo más completo de entregas parciales de farmacia.
- Recordatorios insistentes para citas, medicamentos, autorizaciones próximas a vencer y pendientes por reclamar.

### E.2 Notificaciones

Ya existe base real:
- Modelo `PushSubscription`.
- APIs de suscripción push.
- Endpoint `/api/push/reminders`.
- Servicio `server-reminders`.
- Notificaciones internas y push.
- Digest de Aura.

Falta complementar:
- Validación real en Android con app cerrada.
- Registro de último cron exitoso.
- Panel admin con estado de cron/push/digest.
- Integrar hidratación a recordatorios.
- Sonidos personalizados nativos en APK para medicamentos y otros recordatorios.

### E.3 Aura

Ya existe base real:
- Chat interno.
- Vinculación Telegram por `telegramId`.
- Digest.
- Lectura parcial de contexto de Quid.
- Herramientas iniciadas en `src/lib/aura/tools`, incluyendo registro de transacciones y tanqueo.

Falta complementar:
- Integración de Odysseus como asistente operativo de Aura: Aura conserva la cara, personalidad y control del sistema, mientras Odysseus actúa por debajo como motor auxiliar para razonar, planear y preparar acciones complejas. Repo de referencia: `https://github.com/pewdiepie-archdaemon/odysseus`.
- Ejecutar Odysseus como servicio aislado y seguro, sin acceso directo a la base de datos de Quid. Quid debe exponer herramientas controladas y Aura debe pedir confirmación antes de cualquier escritura.
- Usar Odysseus como apoyo de razonamiento para tareas pesadas de Aura, especialmente lectura de documentos clínicos, laboratorios, trazabilidad de salud, planificación de recordatorios y preparación de acciones complejas. Aura sigue siendo la voz visible y la dueña de la confirmación final.
- Gateway formal de herramientas.
- JSON Schemas para cada tool.
- Máquina de estados de confirmación con botones.
- Herramientas de lectura/escritura para finanzas, transporte, salud, despensa, hidratación y recordatorios.
- Recordatorios o avisos por Telegram cuando corresponda.
- Aura debe usar Odysseus en Oracle como motor auxiliar cuando esté configurado, aunque Aura local/Oracle siga siendo la cara visible. Si Aura local se apaga, el contenedor de Aura en Oracle debe poder asumir el puente con Telegram.
- Odysseus no debe escribir directamente en la base. Para acciones de Quid, Aura debe consultar datos reales mediante herramientas controladas, construir una propuesta concreta y pedir confirmación antes de guardar: tipo de movimiento, valor, cuenta/tarjeta, categoría, módulo origen y cualquier efecto financiero.
- Para consultas generales como clima, explicación o investigación, Aura puede delegar a Odysseus/herramientas externas, diferenciando datos reales de Quid frente a inferencias o información externa.

### E.4 Despensa

Ya existe base real:
- Inventario.
- Listas de mercado.
- Confirmación de compras.
- Integración con Finanzas.
- Perfiles de salud.
- Recetas.
- Conversor de unidades en UI.

Falta complementar:
- Conversión real con historial de precios.
- Reversar compras confirmadas restaurando inventario, saldo/deuda y presupuesto.
- Recetas más inteligentes con stock, faltantes y restricciones.
- Comparativos de precios por producto y periodo.

### E.5 Transporte

Ya existe base real:
- Vehículos, imagen/foto, documentos, combustible, mantenimiento y recordatorios.
- Pago predeterminado por vehículo.
- Aura Quick Log para tanqueos.
- Recordatorios por fecha, kilometraje o híbridos.
- Historial y tabs por resumen, combustible, mantenimiento y recordatorios.

Falta complementar:
- QA visual en móviles pequeños.
- Validación de notificaciones con app cerrada.
- Historial compacto y más consultable.
- Pulir la vista de detalle del vehículo: imagen más visible, recorte/encuadre completo en ambos ejes cuando la relación de aspecto lo permita y edición directa sin tener que salir del detalle.
- Rediseñar la tarjeta de resumen de transporte con indicadores más inmersivos y menos planos.
- Rediseñar recordatorios de transporte para que sean más claros, compactos y accionables.
- Evaluar renombrar visualmente el módulo de **Transporte** a **Movilidad**. "Movilidad" cubre mejor motos, carros, bicicletas, patines eléctricos, e-bikes y vehículos eléctricos; el cambio debe hacerse con cuidado porque Finanzas y categorías históricas todavía usan "Transporte".
- Mantener íconos dinámicos por vehículo y estudiar animaciones sutiles por tipo: movimiento leve para moto/bici, pulso eléctrico para EV, vibración suave de tablero/combustible, siempre respetando rendimiento móvil.
- Lectura de recibos/fotos con Aura en una fase posterior.

### E.6 Local-first / Offline

Ya existe base real:
- Dexie/IndexedDB en `src/lib/local/db.ts`.
- Cola de mutaciones.
- Motor de sincronización.
- APIs `/api/sync/initial` y `/api/sync/pull`.

Falta complementar:
- Auditar qué formularios y vistas usan realmente el flujo local-first.
- Migrar escrituras críticas a cola offline.
- Probar conflictos, reintentos y reconciliación.
- Activarlo por fases porque toca saldos, deudas y presupuesto.

### E.7 Backup / Restore / Sync / Borrado seguro

Ya existe base real:
- Export/import JSON.
- Backup en servidor.
- Restore desde servidor.
- Dexie/local sync.
- Borrado de cuenta y reset de datos.

Falta complementar con prioridad crítica:
- El backup, restore, server-save, server-restore, sync inicial, sync incremental y borrado definitivo deben cubrir **todas** las tablas relacionadas al usuario, incluyendo tablas nuevas de salud, transporte, Aura, notificaciones, credenciales, logros y futuras tablas.
- Evitar listas manuales frágiles sin auditoría. Cada vez que se añada una tabla nueva al schema, debe existir una prueba/checklist técnico que falle si esa tabla no está clasificada para backup, restore, sync y delete.
- Definir un registro central de modelos por dominio con dependencias y orden de borrado/restauración, para no repetir listas diferentes en cada endpoint.
- El borrado definitivo de cuenta debe eliminar o anonimizar todo lo relacionado sin dejar huérfanos, respetando foreign keys y datos compartidos.
- Antes de cualquier despliegue que toque datos, ejecutar verificación de cobertura: modelos Prisma vs contrato de backup/sync/delete.

### E.8 Recomendación de siguiente bloque

El siguiente bloque recomendado es **Blindaje de datos + Salud documentos**:
- Primero blindar backup/restore/sync/delete para evitar pérdida de información al crecer el modelo.
- Aprovecha bases existentes de salud, órdenes, autorizaciones, pendientes, push y Aura.
- Aporta valor diario sin abrir una migración riesgosa.
- Permite primera fase local con selector nativo del celular y, más adelante, integración directa con Drive/OneDrive.
