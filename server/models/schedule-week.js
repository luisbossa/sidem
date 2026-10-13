/* Modelo SemanasRol: técnico asignado a los recorridos de cada semana.
   Devuelve el nombre del técnico y de quien asignó (JOIN con usuarios). */
import crypto from 'node:crypto';

const SELECT = `
  SELECT s.id, s.inicio, s.fin, s.tecnico_id AS tecnicoId, t.nombre AS tecnico, s.notas,
         COALESCE(a.nombre, 'Ingeniería') AS asignadoPor
  FROM semanas_rol s
  JOIN usuarios t ON t.id = s.tecnico_id
  LEFT JOIN usuarios a ON a.id = s.asignado_por_id`;

export class SemanasRol {
  constructor(db) {
    this.db = db;
  }

  listar() {
    return this.db.prepare(`${SELECT} ORDER BY s.inicio`).all();
  }

  buscar(id) {
    return this.db.prepare(`${SELECT} WHERE s.id = ?`).get(id) || null;
  }

  crear({ inicio, fin, tecnicoId, notas, asignadoPorId }) {
    const id = 'sem-' + crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO semanas_rol (id, inicio, fin, tecnico_id, notas, asignado_por_id)
      VALUES (:id, :inicio, :fin, :tecnicoId, :notas, :asignadoPorId)`)
      .run({ id, inicio, fin, tecnicoId, notas, asignadoPorId });
    return this.buscar(id);
  }

  actualizar(id, { inicio, fin, tecnicoId, notas, asignadoPorId }) {
    this.db.prepare(`
      UPDATE semanas_rol SET inicio = :inicio, fin = :fin, tecnico_id = :tecnicoId, notas = :notas, asignado_por_id = :asignadoPorId
      WHERE id = :id`).run({ id, inicio, fin, tecnicoId, notas, asignadoPorId });
    return this.buscar(id);
  }

  eliminar(id) {
    return this.db.prepare('DELETE FROM semanas_rol WHERE id = ?').run(id).changes > 0;
  }
}
