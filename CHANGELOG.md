# Registro de cambios — Sistema Conejo Blanco

Versionado `MAYOR.MENOR.PARCHE`:
- **PARCHE** (1.0.1): se corrige un error o se hace un ajuste pequeño.
- **MENOR** (1.1.0): se agrega una función nueva y todo lo anterior sigue igual.
- **MAYOR** (2.0.0): un cambio grande que modifica cómo se trabaja.

La versión se cambia en `app/package.json` y `backend/package.json` (el pie de página y el panel del sistema la leen solos).

## 1.14.0 — 23 oct 2026 — Reglas de asistencia más justas: tolerancia, almuerzo fijo y marcas estimadas
- **Tolerancia ±10 min en la entrada y en la salida** (parámetro `TOLERANCIA_MARCA_MINUTOS`): dentro de ella la marca cuenta como la hora del horario, sin tardanza ni extra; fuera, cuenta la hora real (08:57 con entrada a las 8 = 57 min).
- **Almuerzo como bloque fijo** (`ALMUERZO_BLOQUE_FIJO`): siempre se descuenta el almuerzo del empleado y se ignoran las marcas del medio, así que 3 o 5 marcas ya no son «ambiguas».
- **Marcas faltantes estimadas** (`MARCA_SOSPECHOSA_MINUTOS`): una marca sola, o una primera marca 2 h tarde (ej. 11:12 y 17:00), se estima con el horario y queda en «Resolver» con la hora propuesta. No se rebaja nada ni se pagan extras hasta que se confirme.
- **Marca faltante ≠ horas no trabajadas:** la primera es un olvido del reloj (sin rebajo); la segunda es tiempo real faltante verificado (se rebaja). La pantalla las muestra con nombres distintos.
- **Supervisor como verificación secundaria:** al pagar con hora manual u horario estándar se anota el supervisor que lo confirma. Sin supervisor las horas se pagan pero **no se rebaja** (`REBAJO_SOLO_VERIFICADO`); las horas de tienda digitadas cuentan como verificadas.
- **Bitácora de correcciones** (Asistencia → sección 4): quién, cuándo, motivo, supervisor, cómo estaba antes y cómo quedó. No se edita ni se borra.
- Al cambiar un parámetro de jornada, y al arrancar el servidor, se vuelven a leer los días sin resolver (no toca los resueltos ni los de planillas cerradas).
- Las reglas deben revisarse con el reglamento interno y un abogado laboral antes de aplicarlas con plata real.

## 1.13.0 — 23 oct 2026 — Los puestos de confianza quedan fuera del control del reloj
- Quien tenga **«Puesto de confianza»** (o no use el reloj) ya no aparece en Asistencia ni en sus resúmenes, se omite si sale en el archivo del reloj, no figura como «sin marcas» y sus días nunca bloquean la aprobación de una planilla. En la planilla se le paga siempre la jornada completa.
- El formulario del empleado explica esta regla y desactiva la casilla del reloj cuando el puesto es de confianza.

## 1.12.1 — 23 oct 2026 — Actualizaciones sin tropiezos
- Si hay una versión nueva publicada, el sistema lo avisa («Hay una versión nueva… Actualizar ahora») en lugar de dejar que pantallas ya cambiadas fallen en una pestaña vieja.
- Si una pestaña vieja no encuentra una pantalla, se recarga sola (también cuando el aviso lo da el empaquetador).
- El servicio que permite abrir la caja sin internet ya no guarda por error la página de inicio como si fuera un archivo, y limpia lo que hubiera quedado mal guardado.
- Al publicar, se conservan los archivos de las versiones anteriores (script `scripts/publicar-frontend.sh`) para que una pestaña abierta durante la actualización siga funcionando.

