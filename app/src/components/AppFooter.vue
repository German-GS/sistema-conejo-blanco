<script setup>
// Pie de página de toda la aplicación. La versión y la fecha salen del build (vite.config.js).
const anio = new Date().getFullYear();
const version = __APP_VERSION__;
const compilado = __APP_COMPILADO__.split('-').reverse().join('/');
</script>

<template>
  <footer class="border-t border-slate-200 bg-white/80 px-4 py-3 text-center text-xs text-slate-500 print:hidden">
    © {{ anio }} Desarrollado por <span class="font-semibold text-slate-700">German Garcia Siles</span>
    · Todos los derechos reservados · Versión {{ version }} · {{ compilado }}
  </footer>
</template>
