/* Validación de datos de entrada. Cada función devuelve el valor limpio o lanza un error 400. */
import { solicitudInvalida } from './errors.js';

/* Texto recortado. requerido=true exige contenido; max limita la longitud. */
export function texto(valor, nombre, { requerido = false, max = 500 } = {}) {
  const limpio = typeof valor === 'string' ? valor.trim() : (valor === undefined || valor === null ? '' : String(valor).trim());
  if (requerido && !limpio) throw solicitudInvalida(`El campo "${nombre}" es obligatorio.`);
  if (limpio.length > max) throw solicitudInvalida(`El campo "${nombre}" admite como máximo ${max} caracteres.`);
  return limpio;
}

export function opcion(valor, nombre, permitidas) {
  if (!permitidas.includes(valor)) throw solicitudInvalida(`El valor de "${nombre}" no es válido.`);
  return valor;
}

/* Día AAAA-MM-DD válido */
export function dia(valor, nombre) {
  const t = texto(valor, nombre, { requerido: true, max: 10 });
  const fecha = new Date(t + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== t) {
    throw solicitudInvalida(`La fecha "${nombre}" no es válida.`);
  }
  return t;
}

/* Fecha y hora ISO 8601 */
export function instante(valor, nombre) {
  const t = texto(valor, nombre, { requerido: true, max: 40 });
  const fecha = new Date(t);
  if (Number.isNaN(fecha.getTime())) throw solicitudInvalida(`La fecha "${nombre}" no es válida.`);
  return fecha;
}

export function objeto(valor) {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
}

export function arregloDeTextos(valor, max = 50) {
  return Array.isArray(valor) ? valor.filter(v => typeof v === 'string').slice(0, max) : [];
}
