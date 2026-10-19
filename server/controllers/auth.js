/* Controlador de autenticación: inicio y cierre de sesión, usuario de la sesión actual
   y cambio de la contraseña propia. */
import { verificarContrasena, generarHash, HASH_FICTICIO } from '../security/passwords.js';
import { abrirSesion, cerrarSesion, cerrarSesionesDeUsuario } from '../security/sessions.js';
import { verificarBloqueo, registrarFallo, limpiarIntentos } from '../security/login-attempts.js';
import { texto } from '../utils/validation.js';
import { noAutenticado, prohibido, solicitudInvalida } from '../utils/errors.js';

export const MIN_CONTRASENA_PROPIA = 6;
const MAX_CONTRASENA = 128;

export function crearControladorAuth({ usuarios, sesiones }) {
  return {
    login(req, res) {
      const usuario = texto(req.body?.usuario, 'Usuario', { requerido: true, max: 60 });
      const contrasena = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!contrasena) throw noAutenticado('Ingrese su usuario y contraseña.', 'Datos incompletos');

      const clave = `${usuario.toLowerCase()}|${req.ip}`;
      verificarBloqueo(clave);

      const cuenta = usuarios.buscarCredenciales(usuario);
      // Se verifica siempre un hash para no revelar por el tiempo de respuesta si el usuario existe
      const valida = verificarContrasena(contrasena, cuenta ? cuenta.password_hash : HASH_FICTICIO);
      if (!cuenta || !valida) {
        registrarFallo(clave);
        throw noAutenticado('El usuario o la contraseña no coinciden con los registros.', 'Credenciales incorrectas');
      }
      if (cuenta.estado !== 'Activo') {
        throw prohibido('Este usuario se encuentra en estado inactivo o vacaciones.', 'Acceso inhabilitado');
      }

      limpiarIntentos(clave);
      abrirSesion(sesiones, res, cuenta.id);
      const { password_hash: _omitido, ...publico } = cuenta;
      res.json({ usuario: publico });
    },

    logout(req, res) {
      cerrarSesion(sesiones, req, res);
      res.status(204).end();
    },

    sesion(req, res) {
      res.json({ usuario: req.usuario });
    },

    /* Cualquier usuario cambia su propia contraseña confirmando la actual. Se cierran sus sesiones
       en otros equipos; la de este equipo sigue abierta. */
    cambiarContrasena(req, res) {
      const actual = typeof req.body?.actual === 'string' ? req.body.actual : '';
      const nueva = typeof req.body?.nueva === 'string' ? req.body.nueva : '';
      if (!actual || !nueva) throw solicitudInvalida('Escriba su contraseña actual y la nueva.', 'Datos incompletos');

      // Mismo bloqueo por intentos fallidos que el inicio de sesión
      const clave = `${req.usuario.usuario.toLowerCase()}|${req.ip}`;
      verificarBloqueo(clave);
      if (!verificarContrasena(actual, usuarios.hashContrasena(req.usuario.id))) {
        registrarFallo(clave);
        throw solicitudInvalida('La contraseña actual no es correcta.', 'Contraseña incorrecta');
      }
      limpiarIntentos(clave);

      if (nueva.trim() !== nueva) throw solicitudInvalida('La contraseña nueva no puede empezar ni terminar con espacios.');
      if (nueva.length < MIN_CONTRASENA_PROPIA) throw solicitudInvalida(`La contraseña nueva debe tener al menos ${MIN_CONTRASENA_PROPIA} caracteres.`, 'Contraseña muy corta');
      if (nueva.length > MAX_CONTRASENA) throw solicitudInvalida('La contraseña nueva es demasiado larga.');
      if (nueva === actual) throw solicitudInvalida('La contraseña nueva debe ser distinta de la actual.', 'Contraseña repetida');
      if (nueva.toLowerCase() === req.usuario.usuario.toLowerCase()) throw solicitudInvalida('La contraseña no puede ser igual a su usuario.');

      usuarios.cambiarContrasena(req.usuario.id, generarHash(nueva));
      cerrarSesionesDeUsuario(sesiones, req.usuario.id, req);
      res.status(204).end();
    }
  };
}
