# Marca de asistencia desde el celular con geolocalización — investigación y propuesta

Estado: **solo investigación, nada construido**. Fecha: 26-oct-2026.

## Qué se quiere
Que cada empleado marque entrada y salida desde una interfaz del sistema (en su celular) y que la marca solo valga si está en el **punto de reunión** (o la fábrica/tienda), usando su ubicación.

## Por qué encaja bien con lo que ya tenemos
- Hoy hay **un solo aparato de reloj** y la regla de oro de la 1.14.0 es que solo se rebaja tiempo **verificado**. Una marca por celular es una **segunda fuente verificable** que reduce los olvidos (días «Marca faltante») y las discusiones.
- Sirve para quienes **no pasan por el reloj**: gente en ruta, entregas, personal de tienda (hoy se digita a mano en «Horas de tienda»).
- El sistema ya es una PWA (instalable, funciona con mala señal) y ya tiene la tubería de asistencia: las marcas del celular entrarían como cualquier otra marca del día y pasarían por las mismas reglas (tolerancia ±10, almuerzo fijo, estimación, «Resolver», bitácora).

## Cómo funcionaría (flujo del empleado)
1. Abre el sistema desde el ícono del celular (ya con la sesión iniciada) y ve **un solo botón grande: «Marcar»**.
2. El navegador pide la ubicación (una vez, con aviso claro de para qué se usa).
3. El servidor compara la ubicación con los **puntos de marca** (lista de lugares con coordenadas y radio, ej. 100 m) y decide:
   - **Dentro del punto y con buena precisión** → la marca queda **verificada** y se muestra «Marca registrada 7:58 en Fábrica».
   - **Fuera del radio, o con precisión mala, o sin permiso de ubicación** → la marca **se guarda igual** (no se pierde), pero queda **«sin verificar»** y cae en «Resolver» para que el supervisor la confirme (la confirmación del supervisor ya existe).
4. La hora la pone **el servidor**, nunca el celular.

## Lo que hay que saber de la tecnología
- La ubicación del navegador (API de Geolocalización) exige HTTPS (ya lo tenemos), pide permiso y devuelve la **precisión en metros**. En interiores o con GPS flojo puede errar decenas de metros: el radio no debe ser menor a ~50–100 m y hay que **rechazar lecturas con precisión mala** (ej. > 100 m) pidiendo reintentar.
- **Se puede falsificar.** Existen apps que fingen la ubicación, y una página web no puede detectarlo con certeza. Lo que sí se hace es sumar señales y puntuar el riesgo, sin rechazar por una sola: zona horaria vs. ubicación, IP, **viaje imposible** entre dos marcas, dispositivo distinto al habitual, precisión «perfecta» sospechosa. (Las plataformas grandes hacen justamente eso: combinan varias señales en vez de confiar en una coordenada.)
- Un sistema nativo (app de tienda) detecta mejor la ubicación falsa, pero cuesta mucho más mantener; no se justifica para una empresa de este tamaño.

## Opciones de verificación (de menos a más fuerte)
| Opción | Qué prueba | Costo/fricción | Comentario |
|---|---|---|---|
| A. Solo ubicación | Que el celular dice estar ahí | Muy bajo | Base. Falsificable. |
| B. A + **dispositivo registrado** | Que es el celular de esa persona | Bajo | Evita que un compañero marque por otro. |
| C. A + **código QR que cambia** cada ~30 s en una pantalla/tablet en el punto | Presencia física real, sin depender del GPS | Medio (una tablet fija) | **La mejor relación seguridad/costo**: no se puede marcar desde la casa. |
| D. A + **selfie** al marcar | Que es la persona | Medio (almacenar fotos = dato sensible) | Útil si hay sospecha de suplantación. |
| E. Quiosco con huella/rostro | Identidad biométrica | Alto | Es lo que ya hace el reloj. |

**Recomendación:** empezar con **A + B** (ubicación + dispositivo registrado), y agregar **C (QR rotativo)** en los puntos donde haya abusos o dudas. Dejar D y E para después.

## Piezas a construir (por fases)
**Fase 1 — marcar con ubicación**
- Rol/acceso de **empleado** con una sola pantalla («Marcar» + mis marcas de hoy y de la semana). Vincular `Usuario` ↔ `Empleado` (hoy no están ligados).
- Tabla **PuntoMarca**: nombre, latitud, longitud, radio en metros, activo. Pantalla de administración (con mapa o coordenadas).
- Tabla **MarcaApp**: empleado, instante (hora del servidor), latitud, longitud, precisión, punto detectado, distancia, `verificada`, motivo si no, dispositivo, IP, origen.
- Servicio que convierte las `MarcaApp` en marcas del día (`DiaAsistencia.marcas`) y las mezcla con las del reloj; las no verificadas quedan para «Resolver».
- Regla de alternancia entrada/salida y bloqueo de doble marca (ya existe: 2 min).
- Vista del supervisor: marcas del día con ubicación y distancia; filtro «fuera de zona».

**Fase 2 — más seguridad y comodidad**
- Registro de dispositivo (B), QR rotativo (C), marca **sin conexión** (se guarda en el celular y se envía al volver la señal; queda «sin verificar» porque la hora del celular no es de fiar).
- Alertas: marcas fuera de zona repetidas, viaje imposible, mismo celular para dos empleados.

## Lo legal y lo humano (revisar con abogado laboral)
- La ubicación es **dato personal** (Ley 8968, PRODHAB): requiere **consentimiento informado y expreso**, finalidad clara (control de asistencia) y conservar solo lo necesario. Las fuentes consultadas son sobre todo comerciales: confirmar con el texto oficial y con un abogado.
- **Diseño respetuoso:** la ubicación se lee **solo en el instante de marcar**, nunca en segundo plano ni «rastreo». Guardar las coordenadas el tiempo justo y mostrar al empleado lo que se guardó.
- Es un cambio de política de la empresa: comunicarlo, y definir qué pasa cuando alguien no tiene celular/datos/permiso (alternativa: reloj o confirmación del supervisor), para que nadie sea sancionado por un problema técnico. Debe quedar en el reglamento interno.
- Los **puestos de confianza** siguen sin marca (regla de la 1.13.0).

## Preguntas abiertas para decidir
1. ¿Qué es el «punto de reunión»? ¿Un lugar fijo (la fábrica, un estacionamiento) o varios (según la ruta del día)? Define si bastan puntos fijos o si cada ruta lleva el suyo.
2. ¿Todos los empleados tienen celular con datos? ¿Marcarían con el suyo o con uno de la empresa?
3. ¿Reemplaza al reloj de huella o convive con él? (Recomendado: conviven un tiempo; la marca del celular confirma, no descarta.)
4. ¿Cuánto abuso esperan? Eso decide si basta A+B o conviene el QR rotativo desde el inicio.
5. ¿Se necesita saber dónde están durante la jornada (rastreo)? **No recomendado**: es más intrusivo y legalmente más delicado; esta propuesta es solo marcar.

## Estimación gruesa
Fase 1: la pieza más grande es unir empleados con usuarios y la mezcla con las marcas del reloj; el resto es sencillo. Fase 2 depende de qué verificación elijan.
