# Guía de diseño — Sistema Conejo Blanco

Reglas cortas para que todas las pantallas se sientan del mismo sistema. La versión visual y viva está en el panel: **Guía de diseño** (solo administrador del sistema). Si algo cambia aquí, cámbielo también ahí.

## 1. Principios

1. **Quien usa el sistema no debería pensar.** Cada pantalla dice qué hacer primero y qué pasa al terminar.
2. **Nunca perder trabajo.** Borradores en formularios largos, aviso antes de cerrar la sesión, la caja guarda todo aunque no haya internet.
3. **Lo peligroso es difícil de hacer por error.** Confirmación con el nombre de la acción y, si no hay vuelta atrás, escribir una palabra.
4. **Todo estado se ve:** cargando, vacío, error (con salida) y éxito (con aviso).
5. **Accesible desde el origen:** etiquetas, contraste, teclado y botones de tamaño cómodo.

## 2. Tono y escritura

- **De «usted»**, siempre (pantallas, avisos y mensajes del servidor). Sin voseo ni tuteo.
- Frases cortas, verbos concretos: «Guardar pedido», «Sí, anular la orden». Evitar «Aceptar/Cancelar» sueltos.
- Los errores dicen **qué pasó y qué hacer**: «No se pudo guardar. Revise su conexión e intente de nuevo.»
- Colones: `₡1 234,50`. Fechas: `22/10/2026`. Horas de 24 h. Hora de Costa Rica.
- Sin jerga técnica (nada de «500», «token», «payload») frente a la gente.

## 3. Color y significado

| Uso | Clase | Nota |
|---|---|---|
| Acción principal | `bg-blue-600 text-white` | Un solo principal por pantalla o ventana |
| Éxito | `bg-green-700 text-white` | Avisos de «guardado», «listo» |
| Atención | `bg-amber-500 text-slate-900` | Hay algo por hacer o revisar |
| Peligro / error | `bg-red-700 text-white` | Acciones destructivas y fallos |
| Texto principal | `text-slate-900` | |
| Texto secundario | `text-slate-500` (mínimo) | Contraste ≥ 4,5:1; nunca `slate-400` para texto |
| Borde | `border-slate-300` | |

El color **nunca es lo único** que informa: va con texto o ícono. Los avisos de color usan fondos sólidos para leerse igual en el tema claro y el oscuro (no `*-50` con texto `*-900`).

## 4. Tipografía

Título de pantalla 20 px negrita · título de tarjeta 16 px seminegrita · texto 14 px · ayuda 14 px gris · texto pequeño 13 px (solo datos de apoyo, nunca instrucciones). El tamaño mínimo `text-xs` es 13 px.

## 5. Componentes (carpeta `app/src/components`)

| Componente | Cuándo |
|---|---|
| `Campo` | Todo campo de formulario nuevo (etiqueta, ayuda y error enlazados). Los existentes se corrigen solos con `lib/accesibilidad.js`. |
| `CampoClave` | Contraseñas (con ojito). |
| `Cargando` | Cualquier espera de una lista o sección. Ofrece reintentar a los 8 s. |
| `AvisosGlobales` (`exito`, `fallo`, `informar` de `lib/avisos.js`) | Resultado de una acción: guardado, error, información breve. |
| `ConfirmarDialogo` (`confirmar` de `lib/confirmar.js`) | Antes de lo que no se puede deshacer o afecta a otros. Con `palabra` para lo irreversible. |
| `BorradorAviso` + `usarBorrador` | Formularios largos: recuperar lo escrito. |
| `VistasGuardadas` | Listas con filtros que se repiten. |
| `MostrarMas` + `usarLimite` | Listas largas (50 por vez). |
| `ImagenConRespaldo` | Cualquier imagen subida (logo, fotos): marcador si no carga. |
| `PaletaBusqueda` | Búsqueda rápida (Ctrl/Cmd + K); las secciones viven en `lib/navegacion.js`. |
| `BandejaPendientes` | «Para hacer hoy» del inicio. |

Clases globales en `index.css`: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input`, `.label`, `.card`, `.tabla-fija` (encabezado fijo), `.cargando-anillo`.

## 6. Reglas por situación

- **Botón deshabilitado:** siempre con el motivo visible («Falta: …»).
- **Eliminar / anular:** en zona separada (a la derecha, con borde rojo), nunca como enlace pegado a «Editar». Confirmación con el nombre de la acción.
- **Formularios largos** (factura, pedido, asiento, pago): `usarBorrador`.
- **Listas:** filtros recordados (`recordarFiltros`), 50 filas con «Mostrar más», tablas largas con `.tabla-fija`.
- **Imágenes:** `ImagenConRespaldo`; los logos de documentos en modo `silencioso`.
- **Tema oscuro:** probar siempre en ambos; usar las clases de color del sistema (no hexadecimales sueltos).
- **Sin internet:** la caja y el login del encargado deben seguir funcionando; el vendedor ve un aviso claro de «Sin conexión».

## 7. Lista de comprobación antes de entregar una pantalla

- [ ] Se entiende sola y funciona en 375 px, 768 px y 1366 px sin desplazarse de lado.
- [ ] Todos los campos tienen etiqueta; los botones de solo ícono tienen nombre accesible.
- [ ] Contraste ≥ 4,5:1 en ambos temas; objetivos táctiles ≥ 40 px.
- [ ] Estados: cargando, vacío, error, éxito.
- [ ] Lo irreversible pide confirmación; lo largo guarda borrador.
- [ ] Textos de «usted», sin jerga.
- [ ] Se recorrió con teclado (Tab, Enter, Esc) y el foco se ve.
