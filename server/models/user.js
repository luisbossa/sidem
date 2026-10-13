/* Modelo Usuarios: personal con acceso al sistema. La contraseña nunca sale de este modelo
   salvo en buscarCredenciales(), que usa solo el inicio de sesión. */
import crypto from 'node:crypto';
import { ahoraISO } from '../utils/dates.js';

const COLUMNAS = 'id, nombre, rol, usuario, cedula, turno, estado';

export class Usuarios {
  constructor(db) {
    this.db = db;
  }

  listar() {
    return this.db.prepare(`SELECT ${COLUMNAS} FROM usuarios ORDER BY rol DESC, nombre COLLATE NOCASE`).all();
  }

  buscar(id) {
    return this.db.prepare(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`).get(id) || null;
  }

  /* Incluye el hash de la contraseña */
  buscarCredenciales(usuario) {
    return this.db.prepare(`SELECT ${COLUMNAS}, password_hash FROM usuarios WHERE usuario = ? COLLATE NOCASE`).get(usuario) || null;
  }

  /* Otro usuario que ya tenga ese nombre de usuario */
  buscarOcupado(usuario, exceptoId = '') {
    return this.db.prepare('SELECT id, nombre FROM usuarios WHERE usuario = ? COLLATE NOCASE AND id <> ?').get(usuario, exceptoId) || null;
  }

  contarIngenierosActivos(exceptoId = '') {
    return this.db.prepare("SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'ingeniero' AND estado = 'Activo' AND id <> ?").get(exceptoId).total;
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
}
