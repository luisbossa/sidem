/* Modelo RecorridosAbiertos: recorridos iniciados y aún no enviados ni cancelados.
   Hay uno de mañana y uno de tarde por día para toda la Casa de Máquinas. El responsable es quien
   lo tiene ahora: el técnico que lo inició u otro que lo continuó.
   Un recorrido que quedó sin terminar de un día anterior pasa al día de hoy: cuenta como el recorrido
   de mañana o de tarde de hoy y el informe sale con la fecha en que se completa. */
import crypto from 'node:crypto';
import { ahoraISO, diaLocal } from '../utils/dates.js';

const SELECT = `
  SELECT r.id, r.tipo_recorrido AS tipoRecorrido, r.fecha_local AS fechaLocal,
         r.iniciado_por_id AS iniciadoPorId, i.nombre AS iniciadoPor, r.iniciado_en AS iniciadoEnISO,
         r.responsable_id AS responsableId, p.nombre AS responsable,
         r.actualizado_en AS actualizadoEnISO, r.datos
  FROM recorridos_abiertos r
  JOIN usuarios i ON i.id = r.iniciado_por_id
  JOIN usuarios p ON p.id = r.responsable_id`;

/* Fila con el borrador ya convertido a objeto */
function convertir(fila) {
  if (!fila) return null;
  let datos = null;
  try { datos = JSON.parse(fila.datos); } catch { /* borrador dañado: se trata como vacío */ }
  return { ...fila, datos };
}

/* Resumen para listados: sin las respuestas del borrador */
function resumir(r) {
  const { datos, ...resto } = r;
  return { ...resto, sistemasIniciados: Array.isArray(datos?.ordenRecorrido) ? datos.ordenRecorrido.length : 0 };
}

export class RecorridosAbiertos {
  constructor(db) {
    this.db = db;
  }

  /* Pasa a hoy los recorridos abiertos de días anteriores, si el de ese tipo de hoy está libre
     (ni enviado ni abierto). Se ejecuta antes de cada lectura; si no hay nada que mover, no escribe. */
  #pasarAHoy() {
    const hoy = diaLocal();
    const atrasados = this.db.prepare('SELECT id, tipo_recorrido FROM recorridos_abiertos WHERE fecha_local < ? ORDER BY iniciado_en DESC').all(hoy);
    for (const r of atrasados) {
      const ocupado = this.db.prepare(`
        SELECT 1 FROM inspecciones WHERE tipo_recorrido = :tipo AND fecha_local = :hoy
        UNION ALL SELECT 1 FROM recorridos_abiertos WHERE tipo_recorrido = :tipo AND fecha_local = :hoy`).get({ tipo: r.tipo_recorrido, hoy });
      if (!ocupado) this.db.prepare('UPDATE recorridos_abiertos SET fecha_local = ? WHERE id = ?').run(hoy, r.id);
    }
  }

  buscar(id) {
    this.#pasarAHoy();
    return convertir(this.db.prepare(`${SELECT} WHERE r.id = ?`).get(id));
  }

  delResponsable(usuarioId) {
    this.#pasarAHoy();
    return convertir(this.db.prepare(`${SELECT} WHERE r.responsable_id = ?`).get(usuarioId));
  }

  delDia(tipoRecorrido, fechaLocal) {
    this.#pasarAHoy();
    return convertir(this.db.prepare(`${SELECT} WHERE r.tipo_recorrido = ? AND r.fecha_local = ?`).get(tipoRecorrido, fechaLocal));
  }

  listarAbiertos() {
    this.#pasarAHoy();
    return this.db.prepare(`${SELECT} ORDER BY r.iniciado_en DESC`).all().map(f => resumir(convertir(f)));
  }

  iniciar({ tipoRecorrido, fechaLocal, usuarioId, inicio }) {
    const id = 'rec-' + crypto.randomUUID();
    const datos = { inspeccionActiva: { id, tipoRecorrido, horaInicioISO: inicio, fechaISO: inicio } };
    this.db.prepare(`
      INSERT INTO recorridos_abiertos (id, tipo_recorrido, fecha_local, iniciado_por_id, iniciado_en, responsable_id, datos, actualizado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, tipoRecorrido, fechaLocal, usuarioId, inicio, usuarioId, JSON.stringify(datos), inicio);
    return this.buscar(id);
  }

  /* Solo el responsable actual puede guardar; devuelve false si ya no lo es */
  guardar(id, responsableId, datos) {
    const { changes } = this.db.prepare('UPDATE recorridos_abiertos SET datos = ?, actualizado_en = ? WHERE id = ? AND responsable_id = ?')
      .run(JSON.stringify(datos), ahoraISO(), id, responsableId);
    return changes > 0;
  }

  /* Pasa el recorrido a otro técnico */
  tomar(id, usuarioId) {
    this.db.prepare('UPDATE recorridos_abiertos SET responsable_id = ?, actualizado_en = ? WHERE id = ?').run(usuarioId, ahoraISO(), id);
    return this.buscar(id);
  }

  eliminarDelResponsable(usuarioId) {
    this.db.prepare('DELETE FROM recorridos_abiertos WHERE responsable_id = ?').run(usuarioId);
  }
}
