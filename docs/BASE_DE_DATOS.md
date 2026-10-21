# Base de datos — Sistema Conejo Blanco

Esquema generado desde las entidades de TypeORM (PostgreSQL): **52 tablas**, **56 relaciones** entre tablas.

Cada diagrama muestra una zona del sistema con sus llaves (PK = llave primaria, FK = llave foránea, UK = única) y las columnas principales. Las tablas externas a la zona aparecen solo con su `id`.

Los asientos contables se enlazan con los documentos que los generan (facturas, pagos, planillas, cierres) de forma lógica mediante `origen_tipo` y `origen_id`, sin llave foránea, para poder conservar el historial contable.

## Accesos y sistema

Tablas: `usuarios`, `usuario_permisos`, `bitacora_accesos`, `registro_actividad`, `configuracion_sistema`.

```mermaid
erDiagram
  usuarios {
    uuid id PK
    uuid empleado_id FK
    string nombre
    string email UK
    string password_hash
    int version_token
    int intentos_fallidos
    timestamp bloqueado_hasta
    boolean debe_cambiar_clave
    timestamp clave_temporal_vence
    string totp_secreto
    boolean totp_activo
    string mas_6_columnas
  }
  usuario_permisos {
    uuid id PK
    uuid usuario_id FK
    string permiso
    boolean concedido
  }
  bitacora_accesos {
    uuid id PK
    uuid usuario_id
    string usuario_email
    string accion
    string objetivo
    string detalle
    string ip
  }
  registro_actividad {
    uuid id PK
    uuid usuario_id
    string usuario_email
    string rol
    string area
    string metodo
    string ruta
    int estado
    int duracion_ms
    string ip
    string agente
    string mas_2_columnas
  }
  configuracion_sistema {
    string clave PK
    jsonb valor
  }
  planilla_empleados {
    uuid id PK
  }
  planilla_empleados ||--o| usuarios : empleado_id
  usuarios ||--o{ usuario_permisos : usuario_id
```

## Catálogo e inventario

Tablas: `productos`, `variantes_producto`, `producto_fotos`, `producto_ediciones`, `ubicaciones`, `stock_ubicaciones`, `movimientos_inventario`, `traspasos`, `traspaso_lineas`.

```mermaid
erDiagram
  productos {
    uuid id PK
    string codigo UK
    string nombre
    string descripcion
    boolean activo
  }
  variantes_producto {
    uuid id PK
    uuid producto_id FK
    string color
    decimal precio_por_par
    decimal costo
    decimal precio_tienda
    string codigo_barras UK
    boolean activo
  }
  producto_fotos {
    uuid id PK
    uuid producto_id FK
    string url
  }
  producto_ediciones {
    uuid id PK
    uuid producto_id FK
    uuid usuario_id FK
    jsonb cambios
  }
  ubicaciones {
    uuid id PK
    string tipo
    string nombre
    string codigo UK
    boolean activa
    boolean permite_venta
  }
  stock_ubicaciones {
    uuid id PK
    uuid ubicacion_id FK
    uuid variante_id FK
    int cantidad
    int stock_minimo
  }
  movimientos_inventario {
    uuid id PK
    uuid ubicacion_id FK
    uuid variante_id FK
    uuid creado_por FK
    string tipo
    int cantidad
    string referencia_tipo
    uuid referencia_id
    uuid movimiento_reversa_id
  }
  traspasos {
    uuid id PK
    uuid origen_id FK
    uuid destino_id FK
    uuid solicitado_por FK
    uuid recibido_por FK
    int numero_traspaso UK
    string estado
    timestamp fecha_envio
    timestamp fecha_recepcion
  }
  traspaso_lineas {
    uuid id PK
    uuid traspaso_id FK
    uuid variante_id FK
    int cantidad_enviada
    int cantidad_recibida
  }
  usuarios {
    uuid id PK
  }
  productos ||--o{ variantes_producto : producto_id
  productos ||--o{ producto_fotos : producto_id
  productos ||--o{ producto_ediciones : producto_id
  usuarios ||--o{ producto_ediciones : usuario_id
  ubicaciones ||--o{ stock_ubicaciones : ubicacion_id
  variantes_producto ||--o{ stock_ubicaciones : variante_id
  ubicaciones ||--o{ movimientos_inventario : ubicacion_id
  variantes_producto ||--o{ movimientos_inventario : variante_id
  usuarios ||--o{ movimientos_inventario : creado_por
  ubicaciones ||--o{ traspasos : origen_id
  ubicaciones ||--o{ traspasos : destino_id
  usuarios ||--o{ traspasos : solicitado_por
  usuarios |o--o{ traspasos : recibido_por
  traspasos ||--o{ traspaso_lineas : traspaso_id
  variantes_producto ||--o{ traspaso_lineas : variante_id
```

