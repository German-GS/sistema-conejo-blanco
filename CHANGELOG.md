# Registro de cambios — Sistema Conejo Blanco

Versionado `MAYOR.MENOR.PARCHE`:
- **PARCHE** (1.0.1): se corrige un error o se hace un ajuste pequeño.
- **MENOR** (1.1.0): se agrega una función nueva y todo lo anterior sigue igual.
- **MAYOR** (2.0.0): un cambio grande que modifica cómo se trabaja.

La versión se cambia en `app/package.json` y `backend/package.json` (el pie de página y el panel del sistema la leen solos).

## 1.20.1 — 27 oct 2026 — La pantalla del punto ya no pide «¿Sigue ahí?» y tiene modo pantalla completa
- **Sin cierre por inactividad en las pantallas de marca** (`/punto` y `/marcar`): no usan la sesión del sistema, así que el aviso «¿Sigue ahí? Su sesión se cerrará…» ya no aparece sobre el QR aunque el navegador tenga una sesión abierta. El resto del sistema conserva su control de inactividad.
- **Pantalla completa y bloqueo** en la pantalla del punto: un botón la pone en pantalla completa, la mantiene encendida e ignora los toques (nadie cierra o cambia la página por accidente). **Para salir hay que mantener presionada la hora 3 segundos** (o Esc en un teclado). La pantalla cubre también el pie de página. En un iPad sin pantalla completa real se avisa cómo ocultar las barras con «Añadir a pantalla de inicio».

## 1.20.0 — 27 oct 2026 — Empleado de prueba para probar la marca
- En la ficha del empleado, casilla **«Empleado de prueba»** (solo la ve y la puede marcar el administrador del sistema; no se puede en alguien que ya tiene planillas pagadas). Sirve para probar cómo marca el personal (celular, PIN y QR) sin dejar rastro:
  - **Nunca entra a una planilla**, no genera días de asistencia, no sale en el informe de empleados ni en la importación del reloj o del Excel de empleados.
  - Sus marcas del celular **sí quedan registradas** y se ven en «Marcas del celular», con el aviso «no genera asistencia ni planilla»; no se suman a ningún día. «Marcas a mano» también lo omite.
  - Lleva la insignia **«De prueba»** en Empleados y en «Celulares y PIN».

## 1.19.0 — 27 oct 2026 — Marcar desde el celular: PIN, celular único y QR que cambia
- **Un celular y un PIN por empleado.** Nueva pantalla del administrador del sistema: Planilla → «Celulares y PIN». Le da a cada empleado un **código de activación de un solo uso** (vale 24 horas, se muestra como QR y enlace). El empleado lo abre en **su** celular (`/marcar`), elige un **PIN de 6 números que solo él conoce** (no se aceptan 123456, 111111, etc.) y ese celular queda registrado.
- **El celular es la llave.** Al activarse, el celular genera una llave de seguridad que **no se puede sacar de él**; cada verificación va firmada con esa llave sobre un reto de un solo uso (60 s). Copiar el PIN, el enlace o una captura no sirve desde otro aparato. Una repetición del mismo envío tampoco pasa.
- **Intentos:** 5 fallos (PIN o celular distinto) bloquean al empleado 15 minutos; todo intento fallido, bloqueo, activación y reset queda en la bitácora.
- **Solo el administrador del sistema** puede dar un código nuevo (cambia de celular: borra el anterior y el PIN) o **liberar** (quita celular y PIN sin dar código). Ni la gerencia puede. No incluye puestos de confianza ni quien no usa reloj.
- **Pantalla del punto (QR que cambia).** Planilla → «Puntos de marca» (administrador del sistema): se crea el punto de la empresa (con «Usar mi ubicación actual», radio de 100 m) y se conecta una tablet o monitor con un enlace de un solo uso. Esa pantalla (`/punto`) muestra en grande un QR que **cambia cada 30 segundos** y no se apaga. Una foto del QR deja de servir a los 30–60 s.
- **Marcar.** El empleado escanea el QR con la cámara de su celular, escribe su PIN y listo: la hora la pone el servidor (hora de Costa Rica), y se firma con el celular registrado. Dos toques seguidos (menos de 2 min) cuentan como uno.
- **La ubicación no bloquea, solo verifica.** Dentro del radio y con buena precisión = «verificada». Fuera de zona, imprecisa o sin permiso = la marca **se guarda y se paga igual**, y queda «por revisar» en Planilla → «Marcas del celular» (con distancia y motivo): nadie pierde pago por un GPS flojo. Sin QR vigente no se puede marcar en la empresa.
- **Se mezcla con el reloj.** La marca entra a las del día y pasa por las mismas reglas (tolerancia, almuerzo fijo, marcas que faltan, anomalías). Si el archivo del reloj se importa después, **suma** y no borra lo marcado en el celular. El día muestra la insignia «Con celular». No toca días ya decididos, de planillas aprobadas ni del personal de tienda (sus horas siguen en «Horas de tienda»).
- Un tope de velocidad holgado en estas rutas: muchos empleados marcan a la vez desde el mismo wifi sin bloquearse; los intentos de PIN se frenan por empleado.