## 1.12.0 — 23 oct 2026 — Estructura de uso: pendientes, búsqueda rápida y guía de diseño (auditoría UX, olas 3 y 4)
- **«Para hacer hoy»** en el inicio: lo que necesita acción según el perfil (pedidos de tiendas por revisar o enviar, facturas vencidas o por vencer, planillas en borrador o sin pagar, inventario bajo, envíos de la caja rechazados, meses sin cerrar, pedidos sin facturar), con un clic a la pantalla correcta y contadores en el menú.
- **Búsqueda rápida** con Ctrl/Cmd + K (o la lupa del encabezado), **migas de pan**, menú abierto por defecto en pantallas grandes y nombres de sección más claros.
- **Formularios accesibles:** todas las etiquetas quedan unidas a su campo; componente `Campo` para pantallas nuevas.
- **Listas:** los filtros se recuerdan al abrir un detalle y volver, «Mostrar más» en listas largas, encabezados fijos en tablas largas y **vistas guardadas** de filtros en Pedidos y Facturas.
- **Acciones destructivas apartadas** («Eliminar» producto, «Anular» pedido) y confirmaciones propias en todos los casos.
- **Imágenes que no cargan** (logo, fotos) muestran un marcador claro en lugar de la imagen rota.
- **Uso del sistema** (Estado del sistema → Uso del sistema, solo administrador del sistema): pantallas más visitadas, uso por perfil, búsquedas sin resultado y llamadas que fallan, sin guardar lo que la gente escribe.
- **Guía de diseño** (página en el panel del administrador del sistema y `docs/GUIA_DE_DISENO.md`) y guía de pruebas con usuarios (`docs/PRUEBAS_CON_USUARIOS.md`).
- La aplicación instalada abre en la raíz y trae íconos de 192 y 512 px; el vendedor ve un aviso fijo cuando no hay internet.

## 1.11.0 — 23 oct 2026 — Mejoras de usabilidad (auditoría UX, olas 1 y 2)
Resultado de la auditoría de usabilidad (ver `docs/AUDITORIA_UX.md`).
- **Indicador de carga con red de seguridad:** barra fina arriba y anillo giratorio en las listas; si algo tarda más de 8 segundos avisa «Está tardando más de lo normal…» con botón para reintentar o recargar. Una pestaña que quedó vieja tras una actualización se recarga sola.
- **Arranque más rápido:** las pantallas se cargan cuando se necesitan; el paquete de entrada bajó de 227 KB a 98 KB comprimido. La entrada, el cambio de clave y la caja siguen abriendo sin internet.
- **Lenguaje unificado a «usted»** en todas las pantallas y en los mensajes del servidor.
- **Lectura y accesibilidad:** texto secundario más oscuro en el tema claro, texto pequeño de 12 a 13 px, anillo de foco para teclado, botones de al menos 40 px en pantallas táctiles, buscadores del vendedor con textos cortos y filtros de Pedidos que ya no se desbordan.
- **Aviso antes de cerrar la sesión por inactividad** (60 segundos, con cuenta regresiva y «Seguir trabajando»).
- **Borradores automáticos** en factura nueva, pedido nuevo, asiento manual y pago nuevo: al volver se puede recuperar lo escrito.
- **Confirmaciones propias** en lugar de las ventanas del navegador; lo irreversible (eliminar productos y clientes, convertir en prueba, reabrir el año fiscal) pide escribir una palabra.
- **Avisos globales** al guardar y en las acciones de Accesos; los botones deshabilitados dicen qué falta («Falta: el cliente, la vía de entrega…»).

## 1.10.1 — 23 oct 2026 — Tema para gerencias y ojito en las contraseñas
- El **interruptor de tema oscuro o claro** ahora también lo tienen el gerente general y la administración (gerencia). Cada persona guarda su elección en su navegador; el administrador del sistema sigue empezando en oscuro y los demás en claro.
- **Ojito para ver la contraseña** mientras se escribe: en la entrada, en cambiar contraseña (los tres campos), al desactivar la verificación en dos pasos y en la confirmación de contraseña de la caja.

## 1.10.0 — 23 oct 2026 — Tema oscuro o claro para el administrador del sistema
- La cuenta del administrador del sistema tiene un **interruptor de tema** (oscuro o claro) junto al selector de vista, en el panel, la caja y la vista de vendedor. La elección se recuerda en el navegador; el tema oscuro sigue siendo el de partida. Las demás cuentas no cambian.

