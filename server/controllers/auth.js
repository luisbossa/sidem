/* Controlador de autenticación: inicio y cierre de sesión, y usuario de la sesión actual. */
import { verificarContrasena, HASH_FICTICIO } from '../security/passwords.js';
import { abrirSesion, cerrarSesion } from '../security/sessions.js';
import { verificarBloqueo, registrarFallo, limpiarIntentos } from '../security/login-attempts.js';
import { texto } from '../utils/validation.js';
import { noAutenticado, prohibido } from '../utils/errors.js';

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
    }
  };
}
