/* Modelo Inspecciones: informes de recorrido con sus valores, sistemas y conversación.
   Arma el mismo objeto que usa el front-end:
   { id, inspector, tipoRecorrido, ..., datos, justificacionesSistemas, ordenRecorrido, historialConversacion } */
import crypto from 'node:crypto';
import { enTransaccion } from '../db/connection.js';
import { diaLocal } from '../utils/dates.js';

const SELECT = `
  SELECT i.id, i.inspector_id AS inspectorId, u.nombre AS inspector,
         i.iniciado_por_id AS iniciadoPorId, ini.nombre AS iniciadoPor, i.tipo_recorrido AS tipoRecorrido, i.fecha_local AS fechaLocal,
         i.hora_inicio AS horaInicioISO, i.hora_fin AS horaFinISO, i.duracion_segundos AS duracionSegundos,
         i.resultado, i.estado_revision AS estadoRevision, r.nombre AS ingenieroRevisor,
         i.fecha_revision AS fechaRevisionISO, i.observaciones_ingeniero AS observacionesIngeniero,
         i.respuesta_tecnico AS respuestaTecnico, i.fecha_respuesta_tecnico AS fechaRespuestaTecnicoISO
  FROM inspecciones i
  JOIN usuarios u ON u.id = i.inspector_id
  LEFT JOIN usuarios ini ON ini.id = i.iniciado_por_id
  LEFT JOIN usuarios r ON r.id = i.ingeniero_revisor_id`;

/* Instante que representa el día del recorrido (fecha_local). Suele ser la hora de inicio; si el recorrido
   se inició otro día y pasó al día siguiente, se usa la hora de fin (o el mediodía de ese día). */
