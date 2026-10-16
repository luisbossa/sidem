/* Modelo Ajustes: opciones generales que define el ingeniero. */
const VALORES_INICIALES = {
  // Si es '1', un técnico puede continuar (con su contraseña) un recorrido que otro dejó a medias
  permitir_toma_recorridos: '0'
};

export class Ajustes {
  constructor(db) {
    this.db = db;
  }

  leer() {
    const guardados = Object.fromEntries(this.db.prepare('SELECT clave, valor FROM ajustes').all().map(f => [f.clave, f.valor]));
    const valores = { ...VALORES_INICIALES, ...guardados };
    return { permitirTomaRecorridos: valores.permitir_toma_recorridos === '1' };
  }

  guardar({ permitirTomaRecorridos }) {
    this.db.prepare(`
      INSERT INTO ajustes (clave, valor) VALUES ('permitir_toma_recorridos', ?)
      ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor`).run(permitirTomaRecorridos ? '1' : '0');
    return this.leer();
  }
}
