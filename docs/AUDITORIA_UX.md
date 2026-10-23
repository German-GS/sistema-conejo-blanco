# Auditoría de usabilidad (UI/UX) — Sistema Conejo Blanco

Fecha: 23 oct 2026 · Versión revisada: 1.10.1 · Alcance: vendedor (celular), panel de administración (escritorio y tablet), caja POS (laptop), temas claro y oscuro.

## 1. Resumen ejecutivo

El sistema tiene una base de diseño **sólida y poco común en software administrativo**: el flujo del vendedor en celular es claro y de objetivos grandes, las pantallas de planilla guían por pasos numerados, la caja POS está pensada para personal poco experto (botones grandes, avisos con acción, funciona sin internet) y el tema oscuro está bien resuelto.

Los problemas no están en las pantallas "estrella", sino en **lo transversal**, que es lo que más se nota cuando un sistema crece a 38 pantallas y 6 perfiles:

1. **Lenguaje con tres registros distintos** (vos, tú y usted) según la pantalla.
2. **Confirmaciones y feedback inconsistentes**: 24 diálogos nativos del navegador, sin avisos globales, sin estados de carga con forma.
3. **Riesgo de perder trabajo**: cierre de sesión por inactividad sin aviso previo y sin borradores en formularios largos.
4. **Accesibilidad**: etiquetas sin asociar, contraste insuficiente en el tema claro, objetivos táctiles pequeños.
5. **Navegación del panel** que depende de pasar el mouse y no ayuda a encontrar cosas (38 rutas, sin búsqueda).
6. **Rendimiento de arranque**: un solo paquete de 790 KB (227 KB comprimido) que descarga hasta el vendedor en datos móviles.

Calificación global (heurísticas de Nielsen, 1 a 5): **3,6 / 5**. El POS y el vendedor están en 4+; el panel de administración está en 3 por consistencia y navegación.

## 2. Método

- Recorrido manual como vendedor (375 px), administrador (1024 px, 1366 px, tablet 768 px) y caja (1366×768), en tema claro y oscuro.
- Medición automática en 20 pantallas del panel: contraste (WCAG AA con conversión real de color), tamaño de objetivos táctiles, controles sin nombre accesible, texto menor a 12 px, desbordes horizontales.
- Revisión de código: rutas, componentes compartidos, estilos, textos, estados de carga y de error.
- **No incluye** pruebas con usuarios reales ni lector de pantalla. Las conclusiones sobre comportamiento de personas son hipótesis a validar (ver sección 6).

## 3. Lo que funciona bien (conservar)

| Qué | Por qué importa |
|---|---|
| Flujo del vendedor en celular (inicio con un solo botón grande, «Nuevo pedido» en 4 pasos numerados) | Cero menús; adecuado para uso en la calle. Sin desborde horizontal. |
| Pantallas guiadas por pasos (Asistencia: «1. Importar… 2. Revisar días…») | Reduce errores en tareas complejas; el sistema dice qué hacer y por qué. |
| Caja POS: botones de 56 px, avisos con acción, «Cómo hacer una venta», todo funciona sin internet | Diseñada para quien se equivoca fácil. Hay un solo concepto por pantalla. |
| Mensajes de error y estados «sin internet» en lenguaje simple | Dicen qué pasó y qué hacer, sin jerga técnica. |
| Tema oscuro | 0 fallas de contraste en 3 de 5 pantallas medidas y casi ninguna en las otras dos (mejor que el claro). |
| Títulos de pestaña por zona, `lang="es"`, un solo `h1` por página, sin imágenes sin descripción | Buenas bases de accesibilidad y orientación. |
| Menú del panel filtrado por permisos | Cada perfil ve solo lo suyo; el menú y la ruta no se desalinean. |

## 4. Hallazgos priorizados

Prioridad: **A** = hacer pronto (alto impacto), **M** = siguiente ola, **B** = pulido. Esfuerzo: S pequeño (horas), M medio (1–2 días), L grande.

