# Punto de venta (POS) de las tiendas

Caja para las tiendas de Conejo Dorado. Una sola terminal por tienda, trabaja **con o sin internet** y se supervisa desde el panel de administración.

## Cómo funciona

- **Inventario independiente.** Cada tienda es una ubicación con su propio stock (`stock_ubicaciones`). El POS descuenta solo de la tienda. La mercadería llega desde bodega con los traspasos de siempre. Todo se ve en el panel (Bodega y Tienda).
- **Tiquete, no factura electrónica.** Régimen simplificado: tiquete numerado por tienda (`T01-000123`), sin IVA aparte, con la leyenda "no es factura electrónica".
- **Sin internet.** La terminal guarda el catálogo, las existencias y las ventas en el propio equipo (IndexedDB) y la aplicación en el navegador (service worker). Cada venta lleva un identificador propio: al volver el internet se envía sola y reenviarla nunca la duplica.
- **Libro mayor.** Cada venta genera su asiento (caja o banco contra Ventas 4100) y, si el producto tiene costo, el asiento de costo de ventas (5100 contra Inventario 1300). Anular un tiquete devuelve las existencias y reversa los asientos.
- **Control de caja.** Turnos con fondo inicial y arqueo al cerrar (esperado, contado y diferencia).
- **Alertas de inventario bajo.** Cada producto de tienda tiene un mínimo; al llegar a él se avisa en la caja, en el Inicio del panel y en Tienda → Alertas.

## Pedidos de mercadería a la bodega (con seguimiento)

Desde la caja, **Pedir mercadería** arma el pedido de reposición. Ya trae marcados los productos **agotados** o en su **mínimo**, con la cantidad sugerida (el doble del mínimo, o una docena si no hay mínimo, en docenas completas) y lo que hay en bodega. Funciona **sin internet**: queda guardado y se envía solo.

**Seguimiento** (se ve en la caja y en el panel, con fecha, persona y nota de cada paso):

1. **Enviado**: la tienda lo manda.
2. **Recibido**: la administración confirma que lo vio (Pedidos → Reposición de tiendas).
3. **Revisado**: la administración lo marca **aceptado** (se envía lo pedido) o **corregido** (se envía lo que hay en bodega) con su anotación, y **fija el costo especial por par** de cada producto. Esto arma el traspaso desde bodega. La tienda ve de inmediato qué se le va a enviar; no hay réplica porque es lo que hay en bodega.
4. **Alistado**: bodega lo prepara.
5. **Enviado a la tienda**: sale de bodega (despacha el traspaso y descuenta el inventario de bodega).
6. **Recibido y aceptado**: la tienda verifica lo que llegó contra la orden en su caja y acepta. Si hay diferencias debe anotarlas. Aquí entra el inventario a la tienda y se genera el asiento.

**Costo especial y asiento.** Las tiendas reciben la mercadería a un costo especial, menor que el normal. Al aceptar la tienda:

| Cuenta | Debe | Haber |
|---|---|---|
| 1305 Inventario de Tiendas | lo recibido × costo especial | |
| 5440 Pérdidas por mermas | lo enviado que no llegó × costo normal | |
| 5460 Diferencia de costo en traslados a tiendas | costo normal − costo especial de lo recibido (si el especial es mayor, va al haber) | |
| 1300 Inventario de Mercaderías | | lo enviado × costo normal |

Cada tienda lleva su **costo promedio por producto** (promedio de lo que ya tenía y lo recibido a costo especial). Las ventas del POS calculan el costo de ventas con ese costo y lo rebajan de la cuenta 1305. El costo especial nunca se muestra en la caja.

Un traspaso de un pedido de tienda **no se puede recibir desde Bodega**: lo recibe la tienda (así siempre queda el asiento). Rechazar o cancelar solo se puede antes de revisar.