## 1.9.0 — 22 oct 2026 — Datos de cada tienda y registro de actividad
- **Datos de cada tienda en el tiquete** (Tienda → Configuración): razón social, nombre comercial, cédula jurídica, teléfono, correo, dirección, mensaje al pie y leyenda legal por tienda, con vista previa. Lo que se deja vacío usa los datos generales de la empresa.
- **Registro de actividad de las tiendas** (Tienda → Actividad), solo de consulta y con descarga en CSV: lo que pasa en la caja, aunque sea sin internet, con su hora real (abrir y cerrar caja, productos quitados del tiquete, tiquetes vaciados o reimpresos, entradas sin internet, mercadería aceptada, conteos, pedidos, respaldos), los cambios hechos desde el panel (anulaciones, precios de tienda, stock mínimo, datos de la tienda, configuración del POS) y los envíos que el servidor no aceptó.

## 1.8.0 — 22 oct 2026 — Entrar sin internet y respaldo de seguridad
- **Entrar sin internet** (encargado de tienda): al entrar con internet, la computadora guarda una huella cifrada de la contraseña; si después no hay conexión (se fue la luz, se reinició el equipo) puede entrar con su correo y contraseña de siempre y seguir cobrando, recibiendo mercadería y contando inventario. Vale 30 días, se borra si el servidor rechaza la contraseña y bloquea 5 minutos tras 5 intentos fallidos. Al volver el internet la caja confirma la contraseña sola o la pide con un aviso, y envía todo lo pendiente.
- **La sesión ya no saca a la persona de la caja:** si el token vence con la caja abierta, solo se pide confirmar la contraseña (no se pierde el tiquete a medias).
- **Respaldo de seguridad** (Ventas de hoy → Respaldo de seguridad): guarda en un archivo lo que aún no se envió al sistema y permite restaurarlo si se borran los datos del navegador. Sin internet y con registros pendientes, la caja avisa «Guarde un respaldo» cada 2 horas. La caja también pide almacenamiento persistente al navegador.
- Corrección: la caja refrescaba mal el estado «con/sin internet» al volver a abrirse dentro de la misma sesión.

## 1.7.0 — 22 oct 2026 — Conteo de inventario en la tienda
- **Contar inventario desde la caja** (Inventario → Contar inventario): la tienda escribe cuántos pares hay en el estante y un motivo. **Solo puede subir** la existencia (lo que baja, baja por ventas; las correcciones hacia abajo las hace la administración desde Bodega → Ajuste), también lo exige el servidor.
- Funciona **sin internet**: la existencia sube de inmediato y el conteo se envía solo al volver la conexión, sin duplicarse.
- Cada conteo queda en el **kardex** y en la **bitácora** (quién, tienda, motivo y antes/después de cada producto), visible para el administrador del sistema. No genera asiento contable.
- La bitácora ahora muestra el nombre de las acciones «Asiento borrado» y «Conteo de inventario en tienda».

## 1.6.0 — 22 oct 2026 — La tienda trabaja sin internet: recepción de mercadería e informes en CSV
- **Recibir mercadería sin internet:** la tienda acepta el envío aunque no haya conexión; la existencia sube de inmediato y la aceptación se envía sola al volver el internet (el servidor mueve el inventario y genera el asiento; reenviar no duplica). Si el servidor no la acepta, un aviso explica por qué y permite reintentar.
- **Informes en CSV:** en la caja (sin internet) el inventario y el informe de ventas por período; en el panel, el informe de ventas (Tienda → Ventas) y las existencias o el kardex (Bodega). Archivos con «;» y coma decimal para abrirse en columnas en Excel. Las ventas ya enviadas se conservan 45 días en la computadora.
- **Tiquete:** márgenes más amplios (arriba y a los lados) para que no se corten las letras en impresoras de rollo, con ajuste en la caja (Ventas de hoy → Márgenes del tiquete) y botón de tiquete de prueba.
- **Avisos de la caja** (sin internet, mercadería en camino, errores) con color sólido y letra legible también en el tema oscuro.

## 1.5.3 — 22 oct 2026 — Ventana de cobro sin texto tapado
- Caja: el botón «Confirmar cobro» ya no tapa el contenido de la ventana de cobro (queda en un pie separado y el contenido se desplaza por encima).
- Los cuadros de instrucciones (cobro con tarjeta, SINPE y transferencia, abrir y cerrar caja) ahora son azul sólido con letra blanca para que se lean también en el tema oscuro.

