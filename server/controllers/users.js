/* Controlador de usuarios (solo Ingeniero Supervisor). */
import { generarHash } from '../security/passwords.js';
import { cerrarSesionesDeUsuario } from '../security/sessions.js';
import { texto, opcion } from '../utils/validation.js';
import { solicitudInvalida, noEncontrado, conflicto } from '../utils/errors.js';

const ROLES = ['inspector', 'ingeniero'];
const ESTADOS = ['Activo', 'Inactivo / Vacaciones'];
export const TURNOS = ['Diurno (06:00 - 14:00)', 'Mixto (14:00 - 22:00)', 'Nocturno (22:00 - 06:00)', 'Administrativo / Guardia'];

function leerDatos(cuerpo, { esNuevo }) {
  const rol = opcion(cuerpo.rol, 'Rol', ROLES);
  const usuario = texto(cuerpo.usuario, 'Usuario', { requerido: true, max: 40 }).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) {
    throw solicitudInvalida('El usuario debe tener entre 3 y 40 caracteres: letras sin tilde, números, punto, guion o guion bajo.');
  }
  const password = typeof cuerpo.password === 'string' ? cuerpo.password.trim() : '';
  if (esNuevo && !password) throw solicitudInvalida('Debe asignar una contraseña para el nuevo usuario.', 'Contraseña obligatoria');
  if (password && password.length < 3) throw solicitudInvalida('La contraseña debe tener al menos 3 caracteres.');
  if (password.length > 128) throw solicitudInvalida('La contraseña es demasiado larga.');

  return {
    nombre: texto(cuerpo.nombre, 'Nombre completo', { requerido: true, max: 120 }),
    rol,
    usuario,
    cedula: texto(cuerpo.cedula, 'Cédula', { max: 30 }),
    turno: rol === 'ingeniero' ? 'Ingeniería / Supervisión' : opcion(cuerpo.turno, 'Turno', TURNOS),
    estado: opcion(cuerpo.estado, 'Estado', ESTADOS),
    passwordHash: password ? generarHash(password) : null
  };
}

export function crearControladorUsuarios({ usuarios, sesiones }) {
  function verificarUsuarioLibre(usuario, exceptoId = '') {
    const ocupado = usuarios.buscarOcupado(usuario, exceptoId);
    if (ocupado) throw conflicto(`El usuario "${usuario}" ya pertenece a otro profesional (${ocupado.nombre}).`, 'Usuario duplicado');
  }

  return {
    listar(req, res) {
      res.json(usuarios.listar());
    },

    crear(req, res) {
      const datos = leerDatos(req.body || {}, { esNuevo: true });
      verificarUsuarioLibre(datos.usuario);
      res.status(201).json(usuarios.crear(datos));
    },

    actualizar(req, res) {
      const actual = usuarios.buscar(req.params.id);
      if (!actual) throw noEncontrado('El usuario no existe.');
      const datos = leerDatos(req.body || {}, { esNuevo: false });
      verificarUsuarioLibre(datos.usuario, actual.id);

      // Evita que el sistema quede sin ingenieros activos (incluido desactivarse a sí mismo)
      const dejaDeSerIngenieroActivo = actual.rol === 'ingeniero' && actual.estado === 'Activo' && (datos.rol !== 'ingeniero' || datos.estado !== 'Activo');
      if (dejaDeSerIngenieroActivo && (actual.id === req.usuario.id || usuarios.contarIngenierosActivos(actual.id) === 0)) {
        throw conflicto('No puede quitar el rol de ingeniero ni desactivar su propia cuenta o la del último ingeniero activo.', 'Cambio no permitido');
      }

      const actualizado = usuarios.actualizar(actual.id, datos);
      // Si se desactiva, cambia de rol o de contraseña, se cierran sus otras sesiones
      if (datos.estado !== 'Activo' || datos.rol !== actual.rol || datos.passwordHash) {
        cerrarSesionesDeUsuario(sesiones, actual.id, actual.id === req.usuario.id ? req : null);
      }
      res.json(actualizado);
    }
  };
}
