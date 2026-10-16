# ── Etapa 1: Build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Etapa 2: Producción ─────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar build compilado
COPY --from=builder /app/dist ./dist

# Fuentes para los PDF (colillas de pago): DejaVu trae el símbolo ₡.
COPY --from=builder /app/assets ./assets

# Carpeta de fotos de producto — en producción este path se monta sobre
# un bucket de Cloud Storage (ver --add-volume en el deploy), así que
# esto solo sirve de fallback para correr la imagen sin ese mount (ej.
# local con Docker). Ver CatalogoController.CARPETA_FOTOS.
RUN mkdir -p uploads/productos

EXPOSE 3101

CMD ["node", "dist/main"]
