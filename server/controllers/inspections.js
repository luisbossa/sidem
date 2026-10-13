/* Controlador de inspecciones: envío del informe, revisión del ingeniero y respuesta del técnico. */
import { procesarInforme } from '../services/inspection-report.js';
import { texto, opcion, instante } from '../utils/validation.js';
import { solicitudInvalida, noEncontrado, prohibido, conflicto } from '../utils/errors.js';
import { ahoraISO, diaLocal } from '../utils/dates.js';

const TIPOS = ['manana', 'tarde'];
const NOMBRE_TIPO = { manana: 'mañana', tarde: 'tarde' };

export function crearControladorInspecciones({ inspecciones }) {
  return {
    /* El ingeniero ve todos los informes; el técnico solo los suyos */
    listar(req, res) {
      res.json(inspecciones.listar(req.usuario.rol === 'ingeniero' ? null : req.usuario.id));
    },

    buscar(req, res) {
      const informe = inspecciones.buscar(req.params.id);
      if (!informe || (req.usuario.rol !== 'ingeniero' && informe.inspectorId !== req.usuario.id)) throw noEncontrado('El informe no existe.');
      res.json(informe);
    },

    /* Envío del informe por el técnico: el servidor valida y calcula duración y resultado */
    crear(req, res) {
      const cuerpo = req.body || {};
      const tipoRecorrido = opcion(cuerpo.tipoRecorrido, 'Tipo de recorrido', TIPOS);
      const inicio = instante(cuerpo.horaInicioISO, 'Hora de inicio');
      const fin = new Date();
      if (inicio > new Date(fin.getTime() + 60000)) throw solicitudInvalida('La hora de inicio no puede estar en el futuro.');

      const fechaLocal = diaLocal(fin);
      if (inspecciones.existeRecorridoDelDia(req.usuario.id, tipoRecorrido, fechaLocal)) {
        throw conflicto(`El recorrido de la ${NOMBRE_TIPO[tipoRecorrido]} ya fue enviado hoy. Estará disponible nuevamente mañana.`, 'Recorrido ya completado');
      }

      const { valores, sistemas, resultado } = procesarInforme(cuerpo);
      const informe = inspecciones.crear({
        encabezado: {
          inspectorId: req.usuario.id,
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
      const estadoRevision = opcion(req.body?.estadoRevision, 'Resolución', ['Aprobada', 'Con observaciones']);
      const observaciones = texto(req.body?.observaciones, 'Observaciones', { max: 2000 });
      if (estadoRevision === 'Con observaciones' && !observaciones) {
        throw solicitudInvalida('Debe digitar las observaciones para el inspector si marca la inspección "Con observaciones".', 'Observación requerida');
      }
      res.json(inspecciones.registrarRevision(informe.id, { estadoRevision, ingenieroId: req.usuario.id, observaciones, fecha: ahoraISO() }));
    },

    /* Respuesta del técnico autor a una devolución */
    responder(req, res) {
      const informe = inspecciones.buscar(req.params.id);
      if (!informe || informe.inspectorId !== req.usuario.id) throw noEncontrado('El informe no existe.');
      if (informe.estadoRevision !== 'Con observaciones') throw prohibido('Solo puede responder informes devueltos con observaciones.');
      const respuesta = texto(req.body?.texto, 'Respuesta', { requerido: true, max: 2000 });
      res.json(inspecciones.registrarRespuesta(informe.id, { inspectorId: req.usuario.id, texto: respuesta, fecha: ahoraISO() }));
    }
  };
}
