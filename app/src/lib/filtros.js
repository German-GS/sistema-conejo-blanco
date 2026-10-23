import { computed, ref, watch } from 'vue';

// Recuerda los filtros de una pantalla mientras la pestaña siga abierta: al entrar a un detalle y volver, no hay que filtrar de nuevo.
// Uso (después de declarar los refs y antes de cargar los datos): recordarFiltros('pedidos', { cliente: filtroClienteId, estado: filtroEstado });
export function recordarFiltros(clave, refs) {
  const llave = `cb-filtros:${clave}`;
  try {
    const guardado = JSON.parse(sessionStorage.getItem(llave) ?? 'null');
    if (guardado) for (const [nombre, r] of Object.entries(refs)) if (nombre in guardado) r.value = guardado[nombre];
  } catch {
    /* sin almacenamiento o dato dañado: se parte de los filtros por defecto */
  }
  watch(
    () => Object.fromEntries(Object.entries(refs).map(([nombre, r]) => [nombre, r.value])),
    (valores) => {
      try {
        sessionStorage.setItem(llave, JSON.stringify(valores));
      } catch {
        /* nada */
      }
    },
    { deep: true },
  );
}

// Listas largas: se muestran de a pocas y un botón «Mostrar más». Uso: const { visibles, restantes, mostrarMas } = usarLimite(() => pedidos.value);
export function usarLimite(origen, paso = 50) {
  const limite = ref(paso);
  const visibles = computed(() => origen().slice(0, limite.value));
  const restantes = computed(() => Math.max(0, origen().length - limite.value));
  return { visibles, restantes, mostrarMas: () => (limite.value += paso), reiniciar: () => (limite.value = paso), paso };
}