**Recibir la mercadería sin internet.** La tienda acepta el envío aunque no haya internet: la aceptación queda guardada en la computadora, la existencia de la tienda **sube de inmediato** y el pedido aparece como «Aceptada · se enviará con internet». Al volver la conexión se envía sola con las demás ventas; el servidor mueve el inventario y genera el asiento (con la fecha de cuando llegó la conexión) y, si se reenvía por error, no se duplica. Si el servidor no la acepta, un aviso rojo explica por qué y permite reintentar.

## Lo esencial sin internet

| Función | Sin internet |
|---|---|
| **Cobrar** (tiquete de venta) | Sí: se guarda en la computadora, se imprime y se envía solo al volver la conexión. |
| **Inventario** | Sí: aceptar la mercadería que llega, contar el inventario (solo sube) y pedir mercadería. |
| **Entrar (login)** | Sí, solo el **encargado de tienda** y solo en una computadora donde ya entró antes con internet (ver abajo). |
| Informes CSV, tiquete de prueba, respaldo | Sí. |

Lo que **necesita internet**: la primera vez que se configura una terminal (elegir la tienda y bajar el catálogo), enviar lo pendiente al sistema, y todo lo de administración (precios, revisar pedidos, ajustes hacia abajo).

### Entrar sin internet
Al entrar con internet, el encargado de tienda deja guardada en esa computadora una **huella** de su contraseña (PBKDF2 con sal; nunca la contraseña). Si después no hay internet (por ejemplo, se fue la luz y el equipo se reinició), la pantalla de entrada acepta su correo y contraseña de siempre y lo deja trabajar en su caja.

- Vale **30 días** desde la última vez que entró con internet y se borra si el servidor rechaza esa contraseña (cambió o se desactivó la cuenta). Cinco intentos fallidos bloquean 5 minutos.
- Solo aplica al encargado de tienda (el perfil que entra directo a la caja, sin verificación en dos pasos). Las cuentas de administración, gerencia y sistema siempre necesitan internet.
- Mientras la sesión es «sin internet» no hay permiso del servidor, así que nada se envía. Al volver la conexión la caja **confirma la contraseña sola** (si la persona la escribió en esta sesión) o muestra el aviso «Confirme su contraseña»; entonces se envía todo lo pendiente.
- Si la sesión vence con internet y la caja abierta (token de 8 horas), la persona **no es sacada de la caja**: se le pide la contraseña en un aviso y no pierde el tiquete que tiene a medias.

### Si se borran los datos del navegador
Todo lo que **ya se envió** al sistema está a salvo. Lo que **no se había enviado** (ventas, conteos, mercadería aceptada o pedidos hechos sin internet) vive solo en la computadora y **se pierde** si alguien borra «cookies y datos de sitios» o «datos de navegación». Además, sin internet no se podría ni abrir la aplicación hasta conectarse una vez (se borra también la copia que permite abrirla sin conexión).

Qué se hizo para reducir ese riesgo:
- La caja pide al navegador **almacenamiento persistente** (evita que lo borre por falta de espacio; no impide que alguien lo borre a mano).
- **Respaldo de seguridad** (Ventas de hoy → Respaldo de seguridad): un archivo con todo lo guardado en la computadora; con **Restaurar respaldo** se recupera (es seguro repetirlo: el servidor ignora lo que ya recibió). Mientras no haya internet y haya registros sin enviar, la caja avisa «Guarde un respaldo» cada 2 horas.
- Para recuperarse: conectar a internet, entrar, elegir la tienda y restaurar el último respaldo.

## Datos de cada tienda en el tiquete

Cada tienda tiene su **propia cédula jurídica** (por eso trabajan en régimen simplificado). En *Tienda → Configuración → Datos de cada tienda* se llena, por tienda: razón social, nombre comercial (opcional), cédula jurídica, teléfono, correo, dirección, mensaje al pie y leyenda legal. Hay una vista previa de cómo queda el encabezado. Lo que una tienda deje vacío usa los datos generales de la empresa (Configuración → Datos de factura), y el mensaje al pie y la leyenda tienen valores por defecto. La caja recibe los cambios al actualizar el catálogo (cada 10 minutos o al reconectarse) y los guarda para imprimir sin internet.

