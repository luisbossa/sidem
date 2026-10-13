/* Modelo Cancelaciones: recorridos cancelados con su justificación. */
import crypto from 'node:crypto';
import { enTransaccion } from '../db/connection.js';

const SELECT = `
  SELECT c.id, c.inspector_id AS inspectorId, u.nombre AS inspector, c.tipo_recorrido AS tipoRecorrido,
         c.hora_inicio AS horaInicioISO, c.fecha_cancelacion AS fechaCancelacionISO,
         c.duracion_segundos AS duracionSegundos, c.justificacion, c.sistemas_iniciados AS sistemasIniciados
  FROM cancelaciones c JOIN usuarios u ON u.id = c.inspector_id`;

const convertir = fila => ({
  ...fila,
  tipoRecorrido: fila.tipoRecorrido || '',
  sistemasIniciados: JSON.parse(fila.sistemasIniciados || '[]')
});

export class Cancelaciones {
  constructor(db) {
    this.db = db;
  }

  /* inspectorId = null → todas (ingeniero) */
  listar(inspectorId = null) {
    const filas = inspectorId
      ? this.db.prepare(`${SELECT} WHERE c.inspector_id = ? ORDER BY c.fecha_cancelacion DESC`).all(inspectorId)
      : this.db.prepare(`${SELECT} ORDER BY c.fecha_cancelacion DESC`).all();
    return filas.map(convertir);
  }

  /* Registra la cancelación y descarta el borrador del técnico en una sola transacción */
  crear({ inspectorId, tipoRecorrido, horaInicio, fechaCancelacion, duracionSegundos, justificacion, sistemasIniciados }) {
    const id = 'canc-' + crypto.randomUUID();
    enTransaccion(this.db, () => {
      this.db.prepare(`
        INSERT INTO cancelaciones (id, inspector_id, tipo_recorrido, hora_inicio, fecha_cancelacion, duracion_segundos, justificacion, sistemas_iniciados)
        VALUES (:id, :inspectorId, :tipoRecorrido, :horaInicio, :fechaCancelacion, :duracionSegundos, :justificacion, :sistemasIniciados)`)
        .run({ id, inspectorId, tipoRecorrido, horaInicio, fechaCancelacion, duracionSegundos, justificacion, sistemasIniciados: JSON.stringify(sistemasIniciados) });
      this.db.prepare('DELETE FROM recorridos_en_curso WHERE usuario_id = ?').run(inspectorId);
    });
    return convertir(this.db.prepare(`${SELECT} WHERE c.id = ?`).get(id));
  }
}
