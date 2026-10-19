/* Avance de un recorrido: qué preguntas están respondidas y dónde quedó.
   Lo usan el navegador (inspection.js) y el servidor (listado de recorridos sin terminar). */
import { SISTEMAS } from '../data/systems.js';

/* Preguntas obligatorias de un sistema (las observaciones finales son opcionales) */
export const camposObligatorios = sistema =>
  sistema.paneles.flatMap(p => p.campos).filter(c => c.id !== 'observacionesFinales');

/* Una verificación necesita su estado (y el detalle si es "No conforme"); un dato, algún texto */
export function campoCompleto(campo, valor) {
  if (campo.tipo === 'verificacion') {
    return Boolean(valor && valor.estado && (valor.estado !== 'No conforme' || String(valor.detalle || '').trim()));
  }
  return Boolean(String(valor ?? '').trim());
}

/* Dónde quedó un borrador: el sistema abierto (o el último que se abrió) y su primera pregunta sin responder */
export function dondeQuedo(borrador) {
  const respuestas = borrador?.respuestas || {};
  const orden = Array.isArray(borrador?.ordenRecorrido) ? borrador.ordenRecorrido : [];
  const indice = borrador?.enFormulario && Number.isInteger(borrador.pasoActual)
    ? borrador.pasoActual
    : SISTEMAS.findIndex(s => s.id === orden[orden.length - 1]);
  const sistema = SISTEMAS[indice];
  if (!sistema) return null;
  const pendiente = camposObligatorios(sistema).find(c => !campoCompleto(c, respuestas[c.id]));
  return {
    sistemaIndice: indice,
    sistema: `${indice + 1}. ${sistema.nombre}`,
    pregunta: pendiente ? pendiente.label : null,
    enFormulario: Boolean(borrador?.enFormulario)
  };
}