## Clientes y pedidos

Tablas: `clientes`, `pedidos`, `pedido_lineas`, `pedido_ediciones`, `pedido_contadores`, `configuracion_descuentos`.

```mermaid
erDiagram
  clientes {
    uuid id PK
    string nombre
    string tipo_identificacion
    string cedula
    string telefono
    string email
    string direccion
    string provincia
    boolean activo
    decimal descuento_porcentaje
  }
  pedidos {
    uuid id PK
    uuid cliente_id FK
    uuid vendedor_id FK
    uuid ubicacion_id FK
    int numero_orden UK
    jsonb cliente_pendiente
    date fecha
    string tipo_pago
    int dias_credito
    decimal subtotal
    decimal iva_porcentaje
    decimal iva_monto
    decimal total
    string estado
    string mas_2_columnas
  }
  pedido_lineas {
    uuid id PK
    uuid pedido_id FK
    uuid variante_id FK
    string codigo_producto
    string nombre_producto
    string color
    decimal docenas
    int pares
    decimal precio_por_par
    decimal descuento_porcentaje
    decimal monto_linea
  }
  pedido_ediciones {
    uuid id PK
    uuid pedido_id FK
    uuid usuario_id FK
    string motivo
    jsonb cambios
  }
  pedido_contadores {
    string id PK
    int ultimo
  }
  configuracion_descuentos {
    string id PK
    decimal descuento_maximo_vendedor_porcentaje
  }
  ubicaciones {
    uuid id PK
  }
  usuarios {
    uuid id PK
  }
  variantes_producto {
    uuid id PK
  }
  clientes |o--o{ pedidos : cliente_id
  usuarios ||--o{ pedidos : vendedor_id
  ubicaciones |o--o{ pedidos : ubicacion_id
  pedidos ||--o{ pedido_lineas : pedido_id
  variantes_producto ||--o{ pedido_lineas : variante_id
  pedidos ||--o{ pedido_ediciones : pedido_id
  usuarios ||--o{ pedido_ediciones : usuario_id
```

## Facturación y cobros

Tablas: `facturas`, `factura_lineas`, `notas_credito`, `factura_contadores`, `pagos_recibidos`, `pago_aplicaciones`, `pago_contadores`, `cuentas_bancarias`, `configuracion_factura`.

```mermaid
erDiagram
  facturas {
    uuid id PK
    uuid pedido_id FK
    uuid ubicacion_id FK
    uuid cliente_id FK
    string origen
    string tipo_pago
    int dias_credito
    string medio_pago
    string orden_compra
    string vendedor
    string notas
    string terminos
    string leyenda
    jsonb encabezado
    string mas_12_columnas
  }
  factura_lineas {
    uuid id PK
    uuid factura_id FK
    uuid variante_id FK
    int orden
    string descripcion
    decimal cantidad
    decimal precio_unitario
    decimal descuento_porcentaje
    decimal impuesto_porcentaje
    decimal costo_unitario
    decimal subtotal
    decimal impuesto_monto
  }
  notas_credito {
    uuid id PK
    uuid factura_id FK
    uuid cliente_id FK
    uuid usuario_id FK
    string tipo_comprobante
    string consecutivo UK
    string clave_numerica UK
    date fecha
    string motivo
    decimal subtotal
    decimal iva_porcentaje
    decimal iva_monto
    decimal total
    string estado
    string mas_1_columnas
  }
  factura_contadores {
    int id PK
    string sucursal
    string terminal
    string tipo
    string ultimo
  }
  pagos_recibidos {
    uuid id PK
    uuid cliente_id FK
    uuid cuenta_bancaria_id FK
    uuid creado_por_id FK
    int numero UK
    string tipo
    date fecha
    string medio_pago
    string moneda
    decimal total
    string concepto
    string notas
    string estado
    string motivo_anulacion
    string mas_1_columnas
  }
  pago_aplicaciones {
    uuid id PK
    uuid pago_id FK
    uuid factura_id FK
    decimal monto
  }
  pago_contadores {
    string id PK
    int ultimo
  }
  cuentas_bancarias {
    uuid id PK
    uuid cuenta_contable_id FK
    string nombre
    string numero_cuenta
    string titular
    string moneda
    boolean es_caja
    boolean mostrar_en_factura
    boolean activa
  }
  configuracion_factura {
    string id PK
    string logo_url
    string razon_social
    string cedula_juridica
    string descripcion_actividad
    string actividad_economica
    string correo
    string telefono
    string direccion
    string notas_predeterminadas
    string terminos_condiciones
    string mas_1_columnas
  }
  clientes {
    uuid id PK
  }
  cuentas_contables {
    uuid id PK
  }
  pedidos {
    uuid id PK
  }
  ubicaciones {
    uuid id PK
  }
  usuarios {
    uuid id PK
  }
  variantes_producto {
    uuid id PK
  }
  pedidos ||--o| facturas : pedido_id
  ubicaciones |o--o{ facturas : ubicacion_id
  clientes ||--o{ facturas : cliente_id
  facturas ||--o{ factura_lineas : factura_id
  variantes_producto |o--o{ factura_lineas : variante_id
  facturas ||--o| notas_credito : factura_id
  clientes ||--o{ notas_credito : cliente_id
  usuarios ||--o{ notas_credito : usuario_id
  clientes |o--o{ pagos_recibidos : cliente_id
  cuentas_bancarias ||--o{ pagos_recibidos : cuenta_bancaria_id
  usuarios ||--o{ pagos_recibidos : creado_por_id
  pagos_recibidos ||--o{ pago_aplicaciones : pago_id
  facturas ||--o{ pago_aplicaciones : factura_id
  cuentas_contables ||--o{ cuentas_bancarias : cuenta_contable_id
```