### A1 · Pérdida de trabajo por inactividad y falta de borradores — Impacto alto · Esfuerzo M
- La sesión se cierra a los 10 minutos sin actividad **sin ningún aviso previo** (`lib/inactividad.js`), y los formularios largos (factura nueva, asientos manuales, asistencia, planilla) **no guardan borrador**.
- Escenario real: la persona se distrae con una llamada, vuelve y todo lo escrito se perdió.
- Recomendación: (1) aviso a los 60 s antes («¿Sigue ahí? Se cerrará su sesión en 60 s» con botón «Seguir»); (2) borrador automático en el navegador para formularios largos, con «Recuperar lo que estaba escribiendo» al volver; (3) al vencer, volver a la misma pantalla tras entrar de nuevo (ya se conserva el `redirect`).

### A2 · Tres registros de lenguaje — Impacto alto · Esfuerzo S
- Vos: «Ingresá», «Podés descontar», «Subí el archivo», «Volvé» (≈41 textos en 15 archivos). Tú: «Todavía no has hecho ningún pedido». Usted: toda la caja POS («Escriba», «Toque»).
- En un sistema empresarial que además usa personal de distintos perfiles, mezclar registros se percibe como falta de cuidado y confunde.
- Recomendación: **usted en todo el sistema** (norma en software comercial en Costa Rica y ya es el de la caja). Es una revisión de textos sin riesgo; conviene dejar una guía de estilo de una página (tono, tratamiento, mayúsculas, formato de fechas y colones).

