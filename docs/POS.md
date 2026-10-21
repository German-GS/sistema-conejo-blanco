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

## Productos de prueba (demostraciones)

Solo el **administrador del sistema** puede crear **productos de prueba** (casilla «Producto de prueba» al crear un producto en Inventario). Sirven para mostrar todo el proceso sin ensuciar la contabilidad:

- **No generan asientos**: ni las ventas de caja, ni el traslado al recibir un pedido de tienda. No cuentan en el arqueo de caja, ni en los reportes, ni en Análisis y Salud financiera, ni en las alertas de inventario.
- Llevan la etiqueta **PRUEBA** (en el catálogo, en la caja, en el tiquete «DE PRUEBA — NO VÁLIDO» y en los pedidos de tienda).
- Se usan en **la caja de las tiendas y en sus pedidos de mercadería** (con sus traspasos). **No** se pueden usar en pedidos de vendedores ni en facturas, y los vendedores no los ven.
- Una venta, pedido o traspaso es **todo de prueba o todo real**: no se pueden mezclar.
- Aparecen en la caja solo mientras el **Modo de prueba** esté activo (Tienda → Configuración); la caja muestra un aviso grande mientras tanto. Se apaga al terminar la demostración.
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
