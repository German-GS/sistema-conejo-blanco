# Pruebas de usabilidad con usuarios — guía práctica

Objetivo: ver cómo usa el sistema la gente real, sin ayudarla, para encontrar dónde se traba. Con **5 personas por perfil** se detecta cerca del 80 % de los problemas.

## 1. Preparación (30 minutos)

- Datos de prueba cargados en un ambiente de desarrollo o con el **modo de prueba** (productos de prueba).
- Computadora o celular **de la persona** (su propio equipo y navegador).
- Quien facilita: una persona que **observa y anota**; no ayuda ni explica. Si la persona pregunta «¿qué hago?», responder «¿qué esperaría que pasara?».
- Opcional: grabar la pantalla con permiso.

## 2. Qué decir al empezar

«Estamos probando el sistema, **no a usted**. Si algo cuesta, es culpa del sistema. Piense en voz alta mientras lo usa. Puede parar cuando quiera.»

## 3. Tareas por perfil (una por vez, sin dar pistas)

| Perfil | Tarea 1 | Tarea 2 | Tarea 3 |
|---|---|---|---|
| **Vendedor** (celular) | Hacer un pedido a crédito para un cliente nuevo | Encontrar el pedido que hizo ayer y ver su estado | Corregir la cantidad de un producto en un pedido |
| **Gerencia** | Encontrar qué pedidos de tiendas faltan por revisar y revisar uno | Ver qué facturas están vencidas y quién las debe | Descargar un informe de ventas de la semana |
| **Encargado de tienda** | Abrir caja y vender dos productos con pago dividido | Aceptar una mercadería que llegó con una diferencia | Contar el inventario y cerrar caja (idealmente sin internet) |
| **Contador** | Registrar un asiento manual | Revisar por qué no cuadra el inventario | Cerrar un mes |

## 4. Qué anotar por tarea

- ¿Terminó? (sí / con ayuda / no).
- Tiempo.
- Errores y dudas (dónde dudó, qué tocó que no era, qué esperaba que pasara).
- Frases textuales de la persona.

## 5. Al terminar

1. Pregunta abierta: «¿Qué fue lo más difícil? ¿Qué le gustó?».
2. Cuestionario SUS (marcar de 1 «muy en desacuerdo» a 5 «muy de acuerdo»):
   1. Creo que usaría este sistema con frecuencia.
   2. Me pareció innecesariamente complejo.
   3. Me pareció fácil de usar.
   4. Creo que necesitaría ayuda de una persona para usarlo.
   5. Las funciones están bien integradas.
   6. Hubo demasiada inconsistencia.
   7. La mayoría de la gente aprendería a usarlo rápido.
   8. Me pareció muy incómodo de usar.
   9. Me sentí con confianza al usarlo.
   10. Tuve que aprender muchas cosas antes de poder usarlo.
3. Puntaje SUS: en las preguntas impares restar 1 a la respuesta; en las pares restar la respuesta a 5; sumar todo y multiplicar por 2,5. **68 es el promedio; más de 80 es excelente.**

## 6. Cómo usar los resultados

1. Lista de problemas por tarea, ordenada por **cuánta gente se trabó** y **cuán grave fue** (no pudo terminar > se demoró > molestó).
2. Arreglar primero lo que frenó a 3 o más personas.
3. Revisar en **Estado del sistema → Uso del sistema** las pantallas más visitadas, las búsquedas sin resultado y las llamadas que fallan, para confirmar con datos lo que se vio en la prueba.
4. Repetir con otras 5 personas después de los cambios y comparar el puntaje SUS.
