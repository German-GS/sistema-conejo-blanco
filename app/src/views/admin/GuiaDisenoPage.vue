<script setup>
import { reactive } from 'vue';
import { Palette, Plus, Trash2 } from '@lucide/vue';
import Campo from '../../components/Campo.vue';
import CampoClave from '../../components/CampoClave.vue';
import Cargando from '../../components/Cargando.vue';
import { exito, fallo, informar } from '../../lib/avisos.js';
import { confirmar } from '../../lib/confirmar.js';

// Guía de diseño viva (solo el administrador del sistema): muestra cada componente y patrón del sistema tal como se ve, en el tema claro y
// en el oscuro. Sirve de referencia al construir pantallas nuevas y para detectar a simple vista si un cambio rompió algo. Reglas en docs/GUIA_DE_DISENO.md.
const demo = reactive({ nombre: '', correo: 'mal-correo', tipo: 'a', clave: '' });
const COLORES = [
  ['Acción principal', 'bg-blue-600', 'text-white'],
  ['Éxito', 'bg-green-700', 'text-white'],
  ['Atención', 'bg-amber-500', 'text-slate-900'],
  ['Peligro / error', 'bg-red-700', 'text-white'],
  ['Texto principal', 'bg-slate-900', 'text-white'],
  ['Texto secundario', 'bg-slate-500', 'text-white'],
  ['Borde', 'bg-slate-300', 'text-slate-900'],
  ['Fondo de tarjeta', 'bg-white border border-slate-300', 'text-slate-900'],
];
const FILAS = [
  ['Pedido #18', 'Cliente Pendiente Test', '₡20 340,00', 'Contado'],
  ['Pedido #17', 'Cliente Pendiente Test', '₡406 800,00', 'Anulado'],
  ['Pedido #16', 'Comercial La Esperanza', '₡61 020,00', 'Facturado'],
];
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-6 pb-12">
    <div>
      <div class="flex items-center gap-2"><Palette class="size-5 text-blue-600" aria-hidden="true" /><h1 class="text-xl font-bold text-slate-900">Guía de diseño</h1></div>
      <p class="mt-1 text-sm text-slate-500">Cómo se ve y cuándo se usa cada pieza del sistema. Cambie el tema con el interruptor de arriba para ver ambos. Las reglas completas están en <span class="font-mono">docs/GUIA_DE_DISENO.md</span>.</p>
    </div>

    <section class="card flex flex-col gap-3" aria-labelledby="g-color">
      <h2 id="g-color" class="text-base font-semibold text-slate-900">Colores y significado</h2>
      <p class="text-sm text-slate-600">Azul = acción principal. Verde = salió bien. Ámbar = atención. Rojo = peligro o error. El color nunca es lo único que informa: siempre va con texto o ícono.</p>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div v-for="c in COLORES" :key="c[0]" class="rounded-xl px-3 py-4 text-sm font-semibold" :class="[c[1], c[2]]">{{ c[0] }}</div>
      </div>
    </section>

    <section class="card flex flex-col gap-3" aria-labelledby="g-texto">
      <h2 id="g-texto" class="text-base font-semibold text-slate-900">Texto</h2>
      <p class="text-xl font-bold text-slate-900">Título de pantalla (20 px, negrita)</p>
      <p class="text-base font-semibold text-slate-900">Título de tarjeta (16 px, seminegrita)</p>
      <p class="text-sm text-slate-700">Texto normal (14 px). Se escribe de «usted», en frases cortas y sin jerga.</p>
      <p class="text-sm text-slate-500">Texto de ayuda o secundario (14 px, gris 500: contraste mínimo 4,5 a 1).</p>
      <p class="text-xs text-slate-500">Texto pequeño (13 px): solo para datos de apoyo, nunca para instrucciones.</p>
    </section>

    <section class="card flex flex-col gap-3" aria-labelledby="g-botones">
      <h2 id="g-botones" class="text-base font-semibold text-slate-900">Botones</h2>
      <p class="text-sm text-slate-600">Uno solo principal por pantalla o ventana. Lo destructivo nunca es el principal ni queda junto a las acciones frecuentes.</p>
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="btn-primary"><Plus class="size-5" aria-hidden="true" /> Principal</button>
        <button type="button" class="btn-secondary">Secundario</button>
        <button type="button" class="btn-danger">Peligro</button>
        <button type="button" class="btn-primary" disabled>Deshabilitado</button>
        <button type="button" class="rounded-lg border border-red-300 px-2.5 py-1 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 class="inline size-4" aria-hidden="true" /> Eliminar (zona aparte)</button>
        <button type="button" class="text-sm font-semibold text-blue-700 underline">Acción de texto</button>
      </div>
      <p class="text-xs text-slate-500">Un botón deshabilitado debe decir por qué: «Falta: el cliente, al menos un producto».</p>
    </section>

    <section class="card flex flex-col gap-3" aria-labelledby="g-campos">
      <h2 id="g-campos" class="text-base font-semibold text-slate-900">Campos de formulario</h2>
      <p class="text-sm text-slate-600">Siempre con etiqueta visible, ayuda debajo y el error enlazado al campo. Use el componente <span class="font-mono">Campo</span>.</p>
      <div class="grid gap-4 sm:grid-cols-2">
        <Campo v-model="demo.nombre" etiqueta="Nombre" ayuda="Como aparece en la cédula." requerido />
        <Campo v-model="demo.correo" etiqueta="Correo" tipo="email" error="Escriba un correo válido, por ejemplo nombre@empresa.com." />
        <Campo v-model="demo.tipo" etiqueta="Tipo de pago" tipo="select"><option value="a">Contado</option><option value="b">Crédito</option></Campo>
        <div><label class="label" for="g-clave">Contraseña</label><CampoClave id="g-clave" v-model="demo.clave" /></div>
      </div>
    </section>

    <section class="card flex flex-col gap-3" aria-labelledby="g-avisos">
      <h2 id="g-avisos" class="text-base font-semibold text-slate-900">Avisos y confirmaciones</h2>
      <p class="text-sm text-slate-600">Avisos breves abajo a la derecha (se quitan solos; los errores duran más). Las confirmaciones explican qué pasa y piden escribir una palabra cuando no hay vuelta atrás.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-secondary !min-h-11" @click="exito('Datos guardados.')">Aviso de éxito</button>
        <button type="button" class="btn-secondary !min-h-11" @click="fallo('No se pudo guardar. Revise su conexión.', { accion: { texto: 'Reintentar', fn: () => informar('Reintentando…') } })">Aviso de error con acción</button>
        <button type="button" class="btn-secondary !min-h-11" @click="informar('La caja recibe los cambios cada 10 minutos.')">Aviso informativo</button>
        <button type="button" class="btn-secondary !min-h-11" @click="confirmar('¿Guardar los cambios? Se aplican a todas las tiendas.')">Confirmación normal</button>
        <button type="button" class="btn-secondary !min-h-11" @click="confirmar('¿Eliminar el producto KW034? No se puede deshacer.', { palabra: 'ELIMINAR' })">Confirmación de peligro</button>
      </div>
      <div class="grid gap-2 sm:grid-cols-3">
        <p class="rounded-2xl border-2 border-blue-800 bg-blue-700 px-4 py-3 text-sm font-semibold text-white">Aviso informativo sólido</p>
        <p class="rounded-2xl border-2 border-amber-600 bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-900">Aviso de atención sólido</p>
        <p class="rounded-2xl border-2 border-red-800 bg-red-700 px-4 py-3 text-sm font-semibold text-white">Aviso de error sólido</p>
      </div>
    </section>

    <section class="card flex flex-col gap-3" aria-labelledby="g-carga">
      <h2 id="g-carga" class="text-base font-semibold text-slate-900">Carga y estados vacíos</h2>
      <p class="text-sm text-slate-600">Todo lo que espera usa el anillo; si tarda más de 8 s ofrece reintentar. Una lista vacía explica por qué y qué hacer.</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-slate-200"><Cargando texto="Cargando pedidos…" /></div>
        <div class="rounded-xl border border-dashed border-slate-300 p-6 text-center"><p class="text-sm font-semibold text-slate-800">Todavía no hay pedidos</p><p class="mt-1 text-sm text-slate-500">Cuando un vendedor guarde uno, aparecerá aquí.</p></div>
      </div>
    </section>

    <section class="card flex flex-col gap-3" aria-labelledby="g-tabla">
      <h2 id="g-tabla" class="text-base font-semibold text-slate-900">Tablas y etiquetas de estado</h2>
      <div class="tabla-fija rounded-lg border border-slate-200">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-xs text-slate-600"><th class="px-3 py-2">Pedido</th><th class="px-3 py-2">Cliente</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2">Estado</th></tr></thead>
          <tbody>
            <tr v-for="f in FILAS" :key="f[0]" class="border-t border-slate-100">
              <td class="px-3 py-2 font-medium">{{ f[0] }}</td><td class="px-3 py-2">{{ f[1] }}</td><td class="px-3 py-2 text-right tabular-nums">{{ f[2] }}</td>
              <td class="px-3 py-2"><span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="f[3] === 'Anulado' ? 'bg-red-100 text-red-700' : f[3] === 'Facturado' ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-700'">{{ f[3] }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card flex flex-col gap-2" aria-labelledby="g-reglas">
      <h2 id="g-reglas" class="text-base font-semibold text-slate-900">Antes de entregar una pantalla</h2>
      <ul class="list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li>Se entiende sola: título, qué hacer primero, qué pasa al terminar.</li>
        <li>Funciona en celular (375 px), tablet (768 px) y laptop (1366 px) sin desplazarse de lado.</li>
        <li>Todo campo tiene etiqueta, y todo botón de solo ícono tiene nombre accesible.</li>
        <li>Contraste mínimo 4,5 a 1 en ambos temas; objetivos táctiles de 40 px o más.</li>
        <li>Estados cubiertos: cargando, vacío, error (con salida) y éxito (con aviso).</li>
        <li>Lo irreversible pide confirmación con nombre de la acción; lo largo guarda borrador.</li>
        <li>Textos de «usted», sin jerga técnica ni mensajes del servidor sin traducir.</li>
      </ul>
    </section>
  </div>
</template>
