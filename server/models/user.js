/* Modelo Usuarios: personal con acceso al sistema. La contraseña nunca sale de este modelo
   salvo en buscarCredenciales() y hashContrasena(), que se usan solo para verificarla.
   Un usuario eliminado no se borra (sus informes lo referencian): queda oculto en todas las búsquedas
   de este modelo y sus registros siguen mostrando su nombre. */
import crypto from 'node:crypto';
import { ahoraISO } from '../utils/dates.js';

const COLUMNAS = 'id, nombre, rol, usuario, cedula, turno, estado';
const VIGENTE = 'eliminado_en IS NULL';

export class Usuarios {
  constructor(db) {
    this.db = db;
  }

  listar() {
    return this.db.prepare(`SELECT ${COLUMNAS} FROM usuarios WHERE ${VIGENTE} ORDER BY rol DESC, nombre COLLATE NOCASE`).all();
  }

  buscar(id) {
    return this.db.prepare(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ? AND ${VIGENTE}`).get(id) || null;
  }

  /* Incluye el hash de la contraseña */
  buscarCredenciales(usuario) {
    return this.db.prepare(`SELECT ${COLUMNAS}, password_hash FROM usuarios WHERE usuario = ? COLLATE NOCASE AND ${VIGENTE}`).get(usuario) || null;
  }

  /* Hash de la contraseña de un usuario por id (para el cambio de contraseña propio) */
  hashContrasena(id) {
    return this.db.prepare('SELECT password_hash FROM usuarios WHERE id = ?').get(id)?.password_hash || '';
  }

  cambiarContrasena(id, passwordHash) {
    this.db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  }

  /* Otro usuario que ya tenga ese nombre de usuario */
  buscarOcupado(usuario, exceptoId = '') {
    return this.db.prepare('SELECT id, nombre FROM usuarios WHERE usuario = ? COLLATE NOCASE AND id <> ?').get(usuario, exceptoId) || null;
  }

  /* Usuarios activos que pueden revisar informes (Ingeniero Supervisor o Supervisor Técnico) */
  contarSupervisoresActivos(exceptoId = '') {
    return this.db.prepare(`SELECT COUNT(*) AS total FROM usuarios WHERE rol IN ('ingeniero', 'supervisor') AND estado = 'Activo' AND id <> ? AND ${VIGENTE}`).get(exceptoId).total;
  }

  crear({ nombre, rol, usuario, passwordHash, cedula, turno, estado }) {
    const id = 'usr-' + crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO usuarios (id, nombre, rol, usuario, password_hash, cedula, turno, estado, creado_en)
      VALUES (:id, :nombre, :rol, :usuario, :passwordHash, :cedula, :turno, :estado, :creado)`)
      .run({ id, nombre, rol, usuario, passwordHash, cedula, turno, estado, creado: ahoraISO() });
    return this.buscar(id);
  }

  actualizar(id, { nombre, rol, usuario, passwordHash, cedula, turno, estado }) {
    this.db.prepare(`
      UPDATE usuarios SET nombre = :nombre, rol = :rol, usuario = :usuario, cedula = :cedula, turno = :turno, estado = :estado
      WHERE id = :id`).run({ id, nombre, rol, usuario, cedula, turno, estado });
    if (passwordHash) this.db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(passwordHash, id);
    return this.buscar(id);
  }

  /* Semanas del rol asignadas al técnico que todavía no terminaron (desde hoy en adelante) */
  semanasPendientes(id, hoy) {
    return this.db.prepare('SELECT COUNT(*) AS total FROM semanas_rol WHERE tecnico_id = ? AND fin >= ?').get(id, hoy).total;
  }

  tieneRecorridoAbierto(id) {
    return Boolean(this.db.prepare('SELECT 1 FROM recorridos_abiertos WHERE responsable_id = ?').get(id));
  }

  /* Oculta al usuario: no aparece, no puede entrar y su nombre de usuario queda libre para otra persona.
     La fila se conserva para que sus informes, cancelaciones y mensajes sigan mostrando su nombre. */
  eliminar(id) {
    this.db.prepare(`
      UPDATE usuarios SET eliminado_en = ?, estado = 'Inactivo / Vacaciones', usuario = usuario || '~eliminado~' || id
      WHERE id = ? AND ${VIGENTE}`).run(ahoraISO(), id);
  }
}
