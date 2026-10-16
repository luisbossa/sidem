/* Controlador de ajustes generales (los modifica solo el ingeniero). */
import { solicitudInvalida } from '../utils/errors.js';

export function crearControladorAjustes({ ajustes }) {
  return {
    leer(req, res) {
      res.json(ajustes.leer());
    },

    guardar(req, res) {
      const valor = req.body?.permitirTomaRecorridos;
      if (typeof valor !== 'boolean') throw solicitudInvalida('Indique si se permite continuar recorridos de otro técnico.');
      res.json(ajustes.guardar({ permitirTomaRecorridos: valor }));
    }
  };
}
