# Sistema Conejo Blanco

Sistema de gestión para una fábrica de medias y calcetines en Costa Rica: pedidos de vendedores, inventario, facturación, cuentas por cobrar, contabilidad y planilla con las reglas laborales y de seguridad social del país.

Desarrollado por **German Garcia Siles** — versión actual en [`CHANGELOG.md`](CHANGELOG.md).

## Qué hace

- **Ventas:** hoja de pedido digital para vendedores (pantalla simple, pensada para celular), clientes con descuentos, catálogo de productos y colores con fotos.
- **Inventario:** existencias por bodega, ingresos, ajustes, traspasos y kárdex.
- **Facturación y cobros:** facturas desde pedidos o a mano, notas de crédito, recibos de pago aplicados a facturas y cuentas por cobrar.
- **Contabilidad:** partida doble con asientos automáticos, libro diario y mayor (con exportación a Excel), balance de comprobación, estado de resultados, balance general, cierre mensual y cierre fiscal con provisión del impuesto de renta.
- **Planilla:** lector de la tarjeta de tiempo del reloj, cálculo de salarios, horas extra, feriados y días de descanso, cargas sociales (CCSS), impuesto de renta por tramos, provisiones, colillas de pago en PDF, archivo para el banco y asientos contables.
- **Seguridad:** perfiles y permisos por cuenta, verificación en dos pasos, bloqueo por intentos, bitácora de accesos, registro de actividad y panel del administrador con métricas del servidor.

## Tecnología

- **Backend:** NestJS (TypeScript), TypeORM y PostgreSQL.
- **Frontend:** Vue 3, Vite y Tailwind CSS.
- **Infraestructura:** Google Cloud (Cloud Run, Cloud SQL, Cloud Storage) y Firebase Hosting.
- **Pruebas:** Vitest (cálculos de planilla, redondeo monetario, TOTP, reglas contables).

## Estructura

- `backend/` — API NestJS.
- `app/` — aplicación Vue.
- `docker-compose.yml` — PostgreSQL para desarrollo local.

## Desarrollo local

```bash
# 1. Base de datos
docker compose up -d

# 2. Backend (copiar backend/.env.example a backend/.env y completar los valores)
cd backend
npm install
npm run seed         # crea el administrador del sistema y datos de demostración
npm run start:dev

# 3. Frontend (otra terminal)
cd app
npm install
npm run dev
```

Abrir http://localhost:5175. La contraseña del vendedor de demostración se muestra una sola vez en la consola al correr `npm run seed`.

## Notas

Las claves, variables de entorno y guías de despliegue de producción no forman parte de este repositorio.
