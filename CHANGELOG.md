# Registro de cambios — Sistema Conejo Blanco

Versionado `MAYOR.MENOR.PARCHE`:
- **PARCHE** (1.0.1): se corrige un error o se hace un ajuste pequeño.
- **MENOR** (1.1.0): se agrega una función nueva y todo lo anterior sigue igual.
- **MAYOR** (2.0.0): un cambio grande que modifica cómo se trabaja.

La versión se cambia en `app/package.json` y `backend/package.json` (el pie de página y el panel del sistema la leen solos).

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
