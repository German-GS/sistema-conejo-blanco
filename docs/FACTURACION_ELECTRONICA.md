# Facturación electrónica (Hacienda)

Estado: **preparada, sin conectar**. Las facturas se crean y quedan «Pendiente de envío». Todo lo demás (XML v4.4, firma, envío, seguimiento, correo al cliente, re-emisión) está construido y se activa con las llaves.

## Para retomarlo
Cada cosa que falta está marcada en el código con `PENDIENTE(hacienda)`:
```
grep -rn "PENDIENTE(hacienda)" backend/src
```
Orden sugerido: (1) cargar llaves y poner modo pruebas, (2) validar el XML contra el XSD y corregir lo que Hacienda rechace, (3) nota de crédito electrónica, (4) PDF en el correo, (5) Cloud Run siempre encendido, (6) producción.

## Estados que ve el usuario (como en Alegra)
| Estado | Color | Significa |
|---|---|---|
| **Emitida** | verde | Hacienda la **aceptó**: es válida. Es la única certeza. |
| **En proceso** | gris | Enviada, Hacienda todavía no responde (se consulta cada 10 min). |
| **Pendiente de envío** | ámbar | Creada, no enviada (sin conexión, o faltan datos: el motivo queda escrito en la factura). |
| **Rechazada** | rojo | Hacienda la rechazó; el motivo queda escrito. Se corrige y se «emite de nuevo» con consecutivo nuevo. |

Se ve en Facturas (columna, filtro y resumen), en el detalle de la factura y en el pedido; al facturar sale un aviso que dice si quedó emitida o no. «Para hacer hoy» avisa de rechazadas y pendientes.

## Cómo se activa (en este orden)
1. **Datos del emisor y CABYS:** Facturación electrónica → completar el formulario. Anotar el CABYS de cada producto en Inventario (o dejar uno predeterminado).
2. **Credenciales de Hacienda** (Oficina Virtual / ATV): descargar la *llave criptográfica* (.p12) y su PIN, y tener el usuario y la contraseña de la API. Hacienda da juegos **distintos para pruebas y para producción**.
3. **Secretos en Google Cloud** (proyecto `conejo-blanco-app`; nunca en el código ni en pantallas). Para pruebas, sufijo `-stag`; para producción, `-prod`:
   - `cb-hacienda-p12-stag` (archivo .p12), `cb-hacienda-p12-pin-stag`, `cb-hacienda-idp-pass-stag`
   - `cb-smtp-url` (correo saliente, ej. `smtps://usuario:clave@servidor:465`) — opcional, para entregar la factura al cliente.
   ```
   gcloud secrets create cb-hacienda-p12-stag --data-file=llave-pruebas.p12 --project conejo-blanco-app
   printf '%s' 'EL_PIN' | gcloud secrets create cb-hacienda-p12-pin-stag --data-file=- --project conejo-blanco-app
   gcloud secrets add-iam-policy-binding cb-hacienda-p12-stag --project conejo-blanco-app \
     --member serviceAccount:CUENTA_DE_SERVICIO_DE_CLOUD_RUN --role roles/secretmanager.secretAccessor
   ```
   (repetir el permiso para cada secreto).
4. **Encender el modo de pruebas:** `gcloud run services update conejo-blanco-backend --region us-central1 --project conejo-blanco-app --update-env-vars HACIENDA_MODO=pruebas`.
5. **Probar:** crear una factura de prueba → «Enviar a Hacienda» → debe pasar a En proceso y luego a Emitida. Si Hacienda rechaza, el motivo aparece en la factura (así se afina el formato).
6. **Producción:** subir los secretos sin `-stag` (con `-prod`) y poner `HACIENDA_MODO=produccion`. Solo cuando las pruebas den Emitida de forma estable.

`HACIENDA_MODO`: `noop` (hoy, no envía nada) · `pruebas` · `produccion`.

## Decisiones pendientes
- **Facturas anteriores a la conexión:** hoy hay decenas «Pendiente de envío» que ya llevan consecutivo. «Enviar solas desde» (fecha) evita mandar el pasado sin querer; las anteriores se envían a mano o en lote desde la pantalla, o se dejan. Conviene hablarlo con el contador (hay plazos para emitir).
- El orden de los elementos del XML sigue el anexo v4.4 pero **no se pudo validar contra el XSD oficial** (la descarga no estuvo disponible): la primera emisión en pruebas lo confirma.
- Medio de pago de las facturas que salen de un pedido: se envía «transferencia»; SINPE Móvil usa el código 06.

## Ojo con Cloud Run
La revisión cada 10 minutos corre dentro del servidor; Cloud Run puede dormir el servicio cuando no hay uso. Para producción hay que dejar una instancia siempre encendida (`--min-instances 1 --no-cpu-throttling`) o programar una llamada periódica con Cloud Scheduler. Mientras tanto, «Consultar estado ahora» en cada factura funciona siempre.

## Todavía NO está
- **Nota de crédito electrónica:** anular una factura genera la nota en el sistema, pero aún no se envía a Hacienda. Imprescindible antes de producción (una factura aceptada solo se anula con una nota de crédito aceptada).
- Representación gráfica (PDF) adjunta al correo: hoy se entregan los XML.
- Tiquete electrónico del POS (las tiendas siguen en régimen simplificado).