## Contabilidad

Tablas: `cuentas_contables`, `asientos_contables`, `lineas_asiento`, `periodos_contables_cerrados`, `cierres_fiscales`, `parametros_fiscales`.

```mermaid
erDiagram
  cuentas_contables {
    uuid id PK
    string codigo UK
    string nombre
    string tipo
    string naturaleza
    boolean activa
    string descripcion
    boolean sistema
  }
  asientos_contables {
    uuid id PK
    int numero
    date fecha
    string descripcion
    string origen_tipo
    uuid origen_id
    uuid creado_por_id
  }
  lineas_asiento {
    uuid id PK
    uuid asiento_id FK
    uuid cuenta_id FK
    decimal debe
    decimal haber
  }
  periodos_contables_cerrados {
    string periodo PK
    uuid cerrado_por_id
    string notas
    jsonb asientos_cierre
    jsonb resumen
    timestamp cerrado_en
  }
  cierres_fiscales {
    int anio PK
    uuid cerrado_por_id
    string notas
    jsonb asientos_cierre
    jsonb resumen
    timestamp cerrado_en
  }
  parametros_fiscales {
    string clave PK
    decimal valor
    string descripcion
  }
  asientos_contables ||--o{ lineas_asiento : asiento_id
  cuentas_contables ||--o{ lineas_asiento : cuenta_id
```

## Punto de venta (POS)

Tablas: `pos_ventas`, `pos_venta_lineas`, `pos_pagos`, `pos_cajas`, `pos_configuracion`.

```mermaid
erDiagram
  pos_ventas {
    uuid id PK
    uuid ubicacion_id FK
    uuid cajero_id FK
    int numero
    uuid caja_id
    timestamp fecha
    decimal subtotal
    decimal descuento
    decimal total
    string estado
    string motivo_anulacion
    timestamp anulada_en
    uuid anulada_por_id
    string mas_3_columnas
  }
  pos_venta_lineas {
    uuid id PK
    uuid venta_id FK
    uuid variante_id FK
    string codigo
    string descripcion
    string color
    int cantidad
    decimal precio_unitario
    decimal descuento
    decimal subtotal
    decimal costo_unitario
  }
  pos_pagos {
    uuid id PK
    uuid venta_id FK
    string medio
    decimal monto
    string referencia
    decimal recibido
    decimal vuelto
  }
  pos_cajas {
    uuid id PK
    uuid ubicacion_id FK
    uuid cajero_id FK
    timestamp abierta_en
    decimal fondo_inicial
    timestamp cerrada_en
    decimal efectivo_esperado
    decimal efectivo_contado
    decimal diferencia
    string notas
  }
  pos_configuracion {
    string id PK
    uuid cuenta_tarjeta_id
    uuid cuenta_sinpe_id
    uuid cuenta_transferencia_id
    string pie_tiquete
  }
  ubicaciones {
    uuid id PK
  }
  usuarios {
    uuid id PK
  }
  variantes_producto {
    uuid id PK
  }
  ubicaciones ||--o{ pos_ventas : ubicacion_id
  usuarios ||--o{ pos_ventas : cajero_id
  pos_ventas ||--o{ pos_venta_lineas : venta_id
  variantes_producto ||--o{ pos_venta_lineas : variante_id
  pos_ventas ||--o{ pos_pagos : venta_id
  ubicaciones ||--o{ pos_cajas : ubicacion_id
  usuarios ||--o{ pos_cajas : cajero_id
```

