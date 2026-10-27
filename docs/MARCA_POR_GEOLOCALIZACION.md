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

## Decisiones y respuestas (26-oct-2026)
- **Punto de reunión:** siempre la empresa. Excepción: el personal de **tienda**, cuyo punto es su tienda (un punto de marca por tienda).
- **Vendedores en ruta:** no están en un punto fijo (tampoco a la hora de almuerzo); la empresa quiere validar sus rutas por GPS. Es otro caso que el de marcar: ver abajo.
  - Recomendado: **visitas con llegada** («Llegué donde el cliente X», con ubicación) en vez de rastreo continuo. Valida la ruta, es mucho menos intrusivo y se liga a clientes y pedidos que ya existen.
  - El rastreo continuo en segundo plano **no es confiable desde una página web** (el celular lo detiene al bloquear la pantalla, sobre todo iPhone); exigiría una app nativa. Si se quiere, que sea solo mientras la «jornada de ruta» esté activa (botón de iniciar/terminar visible para el vendedor), con aviso y consentimiento escritos, y revisión legal.
  - Los clientes hoy no tienen coordenadas: se guardarían la primera vez que se visitan.
- **Tablet con reconocimiento facial:** no sirve cualquier tablet ni es la única vía; ver la respuesta en la conversación (terminal comercial vs. desarrollo propio vs. foto de evidencia sin reconocimiento).

## Decisiones (26-oct-2026, segunda ronda)
- **No se compra un reloj marcador nuevo:** todo por software. Queda descartada la opción «terminal comercial».
- **Los vendedores usan su propio celular** (BYOD): rastreo solo con la jornada de ruta activa, con consentimiento escrito y revisión legal; ojo con batería y plan de datos (definir si la empresa compensa).
- **Apps nativas: no se descartan.** Se pueden hacer envolviendo el sistema actual con Capacitor (misma interfaz Vue, más acceso al teléfono), sin reescribir.

## Plan por etapas (todo por software)
1. **Etapa 1 — PWA (sin tienda de apps):** marcar con ubicación + dispositivo registrado; punto de marca de la empresa y de cada tienda; visitas con llegada para vendedores; mezcla con las marcas del reloj actual (que sigue funcionando mientras tanto).
2. **Etapa 2 — Seguridad:** código QR rotativo en una tablet fija (cualquier tablet decente en modo quiosco) + selfie de evidencia (sin reconocimiento automático).
3. **Etapa 3 — App nativa (Capacitor) para vendedores:** ubicación en segundo plano durante la jornada de ruta, detección de ubicación simulada en Android, avisos (notificaciones), marca sin conexión más confiable. Android se puede instalar directo (APK); iPhone requiere cuenta de desarrollador de Apple y TestFlight/App Store.
4. **Etapa 4 — Reconocimiento facial por software (opcional):** comparar la selfie con la foto registrada del empleado, con prueba de vida. Es lo más difícil de hacer bien (suplantación con fotos o video) y suele cobrarse por uso si se contrata en la nube: evaluar solo si la selfie de evidencia no basta. Datos biométricos: revisar con abogado antes.

## Esquema propuesto (26-oct-2026, tercera ronda)
Tres grupos, cuatro marcas con tipo explícito cada día: **entrada · salida a almuerzo · regreso de almuerzo · salida**.

| Grupo | Cómo marca | Verificación |
|---|---|---|
| **Fábrica** (y administrativos en la empresa) | Escanea el QR de la pantalla de la empresa, las 4 veces | QR que cambia + ubicación dentro de la empresa |
| **Vendedores de ruta** | Entrada y salida de jornada con el QR en la empresa. Durante el día, rastreo; almuerzo (salida/regreso) marcado en ruta con ubicación | QR en la empresa; en ruta, ubicación (rastreo solo en jornada activa y en pausa durante el almuerzo) |
| **Personal de tienda** | App web con geolocalización, las 4 marcas | Ubicación dentro de la tienda (opcional: QR en la pantalla del POS) |

