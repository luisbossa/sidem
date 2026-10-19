/* Controlador de usuarios (Ingeniero Supervisor y Supervisor Técnico). */
import { generarHash } from '../security/passwords.js';
import { cerrarSesionesDeUsuario } from '../security/sessions.js';
import { texto, opcion } from '../utils/validation.js';
import { solicitudInvalida, noEncontrado, conflicto } from '../utils/errors.js';
import { diaLocal } from '../utils/dates.js';
import { ROLES, puedeInspeccionar, puedeSupervisar } from '../../public/js/core/roles.js';

const ESTADOS = ['Activo', 'Inactivo / Vacaciones'];
const TURNOS = ['Diurno (06:00 - 14:00)', 'Mixto (14:00 - 22:00)', 'Nocturno (22:00 - 06:00)', 'Administrativo / Guardia'];
const TURNO_INGENIERO = 'Ingeniería / Supervisión';

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
    // El formulario ya no pide el turno: es opcional (null = sin indicar)
    turno: rol === 'ingeniero' ? TURNO_INGENIERO : (cuerpo.turno ? opcion(cuerpo.turno, 'Turno', TURNOS) : null),
    estado: opcion(cuerpo.estado, 'Estado', ESTADOS),
    passwordHash: password ? generarHash(password) : null
  };
}

export function crearControladorUsuarios({ usuarios, sesiones }) {
  function verificarUsuarioLibre(usuario, exceptoId = '') {
    const ocupado = usuarios.buscarOcupado(usuario, exceptoId);
    if (ocupado) throw conflicto(`El usuario "${usuario}" ya pertenece a otro profesional (${ocupado.nombre}).`, 'Usuario duplicado');
  }

  /* Semanas del rol de hoy en adelante o un recorrido en curso impiden eliminarlo o quitarle los recorridos */
  function verificarSinPendientes(usuario, accion) {
    const semanas = usuarios.semanasPendientes(usuario.id, diaLocal());
    if (semanas > 0) {
      throw conflicto(`${usuario.nombre} tiene ${semanas} semana(s) del rol semanal asignadas desde hoy en adelante. Reasígnelas a otro técnico antes de ${accion}.`, 'Tiene semanas asignadas');
    }
    if (usuarios.tieneRecorridoAbierto(usuario.id)) {
      throw conflicto(`${usuario.nombre} tiene un recorrido en curso. Debe enviarlo o cancelarlo, o que otro técnico lo continúe, antes de ${accion}.`, 'Tiene un recorrido en curso');
    }
  }

  return {
    listar(req, res) {
      res.json(usuarios.listar());
    },

    crear(req, res) {
      const datos = leerDatos(req.body || {}, { esNuevo: true });
      verificarUsuarioLibre(datos.usuario);
      res.status(201).json(usuarios.crear({ ...datos, turno: datos.turno ?? '' }));
    },

    actualizar(req, res) {
      const actual = usuarios.buscar(req.params.id);
      if (!actual) throw noEncontrado('El usuario no existe.');
      const datos = leerDatos(req.body || {}, { esNuevo: false });
      verificarUsuarioLibre(datos.usuario, actual.id);
      // Sin turno indicado se conserva el que tenía (salvo el de ingeniero, si deja de serlo)
      if (datos.turno === null) datos.turno = actual.turno === TURNO_INGENIERO ? '' : actual.turno;

      // Evita que el sistema quede sin nadie que revise (incluido quitarse ese permiso a sí mismo)
      const supervisaba = puedeSupervisar(actual.rol) && actual.estado === 'Activo';
      const dejaDeSupervisar = supervisaba && (!puedeSupervisar(datos.rol) || datos.estado !== 'Activo');
      if (dejaDeSupervisar && (actual.id === req.usuario.id || usuarios.contarSupervisoresActivos(actual.id) === 0)) {
        throw conflicto('No puede quitarse a sí mismo el permiso de revisión ni desactivar su propia cuenta, ni dejar el sistema sin ingenieros o supervisores técnicos activos.', 'Cambio no permitido');
      }
      // Si deja de hacer recorridos, no puede quedar a cargo de uno ni con semanas del rol pendientes
      if (puedeInspeccionar(actual.rol) && !puedeInspeccionar(datos.rol)) verificarSinPendientes(actual, 'cambiarle el rol');

      const actualizado = usuarios.actualizar(actual.id, datos);
      // Si se desactiva, cambia de rol o de contraseña, se cierran sus otras sesiones
      if (datos.estado !== 'Activo' || datos.rol !== actual.rol || datos.passwordHash) {
        cerrarSesionesDeUsuario(sesiones, actual.id, actual.id === req.usuario.id ? req : null);
      }
      res.json(actualizado);
    },

    /* Elimina un usuario conservando su historial (ver Usuarios.eliminar) */
    eliminar(req, res) {
      const usuario = usuarios.buscar(req.params.id);
      if (!usuario) throw noEncontrado('El usuario no existe.');
      if (usuario.id === req.usuario.id) throw conflicto('No puede eliminar su propia cuenta.', 'Eliminación no permitida');
      if (puedeSupervisar(usuario.rol) && usuario.estado === 'Activo' && usuarios.contarSupervisoresActivos(usuario.id) === 0) {
        throw conflicto('No puede eliminar al último ingeniero o supervisor técnico activo.', 'Eliminación no permitida');
      }
      verificarSinPendientes(usuario, 'eliminarlo');

      usuarios.eliminar(usuario.id);
      cerrarSesionesDeUsuario(sesiones, usuario.id);
      res.status(204).end();
    }
  };
}