## 1.5.2 — 22 oct 2026 — Arreglo al guardar mínimos de stock
- Productos de tienda: al guardar los **mínimos de stock** salía el error «put is not a function» (los precios y códigos sí se guardaban). Corregido; además, si algo falla al guardar los mínimos, el mensaje lo explica y aclara qué sí se guardó.

## 1.5.1 — 22 oct 2026 — Inventario en la caja y búsqueda de productos
- **Nuevo botón «Inventario» en la caja:** lista lo que hay en la tienda (existencias, mínimo y precio), con buscador y opción de ver también lo que no tiene existencias.
- **La búsqueda de la caja ve todo lo que está en la tienda**, también lo que aún no tiene precio de tienda: se muestra como «SIN PRECIO DE TIENDA» y explica por qué no se puede vender. La administración tiene el botón «Poner precios».
- **Pedir mercadería:** rótulo azul con letra blanca, productos con existencias en bodega primero y mensajes que explican cuando no hay productos (por ejemplo, si el Modo de prueba está apagado).
- **Modo de prueba desde la caja:** botón en la barra superior (solo administrador del sistema) para encenderlo o apagarlo sin salir de la caja.

## 1.5.0 — 22 oct 2026 — Pedidos con buscador, ingresos solo por bodega y vistas del sistema
- **Pedir mercadería con buscador y fichas:** se busca en todo el catálogo (también lo que la tienda aún no vende) y cada resultado es una tarjeta con foto, código, color, existencias en tienda y bodega, y precio. «Ver todos los productos» lista el catálogo. En la caja se sigue vendiendo solo lo que tiene precio de tienda.
- **Los ingresos de mercadería entran solo por la bodega** (también lo exige el servidor): a las tiendas llega por pedido y traspaso. Los botones Ingreso y Ajuste de Bodega solo se ven en Existencias, no en el kardex.
- **Cambio de vista** para el administrador del sistema: Administración | Caja | Vendedor, sin cerrar sesión.
- **Convertir en prueba** (solo administrador del sistema): una venta o pedido de tienda ya contabilizado se vuelve de prueba y se borran sus asientos (y reversas); queda en la bitácora y no se permite en meses cerrados.

## 1.4.0 — 22 oct 2026 — Caja guiada y productos de prueba
- **Caja (POS) rediseñada** con el estilo del resto del sistema y pensada para personal de tienda: barra con logo, estado de caja e internet siempre visibles, botones grandes con ícono, avisos grandes con botón de acción (caja cerrada, sin internet, envíos en camino, productos por acabarse, ventas por enviar), guía «Cómo hacer una venta», cobro paso a paso por forma de pago con el vuelto en grande, y apertura y cierre de caja explicados (el cierre cuenta el efectivo sin mostrar el esperado).
- **Productos de prueba** (solo el administrador del sistema): para demostrar todo el proceso sin ensuciar la contabilidad. No generan asientos ni cuentan en caja, reportes, análisis ni alertas; no se usan en pedidos de vendedores ni facturas; no se mezclan con productos reales; se ven en la caja solo con el **Modo de prueba** (Tienda → Configuración) y se eliminan con todo lo hecho con ellos.

## 1.3.0 — 22 oct 2026 — Punto de venta (POS) de las tiendas
Función nueva; lo anterior sigue igual.
- **Caja de tienda (POS)**: venta con lector de código de barras, pagos en efectivo, tarjeta, SINPE Móvil y transferencia (también divididos), vuelto, tiquete de 80 mm (régimen simplificado, sin factura electrónica), turnos de caja con arqueo y anulación de tiquetes. Funciona **sin internet**: guarda catálogo, existencias y ventas en el equipo y las envía solas al volver la conexión.
- **Perfil Encargado de tienda**: entra directo a la caja de la tienda que tiene asignada (también obligado en el servidor); su cuenta no se desconecta por inactividad durante el turno.
- **Inventario por tienda** con stock mínimo y **alertas de inventario bajo** en la caja, en el Inicio y en Tienda → Alertas. Precio de tienda y código de barras por producto y color (Tienda → Productos de tienda).
- **Pedidos de mercadería** desde la caja, con sugeridos (agotados o en el mínimo) y **seguimiento**: enviado → recibido → revisado (aceptado o corregido, con el costo especial por producto) → alistado → enviado a la tienda → recibido y aceptado por la tienda.
- **Contabilidad**: cada venta genera su asiento (caja o banco contra ventas, y costo de ventas contra Inventario de Tiendas); al aceptar la tienda un envío se genera el asiento del traslado (cuentas nuevas 1305 Inventario de Tiendas y 5460 Diferencia de costo en traslados a tiendas). Cada tienda lleva su costo promedio por producto.
- **Panel Tienda**: ventas, cajas, pedidos de tienda, alertas, productos de tienda y configuración. Las ventas de tienda entran a los tableros de Análisis y a Salud financiera, con nuevas verificaciones de cuadre.