### Ajustes recomendados al esquema
1. **El QR no necesita durar 15 minutos.** Lo muestra una pantalla, así que puede cambiar cada 30–60 s sin costo. Con 15 min, alguien podría fotografiarlo y mandarlo a un compañero que marque desde afuera. Además del QR se valida la **ubicación** (en la empresa) y el **celular registrado**: el QR prueba que hay un código vigente, la ubicación prueba dónde, el celular prueba quién.
2. **Pantalla de marca:** una página del sistema en pantalla completa («Pantalla del punto») que se abre en cualquier tablet o monitor; no hace falta hardware especial. El empleado puede escanear con la cámara del celular (abre el sistema ya con su sesión) y no necesita escáner dentro de la app.
3. **Almuerzo:** hoy el sistema descuenta un **bloque fijo** e ignora las marcas del medio (1.14.0). Con marcas de almuerzo explícitas y con tipo ya no hay ambigüedad, así que hay que elegir: (a) seguir con bloque fijo y usar las marcas solo para detectar almuerzos muy largos, o (b) descontar el almuerzo real marcado para quienes usan la app (requiere ajuste por empleado, hoy el parámetro es global).
4. **Rastreo de vendedores de ruta:** el rastreo continuo exige la **app nativa** (Capacitor); desde la página web se corta al bloquear la pantalla. Es la única pieza del plan que no se puede resolver solo con la web.
5. **Si falla algo** (sin internet en la empresa, pantalla apagada, celular sin batería): la marca se guarda como «sin verificar» y el supervisor la confirma, como ya funciona con el reloj; nadie pierde pago por una falla técnica.

## Regla del almuerzo (26-oct-2026, la define la empresa)
- El almuerzo es **1 hora fija y no se paga**. Algún empleado tiene una excepción (otra duración) y se configura en su ficha.
- Con marcas de almuerzo (reloj o app): si el almuerzo real es de **30 minutos o más → se descuenta la hora fija**. Si es de **menos de 30 minutos → queda en «Resolver» para gerencia**, que decide (por ejemplo, si le pidieron trabajar de más): descontar la hora fija o descontar el almuerzo real.
- **Vendedores de ruta:** no marcan almuerzo (están en la calle); siempre se descuenta 1 hora. En la app solo marcan entrada y salida de jornada (QR en la empresa); el GPS sirve para validar la ruta, no para el almuerzo.
- Aplica igual a las marcas del reloj actual, no depende de la app.
- **Almuerzo de más de 1 hora:** con una tolerancia de 10 minutos después de la hora, se considera **llegada tarde del almuerzo** (igual que una entrada tarde): 70 min o menos = sin consecuencia; más de eso, el exceso cuenta como tiempo no trabajado y se rebaja (ej. 90 min → 30 de más). Pendiente: la empresa lo está consultando (reglamento / abogado laboral); **no implementar hasta confirmar**.
- Hoy (1.14.0) con 4 marcas el sistema descuenta siempre la hora fija sin mirar cuánto duró el almuerzo marcado: un almuerzo de 10 minutos pasa sin que nadie lo revise.

## Decisión final sobre el almuerzo (26-oct-2026)
La empresa decidió **no rebajar** nada por un almuerzo corto o largo: el almuerzo siempre se descuenta como la hora fija. Los casos fuera de lo normal (menos de 30 min, o más de la hora + 10 min) se **anotan como anomalías del empleado** para decidir si se hace una carta de amonestación. Reemplaza lo escrito antes sobre «Resolver» y «tardanza del almuerzo».

## Identidad del empleado: celular + PIN (1.19.0, 27-oct-2026)
Decisión de la empresa: **un PIN por empleado y un solo celular registrado; solo el administrador del sistema puede reiniciar**.

