/* Controlador de recorridos abiertos: inicio, borrador del responsable y continuación por otro técnico.
   Un recorrido abierto solo lo modifica su responsable. Si el ingeniero lo habilita, otro técnico
   puede continuarlo confirmando su usuario y contraseña; queda registrado quién lo inició. */
import { verificarContrasena, HASH_FICTICIO } from '../security/passwords.js';
import { verificarBloqueo, registrarFallo, limpiarIntentos } from '../security/login-attempts.js';
import { objeto, opcion, texto } from '../utils/validation.js';
import { solicitudInvalida, noAutenticado, prohibido, noEncontrado, conflicto } from '../utils/errors.js';
import { diaLocal } from '../utils/dates.js';

const MAX_BORRADOR = 200 * 1024;
const NOMBRE_TIPO = { manana: 'mañana', tarde: 'tarde' };

/* El navegador reconoce este código y saca al técnico de un recorrido que ya no le pertenece */
export const RECORRIDO_NO_DISPONIBLE = 'recorrido-no-disponible';

/* Recorrido abierto (por id) que el técnico de la sesión tiene a cargo; error si ya no le pertenece.
   La usan el guardado del borrador, el envío del informe y la cancelación. */
export function recorridoACargo(recorridos, id, usuario) {
  const recorrido = typeof id === 'string' && id ? recorridos.buscar(id) : null;
  if (!recorrido) {
    throw conflicto('Este recorrido ya no está abierto: fue enviado o cancelado.', 'Recorrido no disponible').conCodigo(RECORRIDO_NO_DISPONIBLE);
  }
  if (recorrido.responsableId !== usuario.id) {
    throw conflicto(`${recorrido.responsable} continuó este recorrido. Lo que registre aquí ya no se guarda.`, 'Recorrido continuado por otro técnico')
      .conCodigo(RECORRIDO_NO_DISPONIBLE);
  }
  return recorrido;
}

export function crearControladorRecorridos({ recorridos, inspecciones, ajustes, usuarios }) {
  return {
    /* Borrador del recorrido que el técnico tiene a cargo (null si no tiene) */
    leer(req, res) {
      const recorrido = recorridos.delResponsable(req.usuario.id);
      res.json(recorrido ? recorrido.datos : null);
    },

    iniciar(req, res) {
      const tipoRecorrido = opcion(req.body?.tipoRecorrido, 'Tipo de recorrido', Object.keys(NOMBRE_TIPO));
      const ahora = new Date();
      const fechaLocal = diaLocal(ahora);

      if (recorridos.delResponsable(req.usuario.id)) {
        throw conflicto('Ya tiene un recorrido en curso. Termínelo o cancélelo antes de iniciar otro.', 'Recorrido en curso');
      }
      if (inspecciones.existeRecorridoDelDia(tipoRecorrido, fechaLocal)) {
        throw conflicto(`El recorrido de la ${NOMBRE_TIPO[tipoRecorrido]} ya fue enviado hoy. Estará disponible nuevamente mañana.`, 'Recorrido ya completado');
      }
      const abierto = recorridos.delDia(tipoRecorrido, fechaLocal);
      if (abierto) {
        const continuar = ajustes.leer().permitirTomaRecorridos
          ? 'Puede continuarlo desde "Recorridos sin terminar" confirmando su usuario y contraseña.'
          : 'Solo él puede terminarlo, salvo que el ingeniero habilite que otro técnico lo continúe.';
        throw conflicto(`${abierto.responsable} ya inició el recorrido de la ${NOMBRE_TIPO[tipoRecorrido]} de hoy. ${continuar}`, 'Recorrido ya iniciado');
      }

      const recorrido = recorridos.iniciar({ tipoRecorrido, fechaLocal, usuarioId: req.usuario.id, inicio: ahora.toISOString() });
      res.status(201).json(recorrido.datos);
    },

    guardar(req, res) {
      const datos = objeto(req.body);
      if (!datos.inspeccionActiva) throw solicitudInvalida('El borrador no contiene un recorrido activo.');
      if (JSON.stringify(datos).length > MAX_BORRADOR) throw solicitudInvalida('El borrador es demasiado grande.');
      const recorrido = recorridoACargo(recorridos, datos.inspeccionActiva.id, req.usuario);
      // Los datos que fija el servidor no se pueden cambiar desde el navegador
      datos.inspeccionActiva = { ...datos.inspeccionActiva, ...recorrido.datos.inspeccionActiva };
      recorridos.guardar(recorrido.id, req.usuario.id, datos);
      res.status(204).end();
    },

    eliminar(req, res) {
      recorridos.eliminarDelResponsable(req.usuario.id);
      res.status(204).end();
    },

    /* Recorridos sin terminar (cualquier sesión), sin las respuestas registradas */
    listarAbiertos(req, res) {
      res.json(recorridos.listarAbiertos());
    },

    /* Otro técnico continúa un recorrido: exige el ajuste activo y su usuario y contraseña */
    tomar(req, res) {
      if (!ajustes.leer().permitirTomaRecorridos) {
        throw prohibido('El ingeniero no ha habilitado que un técnico continúe el recorrido de otro.', 'Opción no habilitada');
      }
      const recorrido = recorridos.buscar(req.params.id);
      if (!recorrido) throw noEncontrado('Este recorrido ya no está abierto: fue enviado o cancelado.');
      if (recorrido.responsableId === req.usuario.id) throw conflicto('Este recorrido ya está a su cargo.', 'Recorrido en curso');
      if (recorridos.delResponsable(req.usuario.id)) {
        throw conflicto('Ya tiene un recorrido en curso. Termínelo o cancélelo antes de continuar otro.', 'Recorrido en curso');
      }

      // Confirmación de identidad: mismo bloqueo por intentos fallidos que el inicio de sesión
      const usuario = texto(req.body?.usuario, 'Usuario', { requerido: true, max: 60 });
      const contrasena = typeof req.body?.password === 'string' ? req.body.password : '';
      const clave = `${usuario.toLowerCase()}|${req.ip}`;
      verificarBloqueo(clave);
      const cuenta = usuarios.buscarCredenciales(usuario);
      const valida = verificarContrasena(contrasena, cuenta ? cuenta.password_hash : HASH_FICTICIO);
      if (!cuenta || !valida || cuenta.id !== req.usuario.id) {
        registrarFallo(clave);
        throw noAutenticado('Escriba su propio usuario y contraseña para continuar el recorrido.', 'Credenciales incorrectas');
      }
      limpiarIntentos(clave);

      res.json(recorridos.tomar(recorrido.id, req.usuario.id).datos);
    }
  };
}
