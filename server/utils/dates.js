/* Fechas: instantes en ISO UTC y días en la hora local del servidor. */
export const ahoraISO = () => new Date().toISOString();

/* AAAA-MM-DD en hora local (el servidor y el personal están en la misma zona horaria) */
export function diaLocal(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