## Registro de actividad de las tiendas

*Tienda → Actividad* muestra, con filtros (fechas, tienda, qué pasó, origen, texto) y descarga en CSV, todo lo que pasa en las tiendas. **Es solo de consulta: no se edita ni se borra.** Cada registro lleva quién, dónde, la **hora real** en que ocurrió y, si se hizo sin internet, la marca «sin internet · llegó a las…» (la caja lo guarda y lo envía con lo demás al volver la conexión; reenviar no duplica).

Qué se anota:

| Origen | Qué |
|---|---|
| **Caja** | Abrir y cerrar caja (con fondo, esperado, contado y diferencia); **producto quitado del tiquete antes de cobrar**; **tiquete vaciado sin cobrar**; **reimpresión de tiquetes**; entrar sin internet, sesión vencida/confirmada y salida; mercadería aceptada (con diferencias); conteos de inventario; pedidos de mercadería; respaldos guardados o restaurados; asignar o quitar la tienda de una computadora. |
| **Panel** | Anulación de ventas; convertir en prueba; cambios de precio de tienda y código de barras; stock mínimo (antes y después); datos del tiquete de cada tienda (antes y después); configuración del POS y modo de prueba. |
| **Servidor** | Cada envío que el servidor **no aceptó** (venta, pedido, recepción o conteo rechazado) con el motivo. |

Además siguen su propio historial: las ventas y cajas (con cajero y hora), el seguimiento de cada pedido (quién y cuándo en cada paso), el kardex de inventario y la bitácora del sistema (conteos y asientos borrados). Los cambios de producto (precios, costos, colores) también quedan en el historial de ediciones del producto.

## Contar el inventario de la tienda

En la caja, **Inventario → Contar inventario**: la persona escribe cuántos pares hay en el estante de cada producto y un motivo (obligatorio). Reglas:

- **Solo puede subir** la existencia. Si escribe menos de lo que dice el sistema, no deja guardar («No se puede bajar: avise a la administración»); lo que baja, baja por ventas, y las correcciones hacia abajo las hace la administración desde Bodega → Ajuste. El servidor también lo exige y el encargado de tienda no puede usar el ajuste de Bodega.
- Funciona **sin internet**: la existencia sube de inmediato y el conteo se envía solo al volver la conexión (no se duplica si se reenvía). Se envía lo que **se suma** (no el total contado), para que las ventas hechas sin internet entre el conteo y el envío no se descuenten dos veces.
- Cada conteo queda en el **kardex** («Ajuste de conteo», con la persona y la fecha) y en la **bitácora** (Accesos → Bitácora, acción «Conteo de inventario en tienda (aumento)», con el motivo y el antes y después de cada producto), visible para el administrador del sistema.
- **No genera asiento contable**: la existencia sube pero el libro mayor no; por eso Salud financiera puede marcar la diferencia entre el inventario del mayor y las existencias, y la bitácora permite rastrearla.

## Informes en CSV

- **En la caja** (funcionan sin internet, con lo guardado en la computadora): *Inventario → Descargar inventario* y *Ventas de hoy → Descargar informe de ventas* (hoy, 7 días, 30 días o todo lo guardado; las ventas ya enviadas se conservan 45 días). El informe de ventas trae una fila por producto vendido; el total del tiquete va solo en su primera línea para que no se sume dos veces.
- **En el panel**: *Tienda → Ventas → Descargar CSV* (mismo informe, desde el servidor y con los filtros de la pantalla) y *Bodega → Descargar CSV* (existencias o kardex, con el filtro aplicado).
- Los archivos usan «;» como separador y coma decimal para abrirse en columnas en Excel en español.