## Planilla

Tablas: `planilla_empleados`, `planilla_puestos`, `planilla_planillas`, `planilla_lineas`, `planilla_dias`, `planilla_resoluciones`, `planilla_importaciones`, `planilla_deudas`, `planilla_feriados`, `planilla_horario_base`, `planilla_parametros`, `planilla_banco_popular`.

```mermaid
erDiagram
  planilla_empleados {
    uuid id PK
    string numero_reloj UK
    string nombre
    string cedula
    string puesto
    date fecha_ingreso
    string tipo_salario
    decimal monto_salario
    string frecuencia_pago
    jsonb horario_semanal
    string horario_entrada
    string mas_19_columnas
  }
  planilla_puestos {
    uuid id PK
    string nombre UK
    boolean es_confianza
    string sector
    boolean activo
  }
  planilla_planillas {
    uuid id PK
    uuid creada_por FK
    string frecuencia
    date fecha_desde
    date fecha_hasta
    string estado
    decimal total_bruto
    decimal total_deducciones
    decimal total_neto
    decimal total_cargas_patronales
    decimal total_provisiones
    timestamp aprobada_en
    string mas_4_columnas
  }
  planilla_lineas {
    uuid id PK
    uuid planilla_id FK
    uuid empleado_id FK
    string empleado_nombre
    string empleado_cedula
    decimal salario_base
    decimal tarifa_hora
    int dias_ausencia_descontados
    decimal descuento_ausencias
    decimal horas_ausentes
    decimal descuento_horas
    decimal horas_extra
    decimal monto_extra
    string mas_15_columnas
  }
  planilla_dias {
    uuid id PK
    uuid empleado_id FK
    uuid importacion_id FK
    date fecha
    jsonb marcas
    string estado
    string tipo_dia
    int minutos_brutos
    int minutos_almuerzo
    boolean almuerzo_estimado
    int minutos_netos
    int minutos_extra
    int minutos_especiales
    string mas_7_columnas
  }
  planilla_resoluciones {
    uuid id PK
    uuid dia_id FK
    uuid usuario_id FK
    string tipo
    string motivo
    jsonb detalle
  }
  planilla_importaciones {
    uuid id PK
    uuid usuario_id FK
    string nombre_archivo
    date periodo_desde
    date periodo_hasta
    jsonb mapeo
    jsonb resumen
  }
  planilla_deudas {
    uuid id PK
    uuid empleado_id FK
    string descripcion
    decimal monto_original
    decimal saldo
    decimal cuota_por_planilla
    string autorizacion_nota
    boolean activa
  }
  planilla_feriados {
    uuid id PK
    date fecha UK
    string nombre
    boolean pago_obligatorio
  }
  planilla_horario_base {
    string id PK
    jsonb horario
  }
  planilla_parametros {
    uuid id PK
    string nombre UK
    decimal valor
    string descripcion
    string tipo
  }
  planilla_banco_popular {
    string id PK
    string nombre_empresa
    string numero_patrono
    string cedula_patrono
    string identificador_cliente
    int convenio
    string cuenta_patrono
    string moneda
  }
  usuarios {
    uuid id PK
  }
  usuarios ||--o{ planilla_planillas : creada_por
  planilla_planillas ||--o{ planilla_lineas : planilla_id
  planilla_empleados ||--o{ planilla_lineas : empleado_id
  planilla_empleados ||--o{ planilla_dias : empleado_id
  planilla_importaciones |o--o{ planilla_dias : importacion_id
  planilla_dias ||--o{ planilla_resoluciones : dia_id
  usuarios ||--o{ planilla_resoluciones : usuario_id
  usuarios ||--o{ planilla_importaciones : usuario_id
  planilla_empleados ||--o{ planilla_deudas : empleado_id
```