## 1.2.0 — 20 oct 2026 — Salud financiera
Función nueva, solo para el administrador del sistema.
- Pestaña **Salud financiera** en Análisis: estado general, indicadores de liquidez, rentabilidad, eficiencia y deuda con semáforo, tendencia de ingresos, gastos y caja, y lo que se debe.
- **¿Qué no cuadra y dónde buscar?**: 39 verificaciones (las 26 reglas de integridad y 13 comparaciones nuevas entre el libro mayor y las facturas, pagos, bodega y planillas) que indican qué pasa, por dónde puede estar el origen y ejemplos concretos.
- La pestaña del navegador dice "Conejo Blanco — Administración" en el panel de administración.

## 1.1.1 — 20 oct 2026 — Análisis desde el libro mayor
- Los tableros de Análisis ahora toman todas las cifras en colones del libro mayor (ventas y costo de ventas, cartera, inventario y costo laboral), y el cliente, vendedor, producto o planilla de cada monto se obtiene del documento que originó el asiento.
- Cada pestaña muestra un "cuadre" que compara el mayor con el detalle operativo y avisa si hay diferencias.
- Planilla: si no hay planillas aprobadas explica por qué (el gasto entra al mayor al aprobar la planilla) y muestra la asistencia importada y las planillas en borrador.
- La descarga del libro mayor incluye factura, cliente, vendedor, ubicación y planilla de origen.

## 1.1.0 — 20 oct 2026 — Análisis de datos y conexiones
Funciones nuevas, solo para el administrador del sistema; todo lo anterior sigue igual.
- Sección **Análisis** con tableros de ventas (incluye análisis ABC), cartera, inventario, planilla (solo totales) y contabilidad, con filtro de fechas.
- Conjuntos de datos descargables en CSV, Excel o JSON para Power BI, Excel o Python, con vista previa. Sin claves ni datos de contacto de clientes; la planilla sale anonimizada salvo que se pida completa (queda en el registro de actividad).
- Clave de solo lectura para que Power BI o Python se actualicen solos (se muestra una vez, se puede revocar, queda en la bitácora, no incluye planilla).
- Inicio del sistema: tarjeta **Conexiones** con quién está en línea, su última actividad, último inicio de sesión y desde dónde se conectó.
- Documentación del esquema de la base de datos en `docs/BASE_DE_DATOS.md`.
- Arreglo: en el perfil oscuro no se leía el texto de los campos de formulario ni el de los botones rojos.

## 1.0.0 — 16 oct 2026 — Primera versión en uso real
Línea base con la que la planilla entra en producción.
- Pedidos, clientes, catálogo, inventario, traspasos, facturación (manual y de pedidos), notas de crédito y pagos recibidos.
- Contabilidad: catálogo de cuentas, libro diario con número de asiento, libro mayor (Excel), reportes, cierre mensual y cierre fiscal (renta), verificación de cálculos (26 reglas).
- Planilla: empleados y puestos, lector del reloj (.xls/.xlsx), asistencia, planillas con cálculo de CCSS 2026, renta, extras y feriados, colillas de pago en PDF (media carta), archivo de Banco Popular, informes y asientos contables, anulación y reversas.
- Seguridad y accesos: perfiles (sistema, gerente general, administración, contador, asistente, vendedor), permisos por cuenta, claves temporales, verificación en dos pasos, bloqueo por intentos, bitácora de accesos y registro de actividad.
- Panel del administrador del sistema: métricas del servidor, políticas, módulos, mantenimiento y exportación de datos.
