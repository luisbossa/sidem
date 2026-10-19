/* Formato de fechas, horas y duraciones. */
import { icono } from '../ui/icons.js';

/* Un día "AAAA-MM-DD" (como las semanas del rol) se interpreta en hora local. new Date('2026-10-19') lo toma
   como medianoche UTC, que en Costa Rica (UTC-6) todavía es el día anterior: un lunes se mostraría como domingo. */
export function aFecha(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, dia] = d.split('-').map(Number);
    return new Date(y, m - 1, dia);
  }
  return new Date(d);
}

export const formatearFechaCompleta = d => aFecha(d).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const formatearFechaCorta = d => aFecha(d).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
/* "lunes 19 oct 2026" */
export const formatearDiaSemana = d => aFecha(d).toLocaleDateString('es-CR', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });

/* Rol semanal: de lunes a viernes */
export const DIAS_SEMANA_ROL = 5;
export function sumarDias(dia, n) {
  const f = aFecha(dia);
  f.setDate(f.getDate() + n);
  return fechaLocalISO(f);
}
/* Lunes de la semana a la que pertenece un día (sábado y domingo pasan al lunes siguiente) */
export function lunesDeLaSemana(dia) {
  const diaSemana = aFecha(dia).getDay(); // 0 domingo … 6 sábado
  if (diaSemana === 1) return dia;
  return sumarDias(dia, diaSemana === 0 ? 1 : diaSemana === 6 ? 2 : 1 - diaSemana);
}
export const formatearHoraExacta = d => new Date(d).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

export function formatearSegundos(s) {
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
}

/* AAAA-MM-DD en hora local */
export function fechaLocalISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

export function claveFechaLocal(fecha) {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return fechaLocalISO(d);
}

/* AAAA-MM */
export function claveMesInforme(fecha) {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* "2026-09" → "Septiembre de 2026" */
export function etiquetaMes(mes) {
  const [anio, numeroMes] = mes.split('-').map(Number);
  const etiqueta = new Date(anio, numeroMes - 1, 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

export function etiquetaTipoRecorrido(tipo, { conIcono = true, vacio = 'No especificado' } = {}) {
  if (tipo === 'tarde') return conIcono ? `${icono('atardecer')} Tarde` : 'Tarde';
  if (tipo === 'manana') return conIcono ? `${icono('sol')} Mañana` : 'Mañana';
  return vacio;
}
