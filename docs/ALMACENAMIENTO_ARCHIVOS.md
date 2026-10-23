# Almacenamiento de archivos subidos (logo, fotos de producto, justificantes)

## Cómo está armado en producción

Los archivos que se suben (logo de la factura, fotos de producto, justificantes de planilla) se guardan en la carpeta `uploads/` del servidor. En Cloud Run esa carpeta **es un bucket de Cloud Storage montado como volumen**, así que los archivos sobreviven a despliegues y reinicios:

| Dato | Valor |
|---|---|
| Bucket | `gs://conejo-blanco-app-uploads` (us-central1) |
| Punto de montaje | `/app/uploads` (volumen `uploads`, driver `gcsfuse`) |
| Subcarpetas | `empresa/` (logo), `productos/` (fotos), `justificantes/` (privado) |
| Entorno de ejecución | segunda generación (necesario para montar buckets) |

Los despliegues con `gcloud run deploy --source backend …` conservan el volumen.

En **desarrollo** la carpeta `backend/uploads` está en el disco local: si está vacía, el logo y las fotos aparecen como «no disponible».

## Comprobar que sigue montado

```bash
gcloud run services describe conejo-blanco-backend --region us-central1 --project conejo-blanco-app --format='yaml(spec.template.spec.volumes,spec.template.spec.containers[0].volumeMounts)'
```

## Si hubiera que volver a montarlo (por ejemplo, en un servicio nuevo)

```bash
gcloud storage buckets create gs://NOMBRE_DEL_BUCKET --project PROYECTO --location us-central1 --uniform-bucket-level-access
```

Darle permiso a la cuenta de servicio del servicio (`gcloud run services describe … --format='value(spec.template.spec.serviceAccountName)'`):

```bash
gcloud storage buckets add-iam-policy-binding gs://NOMBRE_DEL_BUCKET --project PROYECTO --member="serviceAccount:CUENTA_DE_SERVICIO" --role=roles/storage.objectUser
```

```bash
gcloud run services update SERVICIO --region us-central1 --project PROYECTO --execution-environment gen2 --add-volume name=uploads,type=cloud-storage,bucket=NOMBRE_DEL_BUCKET --add-volume-mount volume=uploads,mount-path=/app/uploads
```

## Notas

- `uploads/justificantes` es privado: el sistema no lo sirve como archivo público (ver `main.ts`).
- Cloud Storage montado como carpeta no es un disco normal (sin renombrados atómicos ni bloqueos): sirve bien para archivos que se suben una vez y se leen después, como estos.
