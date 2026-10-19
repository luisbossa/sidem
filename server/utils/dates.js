/* Fechas: instantes en ISO UTC y días en la hora local del servidor. */
export const ahoraISO = () => new Date().toISOString();

/* Rol semanal de lunes a viernes: el viernes de la semana que empieza el lunes "inicio" (AAAA-MM-DD) */
export function finDeSemanaRol(inicio) {
  const f = new Date(inicio + 'T00:00:00Z');
  f.setUTCDate(f.getUTCDate() + 4);
  return f.toISOString().slice(0, 10);
}

/* AAAA-MM-DD en hora local (el servidor y el personal están en la misma zona horaria) */
export function diaLocal(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