## 1.18.0 — 27 oct 2026 — Marcas a mano, justificante de viáticos, pensionado y anomalías del empleado
- **Marcas a mano (reloj dañado):** nueva pantalla Planilla → «Marcas a mano», solo para el administrador del sistema y la gerencia general. Cuadrícula por semana, colaborador y día con entrada, salida a almuerzo, regreso y salida (se escribe 8:00 o 1305); casilla «No vino». Pasan por las mismas reglas del reloj (tolerancia, almuerzo fijo, marcas que faltan) y se ve el resultado de cada día al guardar. Cada día queda marcado «Anotada a mano» con quién y cuándo lo anotó, y en la bitácora. No se tocan días de planillas aprobadas ni días ya decididos; un archivo del reloj que se importe después no pisa lo anotado a mano.
- **Viáticos con justificante:** al anotar un viático en la planilla hay una caja de texto obligatoria para el justificante (para qué fue y qué comprobante tiene). Queda en la línea, en el detalle y en el Excel del libro de salarios.
- **Pensionado que sigue trabajando:** en la ficha del empleado, casilla «Cotiza al IVM». Desmarcada, la planilla le rebaja solo SEM y Banco Popular (6,5 %) y la renta se calcula sin esa deducción de IVM. Aparece una insignia «Pensionado».
- **Anomalías del empleado:** el almuerzo de un día con las 4 marcas que dura menos de 30 minutos o más de la hora más la tolerancia (10 min) **ya no cambia el pago** (siempre se descuenta la hora fija); se anota solo como anomalía del empleado. También se pueden anotar a mano (tardanza, salida temprana, ausencia, otro). Cada anomalía se puede descartar (con motivo) o incluir en una **carta de amonestación**: un borrador en PDF con los hechos, líneas de firma y de «se negó a firmar», que debe revisar el asesor legal antes de entregarse. Quedan como «carta emitida». Las pendientes salen en «Para hacer hoy» y con un número en el botón «Anomalías» de cada empleado.
- Parámetro nuevo: `ALMUERZO_ANOMALIA_CORTO_MINUTOS` (30).

## 1.17.3 — 26 oct 2026 — El almuerzo depende del largo de la jornada, no del día
- Un **sábado completo** (ej. 9 a 6) ya descuenta el almuerzo como cualquier otro día: antes el editor del horario sumaba una hora de más (57 h en lugar de 56 con siete días de 9 a 6) y el cálculo de lo esperado quedaba una hora alto, lo que habría descontado de más. El sábado corto (8 a 1) sigue sin almuerzo. Se aplica a todos los días: el almuerzo se resta cuando la jornada del día pasa de 6 horas.
- Igual en «Horas de tienda» al proponer los valores de cada día.

## 1.17.2 — 26 oct 2026 — Tope semanal de 48 horas ordinarias
- Si en una semana (lunes a domingo) se superan las **48 horas ordinarias**, lo que pasa se paga como **hora extra desde el primer minuto**, aunque ningún día haya pasado de su límite diario (ej. quien trabaja 7 días de 8 horas). Se cuentan solo los días ordinarios con marcas confirmadas, y la extra que ya salió por día no se paga dos veces; cada semana se cuenta aparte.
- El tope es el parámetro **TOPE_ORDINARIAS_SEMANA_HORAS** (48), en Planilla → Parámetros.

## 1.17.1 — 26 oct 2026 — Se quita el «contrato especial de horas» de la ficha del empleado
- Ya no aparece el campo «Contrato especial: horas ordinarias por semana»: podía dar a malos entendidos. En comercio la semana se paga sobre 56 horas por el sector «comercio», sin necesidad de ese campo.
- A los empleados de comercio que tenían «56» escrito ahí se les quita al arrancar el servidor (el valor de la hora no cambia: salario ÷ 56; solo vuelve el día ordinario a 8 horas, que es lo correcto).