## Productos de prueba (demostraciones)

Solo el **administrador del sistema** puede crear **productos de prueba** (casilla «Producto de prueba» al crear un producto en Inventario). Sirven para mostrar todo el proceso sin ensuciar la contabilidad:

- **No generan asientos**: ni las ventas de caja, ni el traslado al recibir un pedido de tienda. No cuentan en el arqueo de caja, ni en los reportes, ni en Análisis y Salud financiera, ni en las alertas de inventario.
- Llevan la etiqueta **PRUEBA** (en el catálogo, en la caja, en el tiquete «DE PRUEBA — NO VÁLIDO» y en los pedidos de tienda).
- Se usan en **la caja de las tiendas y en sus pedidos de mercadería** (con sus traspasos). **No** se pueden usar en pedidos de vendedores ni en facturas, y los vendedores no los ven.
- Una venta, pedido o traspaso es **todo de prueba o todo real**: no se pueden mezclar.
- Aparecen en la caja solo mientras el **Modo de prueba** esté activo (Tienda → Configuración); la caja muestra un aviso grande mientras tanto. Se apaga al terminar la demostración.
- Una venta o pedido que se hizo antes del modo de prueba se puede **convertir en prueba** (solo el administrador del sistema, desde el detalle en Tienda → Ventas o Pedidos de tiendas): se borran sus asientos y reversas y queda anotado en la bitácora (no se permite en meses cerrados).
- El administrador del sistema cambia entre las pantallas Administración, Caja y Vendedor con el selector del encabezado.
- Se **eliminan** (botón Eliminar en Inventario, solo el sistema) junto con todo lo hecho con ellos: ventas, pedidos, traspasos, existencias y movimientos.

## Puesta en marcha de una tienda

1. **Productos de tienda** (panel → Tienda → Productos de tienda): precio al detalle, código de barras y mínimo de cada producto y color. Un producto sin precio de tienda no aparece en la caja. El botón "Asignar códigos de barras faltantes" crea códigos EAN-13 internos.
2. **Configuración** (panel → Tienda → Configuración): a qué cuenta bancaria entra lo cobrado con tarjeta, SINPE y transferencia, y el mensaje al pie del tiquete. El encabezado sale de Configuración → Datos de factura.
3. **Cuenta del encargado de tienda** (Control de accesos): perfil *Encargado de tienda* con su tienda asignada. Al iniciar sesión entra directo a la caja de esa tienda y no ve nada más (solo puede operar su tienda, también en el servidor). No se desconecta por inactividad durante su turno.
4. **Terminal**: abrir la aplicación en el navegador de la caja **con internet la primera vez**, iniciar sesión y esperar a que baje el catálogo. Opcional: instalarla como aplicación (menú del navegador → Instalar). La gerencia y el sistema, si abren la caja, eligen la tienda.
5. **Impresora de tiquetes** (80 mm): dejarla como impresora predeterminada del equipo. Para imprimir sin diálogo, abrir Chrome con la opción `--kiosk-printing`.
6. **Lector de código de barras**: cualquier lector que funcione como teclado. El cursor siempre queda en el campo de búsqueda (tecla F2).

## Perfiles y pantallas

| Perfil | Pantalla al iniciar sesión |
|---|---|
| Vendedor | Pedidos de mayoreo |
| Encargado de tienda | Caja (POS) de su tienda |
| Gerencia (gerente general, administración, contador, asistente) | Panel de administración |
| Administrador del sistema | Panel de administración con la vista del sistema (tema oscuro) |

## Teclas

`F2` buscar · `F12` cobrar / confirmar cobro · `Esc` cerrar ventanas.

## Qué queda para después

Etiquetas con código de barras impresas desde el sistema, devoluciones hechas por el cajero, descuentos, gaveta de dinero conectada, reportes X/Z, varias terminales por tienda y clave rápida (PIN) del cajero.