**Cómo está hecho**
- Sin cuenta de usuario: el empleado no entra al sistema, solo a `/marcar`. Así una marca nunca abre acceso al resto de los datos.
- **Activación:** el administrador genera un código de un solo uso (10 caracteres, 24 h; se guarda solo su huella). El empleado lo escribe en su celular (o escanea el QR) y elige su PIN de 6 números (el servidor solo guarda el hash; el administrador nunca lo ve).
- **Celular como llave:** el celular crea un par de llaves ECDSA P-256 con WebCrypto; la privada se guarda en IndexedDB **como no exportable** y al servidor solo va la pública. Cada acción se firma sobre un **reto de un solo uso de 60 s** (HMAC del servidor, sin estado; el último reto usado se quema de forma atómica para que no se repita).
- **PIN + firma en cada marca.** 5 fallos → bloqueo de 15 min. Cambiar de celular = código nuevo, que borra celular y PIN anteriores (`marca_acceso_codigo` en la bitácora).
- Código: `backend/src/planilla/acceso-marca*.ts`, `app/src/lib/dispositivoMarca.js`, `app/src/views/MarcarPage.vue`.

**Límites honestos (hay que decírselos a la empresa)**
- En la web **no existe un identificador único e inamovible del aparato**. La llave no exportable es lo más fuerte que permite el navegador: no se puede copiar a otro celular, pero **si el empleado borra los datos del navegador, o iPhone limpia el almacenamiento de una página que no se usa en 7 días, la llave se pierde** y hay que dar un código nuevo. Mitigación: pedir que **instalen el sistema en la pantalla de inicio** (PWA instalada no se limpia así) y la app nativa de la etapa 3 resuelve esto del todo.
- Un empleado puede **prestar su celular y su PIN**: eso ningún sistema lo evita; por eso la etapa siguiente suma el QR rotativo en la empresa + ubicación (+ selfie si hay abusos).


## Pantalla del punto y marcar con QR (1.19.0, 27-oct-2026)
**Hecho**
- **Puntos de marca** (`planilla_puntos_marca`): nombre, tipo (empresa/tienda), coordenadas, radio (100 m por defecto), si exige QR. Solo el administrador del sistema los administra.
- **Pantalla (`/punto`)**: tablet/monitor autorizado con un enlace de un solo uso (token; solo se guarda su huella; generar otro deja sin servicio al anterior). Pide el QR vigente al servidor y lo muestra en pantalla completa; no recibe el secreto del punto, solo el código de ese momento. Pantalla encendida con *Wake Lock* cuando el navegador lo permite; sin conexión oculta el QR vencido.
- **QR**: `HMAC(secreto del punto, punto|ventana de 30 s)`; se acepta la ventana actual y la anterior (30–60 s de margen para escribir el PIN). La URL del QR es `/marcar?p=<punto>&k=<código>`: abre en el celular con la cámara normal, sin escáner dentro de la app.
- **Marcar** (`POST /marca/marcar`, celular + PIN + QR + ubicación): la hora la pone el servidor en hora de Costa Rica. QR inválido o vencido → se rechaza (hay que escanear otra vez). Ubicación fuera de zona / imprecisa (>150 m) / sin permiso → **se guarda igual y queda «por revisar»**. Tabla `planilla_marcas_app` con todo lo ocurrido (instante, coordenadas, precisión, distancia, motivo, si entró al día).
- **Mezcla con la asistencia**: `AsistenciaService.sumarMarcaDelCelular` suma la hora a `DiaAsistencia.marcas` (origen `app`; un día `manual` sigue siendo manual) y reclasifica con las reglas de siempre. La importación del reloj **une** las marcas del reloj con las del celular de ese día (`unirMarcas`).
- Pantalla «Marcas del celular» (planilla.ver) con filtro «solo por revisar».

**Pendiente (siguientes pasos)**
- **Personal de tienda**: el punto «solo ubicación» ya existe, pero sus marcas no se suman al día (siguen en «Horas de tienda») hasta decidir cómo convivir con ese flujo.
- **Vendedores de ruta** (entrada/salida con QR en la empresa; visitas con llegada) y app nativa (etapa 3).
- Marca sin conexión, alertas (viaje imposible, mismo celular en dos empleados, fuera de zona repetido), selfie de evidencia.
- Un botón del supervisor para «confirmar» o corregir una marca por revisar (hoy solo se ve; se corrige con «Marcas a mano»).
- Consentimiento escrito del uso de la ubicación (Ley 8968) y política de qué pasa sin celular/datos: definirlo con el abogado laboral antes de exigir esta marca.
