# Registro de cambios — Sistema Conejo Blanco

Versionado `MAYOR.MENOR.PARCHE`:
- **PARCHE** (1.0.1): se corrige un error o se hace un ajuste pequeño.
- **MENOR** (1.1.0): se agrega una función nueva y todo lo anterior sigue igual.
- **MAYOR** (2.0.0): un cambio grande que modifica cómo se trabaja.

La versión se cambia en `app/package.json` y `backend/package.json` (el pie de página y el panel del sistema la leen solos).

## 1.0.0 — 16 oct 2026 — Primera versión en uso real
Línea base con la que la planilla entra en producción.
- Pedidos, clientes, catálogo, inventario, traspasos, facturación (manual y de pedidos), notas de crédito y pagos recibidos.
- Contabilidad: catálogo de cuentas, libro diario con número de asiento, libro mayor (Excel), reportes, cierre mensual y cierre fiscal (renta), verificación de cálculos (26 reglas).
- Planilla: empleados y puestos, lector del reloj (.xls/.xlsx), asistencia, planillas con cálculo de CCSS 2026, renta, extras y feriados, colillas de pago en PDF (media carta), archivo de Banco Popular, informes y asientos contables, anulación y reversas.
- Seguridad y accesos: perfiles (sistema, gerente general, administración, contador, asistente, vendedor), permisos por cuenta, claves temporales, verificación en dos pasos, bloqueo por intentos, bitácora de accesos y registro de actividad.
- Panel del administrador del sistema: métricas del servidor, políticas, módulos, mantenimiento y exportación de datos.
