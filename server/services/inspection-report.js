/* Validación de un informe de recorrido con el catálogo de sistemas compartido con el front-end.
   El servidor decide qué sistemas están completos, exige justificación a los incompletos
   y calcula el resultado; no confía en lo que calcule el navegador. */
import { SISTEMAS } from '../../public/js/data/systems.js';
import { texto, objeto, arregloDeTextos } from '../utils/validation.js';
import { solicitudInvalida } from '../utils/errors.js';

const ESTADOS_VERIFICACION = ['Conforme', 'No conforme', 'No aplica'];
const CAMPO_OPCIONAL = 'observacionesFinales';
const IDS_SISTEMAS = new Set(SISTEMAS.map(s => s.id));

/* Devuelve { valores, sistemas, resultado } listos para guardar */
export function procesarInforme(cuerpo) {
  const datos = objeto(cuerpo.datos);
  const justificaciones = objeto(cuerpo.justificacionesSistemas);
  const orden = arregloDeTextos(cuerpo.ordenRecorrido, SISTEMAS.length).filter(id => IDS_SISTEMAS.has(id));

  const valores = [];
  const sistemas = [];
  const sinResolver = [];
  let hayAnomalias = false;
  let hayJustificados = false;

  for (const sistema of SISTEMAS) {
    let completo = true;

    for (const campo of sistema.paneles.flatMap(p => p.campos)) {
      const entrada = datos[campo.id];
      const opcional = campo.id === CAMPO_OPCIONAL;

      if (campo.tipo === 'verificacion') {
        const v = objeto(entrada);
        const estado = typeof v.estado === 'string' ? v.estado : '';
        if (estado && !ESTADOS_VERIFICACION.includes(estado)) {
          throw solicitudInvalida(`Estado de verificación no válido en "${campo.label}".`);
        }
        const detalle = estado === 'No conforme' ? texto(v.detalle, campo.label, { max: 1000 }) : '';
        if (estado) valores.push({ campoId: campo.id, sistemaId: sistema.id, valor: null, verificacion: estado, detalle });
        if (estado === 'No conforme') hayAnomalias = true;
        if (!opcional && (!estado || (estado === 'No conforme' && !detalle))) completo = false;
      } else {
        const valor = typeof entrada === 'string' ? texto(entrada, campo.label, { max: 2000 }) : '';
        if (valor) valores.push({ campoId: campo.id, sistemaId: sistema.id, valor, verificacion: null, detalle: '' });
        else if (!opcional) completo = false;
      }
    }

    const justificacion = completo ? '' : texto(justificaciones[sistema.id], `Justificación de ${sistema.nombre}`, { max: 1000 });
    if (!completo && !justificacion) sinResolver.push(sistema.nombre);
    if (!completo && justificacion) hayJustificados = true;

    const posicion = orden.indexOf(sistema.id);
    if (posicion >= 0 || justificacion) {
      sistemas.push({ sistemaId: sistema.id, orden: posicion >= 0 ? posicion + 1 : null, justificacion });
    }
  }

  if (sinResolver.length) {
    throw solicitudInvalida(
      `Hay ${sinResolver.length} sistema(s) sin completar ni justificar: ${sinResolver.join(', ')}.`,
      'Informe incompleto'
    );
  }

  const resultado = hayJustificados ? 'Inspección parcial justificada' : (hayAnomalias ? 'Con anomalías' : 'Conforme');
  return { valores, sistemas, resultado };
}

export const sistemaValido = id => IDS_SISTEMAS.has(id);