## 1.17.0 — 26 oct 2026 — Viáticos en la planilla y domingo en el horario
- Cada empleado de una planilla en **borrador** tiene un campo **Viáticos ₡**: se anotan a mano y van **fuera de los cálculos de planilla** (no entran al bruto, ni a la CCSS, ni a la renta, ni a las provisiones). Solo se suman a lo que se le paga (neto), al archivo del Banco Popular y a la colilla.
- Los viáticos se guardan en la planilla: un recálculo no los pierde. Después de aprobar ya no se cambian.
- Contabilidad: nueva cuenta **5230 Viáticos**; al aprobar, el asiento carga los viáticos a esa cuenta y cuadra con el neto por pagar.
- La colilla muestra una línea «Viáticos (no afectos a cargas)» y el libro de salarios (Excel) trae su columna.
- **El horario por día ahora incluye el domingo** (lunes a domingo), también en «Horas de tienda». El **día sin horario es el día libre** de la persona (en comercio se paga, por eso 56 horas; en industria no). Quien tiene el domingo en su horario lo trabaja como un **día normal** de su semana (sin pago especial, y si falta es una ausencia); quien no lo tiene sigue con el domingo como descanso y trabajarlo se paga como día especial.

## 1.16.2 — 26 oct 2026 — Importar empleados: más claro de usar
- El selector de archivo tiene el mismo estilo que el de Asistencia (en vez del botón del navegador) y el botón «Importar desde Excel» lleva ícono.
- El panel se puede cerrar (X) y, al guardar, muestra la confirmación con «Importar otro archivo» y «Cerrar»; se limpia solo para la próxima vez.
- Quien está en el sistema pero no en el archivo se muestra **arriba** de la lista, con atajos «Marcar para eliminar a los N que se pueden» y «Dejar todos como están»; después de guardar, si alguno quedó sin decidir, el aviso trae «Decidir ahora».
- La lista de vista previa es más alta, para ver más filas sin desplazarse tanto.

## 1.16.1 — 26 oct 2026 — Departamento del empleado, separado del puesto
- Nuevo campo **«Departamento o lugar de trabajo»** (oficina central, bodega, acabado, una tienda…), distinto del **puesto** (gerente comercial, bodeguero…). Se llena en la ficha, en la importación desde Excel y sale en el informe «Empleados y salarios».
- La importación ya no pisa el puesto con el departamento.

## 1.16.0 — 26 oct 2026 — Importar empleados desde Excel y informe de salarios
- **Importar empleados desde Excel** (Planilla → Empleados → «Importar desde Excel»): se sube el archivo, se ve una **vista previa** (quién se crea, quién cambia y qué, qué está mal) y solo entonces se guarda. Reconoce a quien ya existe por cédula o por nombre; una celda vacía **nunca borra** lo que ya está; a los nuevos sin número de reloj se les pone uno provisional que se reemplaza al vincularlos con el archivo del reloj.
- **Quien está en el sistema y no en el archivo** se muestra aparte y no se toca si no se decide: **eliminar** (si no tiene nada registrado), **dar de baja** (cese, conserva el historial y quita el acceso) o, solo el **administrador del sistema**, **eliminar con todo su historial** (datos de prueba): borra su asistencia, sus líneas en planillas en borrador o anuladas y sus deudas (cerrando bien los asientos), y recalcula los totales de esas planillas. Si sale en una planilla aprobada o pagada no se borra hasta anularla. También hay un botón «Eliminar» en cada empleado (solo administrador del sistema). Todo queda en la bitácora.
- **Informe «Empleados y salarios»** (Planilla → Informes): salario pactado de cada empleado con su equivalente semanal y mensual, con Excel.
- Puestos de confianza y socios: se marcan como «Puesto de confianza» y no cuentan en las horas ni en las ausencias (regla de la 1.13.0).

## 1.15.0 — 26 oct 2026 — Estado de emisión de las facturas y preparación para emitir ante Hacienda
- **Estado de emisión** en Facturas, en el detalle y en el pedido, como en Alegra: **Emitida** (verde, Hacienda la aceptó), **En proceso** (gris), **Pendiente de envío** (ámbar) y **Rechazada** (rojo, con el motivo). Filtro por estado, resumen arriba y columna en el Excel.
- **Aviso al facturar:** dice con claridad si la factura quedó emitida o no (hoy: «todavía NO está emitida»), en vez de dar por hecho que crear = emitir.
- **Facturación electrónica** (nueva pantalla): datos del emisor, lista de lo que falta (llave y credenciales, CABYS, correo) y envío de pendientes.
- **Todo el camino hasta Hacienda está construido** y se activa con las llaves (`HACIENDA_MODO`): arma el XML v4.4, lo firma (XAdES) y lo envía; cada 10 minutos consulta si Hacienda aceptó o rechazó; al aceptar, entrega al cliente el XML y la respuesta por correo; una factura rechazada se corrige y se emite de nuevo con consecutivo nuevo. Hoy sigue sin conectar: nada se envía.
- **CABYS por producto** (Inventario → crear/editar) y CABYS predeterminado.
- «Para hacer hoy» avisa de facturas rechazadas y sin enviar.
- Guía de activación: `docs/FACTURACION_ELECTRONICA.md`. Pendiente antes de producción: nota de crédito electrónica.

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