function fechaDelRecorrido({ fechaLocal, horaInicioISO, horaFinISO }) {
  if (!fechaLocal) return horaInicioISO;
  for (const iso of [horaInicioISO, horaFinISO]) if (iso && diaLocal(new Date(iso)) === fechaLocal) return iso;
  const [y, m, d] = fechaLocal.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

export class Inspecciones {
  constructor(db) {
    this.db = db;
  }

  /* inspectorId = null → todas (ingeniero); con inspectorId: las que completó o inició ese técnico */
  listar(inspectorId = null) {
    const filas = inspectorId
      ? this.db.prepare(`${SELECT} WHERE i.inspector_id = ? OR i.iniciado_por_id = ? ORDER BY i.hora_inicio DESC`).all(inspectorId, inspectorId)
      : this.db.prepare(`${SELECT} ORDER BY i.hora_inicio DESC`).all();
    return this.#completar(filas);
  }

  buscar(id) {
    const fila = this.db.prepare(`${SELECT} WHERE i.id = ?`).get(id);
    return fila ? this.#completar([fila])[0] : null;
  }

  /* Hay un solo recorrido de mañana y uno de tarde por día para toda la Casa de Máquinas */
  existeRecorridoDelDia(tipoRecorrido, fechaLocal) {
    return Boolean(this.db.prepare('SELECT 1 FROM inspecciones WHERE tipo_recorrido = ? AND fecha_local = ?').get(tipoRecorrido, fechaLocal));
  }

  /* Recorridos enviados en un día, con quién los inició y quién los completó */
  enviadosDelDia(fechaLocal) {
    return this.db.prepare(`
      SELECT i.tipo_recorrido AS tipoRecorrido, u.nombre AS inspector, ini.nombre AS iniciadoPor
      FROM inspecciones i JOIN usuarios u ON u.id = i.inspector_id LEFT JOIN usuarios ini ON ini.id = i.iniciado_por_id
      WHERE i.fecha_local = ?`).all(fechaLocal);
  }

  /* Guarda el informe completo en una transacción y cierra el recorrido abierto */
  crear({ encabezado, valores, sistemas, recorridoId }) {
    const id = 'insp-' + crypto.randomUUID();
    const { inspectorId, iniciadoPorId, tipoRecorrido, fechaLocal, horaInicio, horaFin, duracionSegundos, resultado } = encabezado;
    enTransaccion(this.db, () => {
      this.db.prepare(`
        INSERT INTO inspecciones (id, inspector_id, iniciado_por_id, tipo_recorrido, fecha_local, hora_inicio, hora_fin, duracion_segundos, resultado)
        VALUES (:id, :inspectorId, :iniciadoPorId, :tipoRecorrido, :fechaLocal, :horaInicio, :horaFin, :duracionSegundos, :resultado)`)
        .run({ id, inspectorId, iniciadoPorId, tipoRecorrido, fechaLocal, horaInicio, horaFin, duracionSegundos, resultado });

      const insertarValor = this.db.prepare(`
        INSERT INTO inspeccion_valores (inspeccion_id, campo_id, sistema_id, valor, verificacion, detalle)
        VALUES (?, ?, ?, ?, ?, ?)`);
      valores.forEach(v => insertarValor.run(id, v.campoId, v.sistemaId, v.valor, v.verificacion, v.detalle));

      const insertarSistema = this.db.prepare('INSERT INTO inspeccion_sistemas (inspeccion_id, sistema_id, orden, justificacion) VALUES (?, ?, ?, ?)');
      sistemas.forEach(s => insertarSistema.run(id, s.sistemaId, s.orden, s.justificacion));

      // Las fotos que se tomaron durante el recorrido pasan al informe
      this.db.prepare('UPDATE fotos SET inspeccion_id = ?, recorrido_id = NULL WHERE recorrido_id = ?').run(id, recorridoId);
      this.db.prepare('DELETE FROM recorridos_abiertos WHERE id = ?').run(recorridoId);
    });
    return this.buscar(id);
  }

  registrarRevision(id, { estadoRevision, ingenieroId, observaciones, fecha }) {
    enTransaccion(this.db, () => {
      this.db.prepare(`
        UPDATE inspecciones
        SET estado_revision = ?, ingeniero_revisor_id = ?, fecha_revision = ?, observaciones_ingeniero = ?
        WHERE id = ?`).run(estadoRevision, ingenieroId, fecha, observaciones, id);
      if (observaciones) {
        this.db.prepare("INSERT INTO inspeccion_mensajes (inspeccion_id, autor_id, emisor_rol, texto, fecha) VALUES (?, ?, 'ingeniero', ?, ?)")
          .run(id, ingenieroId, observaciones, fecha);
      }
    });
    return this.buscar(id);
  }

  registrarRespuesta(id, { inspectorId, texto, fecha }) {
    enTransaccion(this.db, () => {
      this.db.prepare(`
        UPDATE inspecciones SET estado_revision = 'Respuesta enviada por técnico', respuesta_tecnico = ?, fecha_respuesta_tecnico = ?
        WHERE id = ?`).run(texto, fecha, id);
      this.db.prepare("INSERT INTO inspeccion_mensajes (inspeccion_id, autor_id, emisor_rol, texto, fecha) VALUES (?, ?, 'inspector', ?, ?)")
        .run(id, inspectorId, texto, fecha);
    });
    return this.buscar(id);
  }

  /* Completa cada informe con sus valores, sistemas, fotos y mensajes (4 consultas para toda la lista) */
  #completar(filas) {
    if (!filas.length) return [];
    const porId = new Map(filas.map(f => [f.id, {
      ...f,
      fechaISO: fechaDelRecorrido(f),
      datos: {},
      justificacionesSistemas: {},
      ordenRecorrido: [],
      historialConversacion: [],
      fotos: {}
    }]));
    const ids = [...porId.keys()];
    const marcas = ids.map(() => '?').join(',');

    this.db.prepare(`SELECT inspeccion_id, campo_id, valor, verificacion, detalle FROM inspeccion_valores WHERE inspeccion_id IN (${marcas})`)
      .all(...ids)
      .forEach(v => {
        porId.get(v.inspeccion_id).datos[v.campo_id] = v.verificacion ? { estado: v.verificacion, detalle: v.detalle } : v.valor;
      });

    // Fotos de cada pregunta: { campoId: [id, ...] }
    this.db.prepare(`SELECT inspeccion_id, id, campo_id FROM fotos WHERE inspeccion_id IN (${marcas}) ORDER BY creado_en`)
      .all(...ids)
      .forEach(f => {
        const fotos = porId.get(f.inspeccion_id).fotos;
        (fotos[f.campo_id] ||= []).push(f.id);
      });

    this.db.prepare(`SELECT inspeccion_id, sistema_id, orden, justificacion FROM inspeccion_sistemas WHERE inspeccion_id IN (${marcas}) ORDER BY orden`)
      .all(...ids)
      .forEach(s => {
        const r = porId.get(s.inspeccion_id);
        if (s.justificacion) r.justificacionesSistemas[s.sistema_id] = s.justificacion;
        if (s.orden !== null) r.ordenRecorrido.push(s.sistema_id);
      });

    this.db.prepare(`
      SELECT m.inspeccion_id, m.emisor_rol AS emisorRol, u.nombre AS autor, m.fecha AS fechaISO, m.texto
      FROM inspeccion_mensajes m JOIN usuarios u ON u.id = m.autor_id
      WHERE m.inspeccion_id IN (${marcas}) ORDER BY m.id`)
      .all(...ids)
      .forEach(({ inspeccion_id: id, ...mensaje }) => porId.get(id).historialConversacion.push(mensaje));

    return [...porId.values()];
  }
}
