/* Controlador del recorrido en curso (borrador del técnico). */
import { objeto } from '../utils/validation.js';
import { solicitudInvalida } from '../utils/errors.js';

const MAX_BORRADOR = 200 * 1024;

export function crearControladorRecorridos({ recorridos }) {
  return {
    leer(req, res) {
      res.json(recorridos.leer(req.usuario.id));
    },

    guardar(req, res) {
      const datos = objeto(req.body);
      if (!datos.inspeccionActiva) throw solicitudInvalida('El borrador no contiene un recorrido activo.');
      if (JSON.stringify(datos).length > MAX_BORRADOR) throw solicitudInvalida('El borrador es demasiado grande.');
      recorridos.guardar(req.usuario.id, datos);
      res.status(204).end();
    },

    eliminar(req, res) {
      recorridos.eliminar(req.usuario.id);
      res.status(204).end();
    }
  };
}
