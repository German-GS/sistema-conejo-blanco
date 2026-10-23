#!/bin/bash
# Publica el frontend (app/) en el hosting compartido de Conejo Motors, bajo /cb/app/.
# IMPORTANTE: se CONSERVAN los archivos de pantallas de versiones anteriores (carpeta assets). Una pestaña que quedó abierta con la versión
# vieja todavía los pide; si se borraran, esas pantallas dejarían de abrir hasta recargar. Los archivos de más de 30 días se limpian.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
M="${MOTORS_FRONTEND:-/Volumes/GG-Res/Sistema Conejo Motors/sistema-conejo-motors/frontend}"
DESTINO="$M/dist/cb/app"

( cd "$RAIZ/app" && npx vite build )

mkdir -p "$DESTINO/assets"
# Todo lo que no sea assets (index.html, manifiesto, íconos, service worker) se reemplaza completo.
find "$DESTINO" -mindepth 1 -maxdepth 1 ! -name assets -exec rm -rf {} +
cp -R "$RAIZ/app/dist/." "$DESTINO/"
# Limpieza de archivos viejos (los nuevos acaban de copiarse y conservan fecha reciente).
find "$DESTINO/assets" -type f -mtime +30 -delete

( cd "$M" && firebase deploy --only hosting --project conejo-motors )
