/* Modelo Sesiones: sesiones abiertas. Solo se guarda el hash SHA-256 del token. */
export class Sesiones {
  constructor(db) {
    this.db = db;
  }

  crear(tokenHash, usuarioId, creadaEn, expiraEn) {
    this.db.prepare('DELETE FROM sesiones WHERE expira_en <= ?').run(creadaEn);
    this.db.prepare('INSERT INTO sesiones (token_hash, usuario_id, creada_en, expira_en) VALUES (?, ?, ?, ?)')
      .run(tokenHash, usuarioId, creadaEn, expiraEn);
  }

  /* Usuario activo dueño de una sesión vigente */
  buscarUsuario(tokenHash, ahora) {
    return this.db.prepare(`
      SELECT u.id, u.nombre, u.rol, u.usuario
      FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ? AND s.expira_en > ? AND u.estado = 'Activo'`).get(tokenHash, ahora) || null;
  }

  eliminar(tokenHash) {
    this.db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(tokenHash);
  }

  /* Cierra todas las sesiones de un usuario, salvo la indicada */
  eliminarDeUsuario(usuarioId, exceptoTokenHash = '') {
    this.db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?').run(usuarioId, exceptoTokenHash);
  }
}
