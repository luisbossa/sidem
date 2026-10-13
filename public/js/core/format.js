/* Formato de fechas, horas y duraciones. */
import { icono } from '../ui/icons.js';

export const formatearFechaCompleta = d => new Date(d).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const formatearFechaCorta = d => new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
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