### A3 · Confirmaciones nativas y acciones destructivas poco protegidas — Impacto alto · Esfuerzo M
- 24 usos de `window.confirm` en 12 archivos (desactivar accesos, reabrir año fiscal, eliminar producto, anular ventas…): ventana del navegador, sin identidad visual y sin poder explicar las consecuencias con formato; además es bloqueante y se ve distinto en cada navegador.
- «Eliminar» y «Anular» son enlaces de texto de 20 px de alto **al lado de las acciones frecuentes** (Inventario: «Historial · Fotos · Editar · + Agregar color · Eliminar»; Pedidos: precio · «Bodega» · «Anular»).
- Recomendación: componente único de confirmación (modal) con: qué se hace, qué consecuencias tiene, botón destructivo en rojo con el nombre de la acción («Sí, anular el pedido #18») y, para lo irreversible, escribir una palabra. Mover «Eliminar/Anular» a un menú «⋯» o a una zona separada del detalle. Ofrecer **deshacer** donde sea reversible.

### A4 · Accesibilidad de formularios y contraste — Impacto alto · Esfuerzo M
- **Etiquetas sin asociar** al campo (Factura nueva: 14 controles; Configuración, Sistema, Planillas: varios): al tocar la etiqueta no se enfoca el campo y un lector de pantalla no sabe qué es.
- **Contraste (tema claro)**: el texto secundario en `slate-400` (50 usos) da 2,6:1 (mínimo AA: 4,5:1): «costo», números de asiento (#101…), «se asigna al emitir», importes secundarios; las pestañas inactivas dan 3,5:1. El libro diario tiene 38 textos con este problema. El tema oscuro sí cumple.
- **Texto pequeño**: 357 usos de `text-xs`; en tablas y chips se lee mal en pantallas de laptop con brillo bajo.
- **Foco visible**: los campos usan `outline-none` y solo cambian el color del borde (gris → azul, poco contraste); conviene un anillo de foco claro y consistente para teclado.
- Recomendación: subir el texto secundario a `slate-500/600`; piso de 13–14 px para texto informativo; asociar etiquetas con un componente `Campo` (etiqueta + ayuda + error) que genere `id/for` y `aria-describedby`; anillo de foco global.

### A5 · Arranque lento por un solo paquete — Impacto medio-alto · Esfuerzo S
- 790 KB (227 KB comprimido) en un único archivo; **ninguna ruta se carga bajo demanda**. El vendedor, que solo usa 3 pantallas y trabaja con datos móviles, descarga también contabilidad, planilla, análisis, etc.
- Recomendación: carga por ruta (`() => import(...)`) y separar por zonas (vendedor / panel / caja). Se espera bajar más de la mitad el arranque del vendedor. Es un cambio mecánico en el router.

### A6 · Archivos subidos que pueden perderse — Impacto medio-alto · Esfuerzo M · **Verificar en producción**
- En la factura nueva el logo aparece como imagen rota con el texto «Logo» en desarrollo. En producción las fotos de producto y el logo se guardan en disco de Cloud Run, que se **borra con cada despliegue** (ya anotado como pendiente en la guía de despliegue).
- Recomendación: moverlos a almacenamiento persistente (Cloud Storage). Hasta entonces, mostrar un marcador elegante (iniciales o ícono) en vez de la imagen rota.

### M1 · Navegación del panel — Impacto medio · Esfuerzo M
- Barra lateral **de solo íconos** (≈20) que se expande al pasar el mouse: en pantallas táctiles o con el mouse en otro lado no se sabe qué es cada ícono. Dos ítems comparten el mismo ícono (Reportes de contabilidad e Informes de planilla).
- 38 rutas y **no hay búsqueda ni atajo** para llegar a una pantalla; no hay migas de pan en pantallas profundas.
- Nombres que se parecen: «Sistema», «Configuración», «Accesos»; «Verificar cálculos» (contabilidad) vs «Salud de la empresa» (sistema); «Ventas y cajas de tienda» vs «Abrir caja (POS)» con 9 pestañas dentro.
- Recomendación: menú expandido por defecto desde 1280 px (con opción de colapsar); **búsqueda global tipo Cmd/Ctrl+K** («facturas», «planilla», «Pedro Pérez»); nombres más descriptivos y un ícono propio por sección; migas de pan en detalles.

### M2 · «Bandeja de pendientes» para tareas de gerencia — Impacto alto · Esfuerzo M
- Lo que requiere acción hoy está disperso: pedidos de tiendas por revisar (tarjeta en el inicio), planillas por aprobar, facturas por vencer, asistencia con problemas, alertas de inventario, envíos rechazados, sincronizaciones fallidas.
- Recomendación: un bloque «Para hacer hoy» en el inicio de cada perfil, ordenado por urgencia, con un clic a la pantalla correcta y con contador en el menú. Es donde más se nota que el sistema "trabaja para la persona".

### M3 · Feedback del sistema — Impacto medio · Esfuerzo M
- No hay avisos globales (toasts): cada pantalla muestra su mensaje en un lugar distinto y algunos desaparecen o se pierden fuera de vista tras guardar en pantallas largas.
- Estados de carga solo con el texto «Cargando…» (28 sitios, 0 esqueletos); sensación de lentitud en listas largas.
- Botones principales **deshabilitados sin explicación** (p. ej. «Guardar pedido» con contraste 1,5:1): la persona no sabe qué le falta.
- Recomendación: sistema de avisos (éxito con «Deshacer», error con «Reintentar»); esqueletos en listas y tablas; en lugar de deshabilitar, dejar el botón activo y mostrar bajo él «Falta: cliente y al menos un producto» (o validar al intentar).

### M4 · Tablas, filtros y listas largas — Impacto medio · Esfuerzo M
- 33 tablas; en 1024 px **Pedidos** se desborda horizontalmente (el rango de fechas queda cortado).
- Listas sin paginación visible (p. ej. hasta 300 ventas) y sin encabezados fijos; filtros no se recuerdan al volver.
- Recomendación: filtros que envuelven en varias líneas; encabezado fijo; paginación o «cargar más»; recordar filtros por pantalla; vistas guardadas («Pedidos de crédito pendientes»).

### M5 · Objetivos táctiles pequeños — Impacto medio · Esfuerzo S
- Acciones de texto de 20–28 px de alto (Historial, Editar, Eliminar, Anular, «Bodega», «Activo», chips de rango de 26 px). Para tablet y dedo se recomiendan 40–44 px.
- Recomendación: botones de icono con relleno táctil de 40 px y etiqueta accesible; en tablets, acciones en una fila de botones, no enlaces.

### M6 · Escala visual y componentes — Impacto medio · Esfuerzo L
- Conviven dos escalas: la «grande» del POS y del vendedor (botones de 56 px) y la «compacta» del panel; dentro del panel hay botones primarios de 56 px en pantallas densas. No hay documentación de componentes (botón, campo, chip, tarjeta, modal, aviso).
- Recomendación: una **mini guía de diseño** (tokens de color, texto, espacio y radios; 8–10 componentes con variantes y estados) y un componente `Campo`, `Boton`, `Modal`, `Aviso` compartidos. Se puede ir adoptando pantalla por pantalla.

### B1 · Pulido
- Aplicación instalable (manifiesto) con un solo ícono sin tamaños 192/512 y con inicio fijo en la caja: conviene íconos completos y que el vendedor también la pueda instalar.
- Respetar «reducir movimiento» (0 usos de `prefers-reduced-motion`) y evitar animaciones que escalan al tocar en pantallas con mucho texto.
- Placeholders cortados en celular («Buscar por nombre, cédula, teléfo…»): acortar el texto.
- Caja: la misma acción «Abrir caja» aparece tres veces a la vez (botón superior, aviso y botón del total); está bien para su público, pero se puede dejar una sola acción destacada y las otras como ayuda.
- Para el administrador del sistema, la barra superior suma selector de vista, interruptor de tema, usuario y salir: considerar agrupar en un menú de cuenta.
- Mensajes de «sin internet» y respaldos están muy bien; falta un indicador permanente y discreto de estado de conexión en el vendedor.

## 5. Estado de la ola 1 (aplicada en la versión 1.11.0)

- **Lenguaje:** todo el sistema (pantallas y mensajes del servidor) pasó a «usted».
- **Arranque:** carga por pantalla; el paquete de entrada bajó de 227 KB a 98 KB comprimido (−57 %). Quedan en el paquete inicial la entrada, el cambio de clave y la caja POS porque deben abrir sin internet (verificado: la caja y la pantalla de entrada recargan con el servidor apagado).
- **Indicador de carga con red de seguridad:** barra fina arriba mientras algo espera respuesta; anillo giratorio en las listas; si tarda más de 8 s aparece «Está tardando más de lo normal…» con botón para recargar o reintentar, y a los 25 s un aviso de posible problema de conexión. Lo que corre en segundo plano (envío de la caja, métricas) no lo activa. Si una pestaña vieja pide un archivo que ya no existe tras una actualización, se recarga sola una vez.
- **Contraste y lectura:** texto secundario más oscuro en el tema claro (el libro diario pasó de 38 textos con poco contraste a 2), texto pequeño de 12 a 13 px, anillo de foco visible para teclado.
- **Pantallas táctiles:** en tablets y celulares los botones de texto de tablas y listas miden al menos 40 px de alto.
- **Detalles:** placeholders recortados del vendedor acortados; filtros de Pedidos ya no se desbordan a 1024 px.

## 5b. Estado de la ola 2 (protección, aplicada en el código; versión 1.11.0 junto con la ola 1)

- **Aviso antes de cerrar la sesión por inactividad:** 60 segundos antes aparece «¿Sigue ahí?» con cuenta regresiva y el botón «Seguir trabajando». Mover el mouse no lo cierra (hay que tocar el botón); al llegar a cero se cierra la sesión como antes. El encargado de tienda sigue exento.
- **Borradores automáticos** en los formularios largos: Nueva factura, Nuevo pedido del vendedor, Asiento manual del libro diario y Nuevo pago. Se guardan en el navegador por persona (7 días); al volver se ofrece «Recuperar» o «Descartar», y se borran solos al guardar bien.
- **Confirmaciones propias** en lugar de las ventanas del navegador (24 sitios): explican qué pasa, el botón lleva el nombre de la acción («Sí, anular»), el foco empieza en «Cancelar» y lo irreversible pide **escribir una palabra** (ELIMINAR, CONVERTIR o REABRIR): eliminar productos y clientes, convertir ventas y pedidos en prueba, reabrir el año fiscal.
- **Avisos globales** (esquina inferior): éxito en verde, error en rojo y botón de acción opcional. Reemplazan los mensajes sueltos al guardar en configuración de la tienda, datos de la tienda, productos de tienda, parámetros y asistencia de planilla, horas de tienda y exportaciones; y dan respuesta a las acciones de Accesos (activar, desactivar, restablecer, desbloquear, cerrar sesiones), que antes no decían nada.
- **Botones deshabilitados que explican por qué:** «Guardar pedido» muestra «Falta: el cliente, la vía de entrega, al menos un producto» y el motivo de «Emitir» factura se ve más grande; los botones deshabilitados tienen mejor contraste.

Pendiente de esta ola: mover «Eliminar» y «Anular» a una zona separada en las listas (se protegieron con la confirmación, pero siguen junto a las acciones frecuentes) y la opción «Deshacer» en acciones reversibles (requiere soporte en el servidor).

## 6. Plan sugerido por olas

| Ola | Contenido | Esfuerzo | Efecto esperado |
|---|---|---|---|
| **1 · Rápidas** | A2 lenguaje unificado a «usted»; A5 carga por ruta; M5 objetivos táctiles; subir contraste del texto secundario; placeholders; anillo de foco | 1–2 días | Mejor arranque, lectura más fácil, tono profesional. Sin riesgo funcional. |
| **2 · Protección** | A1 aviso de inactividad y borradores; A3 confirmaciones propias y zona de acciones destructivas; M3 avisos globales y mensajes de botón deshabilitado | 3–4 días | Menos errores y menos trabajo perdido. |
| **3 · Estructura** | A4 componente `Campo` accesible; M1 búsqueda global y menú más claro; M4 tablas y filtros; M2 bandeja de pendientes | 1–2 semanas | El sistema se siente más rápido de usar a medida que crece. |
| **4 · Base** | M6 guía de diseño y componentes; A6 almacenamiento persistente; pruebas con usuarios | continuo | Consistencia a largo plazo. |

## 7. Cómo validarlo con usuarios (recomendado antes de la ola 3)

- 5 personas por perfil (vendedor, gerencia, encargado de tienda, contador) × 3 tareas típicas cada una, en su propio equipo. Con 5 personas por perfil se detecta alrededor del 80 % de los problemas.
- Tareas de ejemplo: *vendedor*: hacer un pedido a crédito para un cliente nuevo; *gerencia*: encontrar qué pedidos de tienda faltan por revisar y aprobar uno; *encargado*: abrir caja, vender dos productos con pago dividido, contar inventario sin internet; *contador*: registrar un asiento manual y cerrar un mes.
- Medir: tasa de éxito, tiempo, errores y una pregunta de satisfacción (SUS de 10 preguntas). Repetir tras cada ola.
- Instrumentar eventos simples (pantallas más visitadas, búsquedas sin resultado, errores de validación) para decidir con datos qué simplificar.

## 8. Limitaciones

Medición de contraste y objetivos hecha sobre datos de desarrollo y el navegador del equipo de trabajo; no se probó con lector de pantalla, con teclado exclusivo de punta a punta ni en dispositivos reales distintos. Algunos conteos (por ejemplo, textos en voseo) son aproximados por búsqueda en el código.
