/* Datos iniciales: se cargan una sola vez, cuando la tabla de usuarios está vacía.
   Las contraseñas iniciales son "123"; cámbielas desde Gestión de usuarios. */
import { generarHash } from '../security/passwords.js';
import { ahoraISO } from '../utils/dates.js';

const USUARIOS_INICIALES = [
  { id: 'usr-1', nombre: 'Ing. Supervisor General', rol: 'ingeniero', usuario: 'ingeniero', cedula: '2-0500-0111', turno: 'Ingeniería / Supervisión' },
  { id: 'usr-2', nombre: 'Ronald Salas Herrera', rol: 'inspector', usuario: 'rsalas', cedula: '2-0789-0123', turno: 'Diurno (06:00 - 14:00)' },
  { id: 'usr-3', nombre: 'Carlos Murillo Vargas', rol: 'inspector', usuario: 'cmurillo', cedula: '2-0544-0987', turno: 'Mixto (14:00 - 22:00)' },
  { id: 'usr-4', nombre: 'Esteban Bolaños Ruiz', rol: 'inspector', usuario: 'ebolanos', cedula: '2-0671-0456', turno: 'Nocturno (22:00 - 06:00)' }
];

const ROL_SEMANAL_INICIAL = [
  { id: 'sem-1', inicio: '2026-09-07', fin: '2026-09-11', tecnico: 'usr-2', notas: 'Semana de inspección general y verificación de banco de oxígeno.' },
  { id: 'sem-2', inicio: '2026-09-14', fin: '2026-09-18', tecnico: 'usr-3', notas: 'Recorrido preventivo con enfoque en pruebas de transferencia ATS y generador.' },
  { id: 'sem-3', inicio: '2026-09-21', fin: '2026-09-25', tecnico: 'usr-4', notas: 'Supervisión de presiones en bombas de agua helada y climatización.' },
  { id: 'sem-4', inicio: '2026-09-28', fin: '2026-10-02', tecnico: 'usr-2', notas: 'Revisión mensual de pararrayos y continuidad de bajantes a tierra.' }
];

export const CONTRASENA_INICIAL = '123';

export function sembrarDatosIniciales(db, { silencioso = false } = {}) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
  if (total > 0) return false;

  const insertarUsuario = db.prepare(`
    INSERT INTO usuarios (id, nombre, rol, usuario, password_hash, cedula, turno, estado, creado_en)
    VALUES (:id, :nombre, :rol, :usuario, :hash, :cedula, :turno, 'Activo', :creado)`);
  const insertarSemana = db.prepare(`
    INSERT INTO semanas_rol (id, inicio, fin, tecnico_id, notas, asignado_por_id)
    VALUES (:id, :inicio, :fin, :tecnico, :notas, 'usr-1')`);

  db.exec('BEGIN');
  try {
    const creado = ahoraISO();
    USUARIOS_INICIALES.forEach(u => insertarUsuario.run({ ...u, hash: generarHash(CONTRASENA_INICIAL), creado }));
    ROL_SEMANAL_INICIAL.forEach(s => insertarSemana.run(s));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  if (!silencioso) {
    console.log(`[SIDEM] Base de datos nueva: se crearon ${USUARIOS_INICIALES.length} usuarios iniciales (contraseña "${CONTRASENA_INICIAL}").`);
    console.log('[SIDEM] Cambie esas contraseñas desde Gestión de usuarios.');
  }
  return true;
}
