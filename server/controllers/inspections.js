/* Controlador de inspecciones: envío del informe, revisión del ingeniero y respuesta del técnico. */
import { procesarInforme } from '../services/inspection-report.js';
import { recorridoACargo } from './route-drafts.js';
import { texto, opcion } from '../utils/validation.js';
import { solicitudInvalida, noEncontrado, prohibido, conflicto } from '../utils/errors.js';
import { ahoraISO } from '../utils/dates.js';
import { puedeSupervisar, participoEnInforme } from '../../public/js/core/roles.js';

const NOMBRE_TIPO = { manana: 'mañana', tarde: 'tarde' };

export function crearControladorInspecciones({ inspecciones, recorridos }) {
  return {
    /* Quien supervisa ve todos los informes; el técnico, los que completó o inició */
    listar(req, res) {
      res.json(inspecciones.listar(puedeSupervisar(req.usuario.rol) ? null : req.usuario.id));
    },

    buscar(req, res) {
      const informe = inspecciones.buscar(req.params.id);
      if (!informe || (!puedeSupervisar(req.usuario.rol) && !participoEnInforme(informe, req.usuario.id))) throw noEncontrado('El informe no existe.');
      res.json(informe);
    },

    /* Envío del informe por el responsable del recorrido abierto: el servidor valida y calcula
       duración y resultado. Tipo, día, hora de inicio y quién lo inició salen del recorrido abierto. */
    crear(req, res) {
      const cuerpo = req.body || {};
      const recorrido = recorridoACargo(recorridos, cuerpo.recorridoId, req.usuario);
      const { tipoRecorrido, fechaLocal } = recorrido;
      const inicio = new Date(recorrido.iniciadoEnISO);
      const fin = new Date();

      if (inspecciones.existeRecorridoDelDia(tipoRecorrido, fechaLocal)) {
        throw conflicto(`El recorrido de la ${NOMBRE_TIPO[tipoRecorrido]} de ese día ya fue enviado.`, 'Recorrido ya completado');
      }

      const { valores, sistemas, resultado } = procesarInforme(cuerpo);
      const informe = inspecciones.crear({
        recorridoId: recorrido.id,
        encabezado: {
          inspectorId: req.usuario.id,
          iniciadoPorId: recorrido.iniciadoPorId === req.usuario.id ? null : recorrido.iniciadoPorId,
          tipoRecorrido,
          fechaLocal,
          horaInicio: inicio.toISOString(),
          horaFin: fin.toISOString(),
          duracionSegundos: Math.max(0, Math.floor((fin - inicio) / 1000)),
          resultado
        },
        valores,
        sistemas
      });
      res.status(201).json(informe);
    },

    /* Resolución del ingeniero: aprobar o devolver con observaciones */
    revisar(req, res) {
      const informe = inspecciones.buscar(req.params.id);
      if (!informe) throw noEncontrado('El informe no existe.');
      // Un Supervisor Técnico no revisa los recorridos en los que participó
      if (participoEnInforme(informe, req.usuario.id)) {
        throw prohibido('No puede revisar un informe de un recorrido en el que usted participó. Debe revisarlo otro ingeniero o supervisor.', 'Revisión no permitida');
      }
      const estadoRevision = opcion(req.body?.estadoRevision, 'Resolución', ['Aprobada', 'Con observaciones']);
      const observaciones = texto(req.body?.observaciones, 'Observaciones', { max: 2000 });
      if (estadoRevision === 'Con observaciones' && !observaciones) {
        throw solicitudInvalida('Debe digitar las observaciones para el inspector si marca la inspección "Con observaciones".', 'Observación requerida');
      }
      res.json(inspecciones.registrarRevision(informe.id, { estadoRevision, ingenieroId: req.usuario.id, observaciones, fecha: ahoraISO() }));
    },

    /* Respuesta a una devolución: la envía el técnico que completó el recorrido */
    responder(req, res) {
      const informe = inspecciones.buscar(req.params.id);
      if (!informe || informe.inspectorId !== req.usuario.id) throw noEncontrado('El informe no existe.');
      if (informe.estadoRevision !== 'Con observaciones') throw prohibido('Solo puede responder informes devueltos con observaciones.');
      const respuesta = texto(req.body?.texto, 'Respuesta', { requerido: true, max: 2000 });
      res.json(inspecciones.registrarRespuesta(informe.id, { inspectorId: req.usuario.id, texto: respuesta, fecha: ahoraISO() }));
    }
  };
}
