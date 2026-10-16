/* Controlador de recorridos cancelados. */
import { sistemaValido } from '../services/inspection-report.js';
import { texto, opcion, instante, arregloDeTextos } from '../utils/validation.js';
import { solicitudInvalida } from '../utils/errors.js';
import { recorridoACargo } from './route-drafts.js';

export function crearControladorCancelaciones({ cancelaciones, recorridos }) {
  return {
    listar(req, res) {
      res.json(cancelaciones.listar(req.usuario.rol === 'ingeniero' ? null : req.usuario.id));
    },

    crear(req, res) {
      const cuerpo = req.body || {};
      // Si indica el recorrido, solo su responsable actual lo puede cancelar
      if (cuerpo.recorridoId) {
        const recorrido = recorridoACargo(recorridos, cuerpo.recorridoId, req.usuario);
        cuerpo.tipoRecorrido = recorrido.tipoRecorrido;
        cuerpo.horaInicioISO = recorrido.iniciadoEnISO;
      }
      const inicio = instante(cuerpo.horaInicioISO, 'Hora de inicio');
      const ahora = new Date();
      const justificacion = texto(cuerpo.justificacion, 'Justificación', { requerido: true, max: 500 });
      if (justificacion.length < 5) throw solicitudInvalida('Debe escribir una justificación válida.', 'Justificación obligatoria');

      res.status(201).json(cancelaciones.crear({
        inspectorId: req.usuario.id,
        tipoRecorrido: cuerpo.tipoRecorrido ? opcion(cuerpo.tipoRecorrido, 'Tipo de recorrido', ['manana', 'tarde']) : null,
        horaInicio: inicio.toISOString(),
        fechaCancelacion: ahora.toISOString(),
        duracionSegundos: Math.max(0, Math.floor((ahora - inicio) / 1000)),
        justificacion,
        sistemasIniciados: arregloDeTextos(cuerpo.sistemasIniciados).filter(sistemaValido)
      }));
    }
  };
}
