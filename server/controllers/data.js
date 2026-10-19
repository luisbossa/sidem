/* Controlador de datos iniciales: todo lo que la app necesita al cargar, según el rol. */
import { diaLocal } from '../utils/dates.js';
import { puedeInspeccionar, puedeSupervisar } from '../../public/js/core/roles.js';

export function crearControladorDatos({ usuarios, semanas, inspecciones, cancelaciones, recorridos, ajustes }) {
  /* Estado de los dos recorridos de hoy para toda la Casa de Máquinas */
  function recorridosDeHoy(abiertos) {
    const hoy = diaLocal();
    const enviados = inspecciones.enviadosDelDia(hoy);
    return Object.fromEntries(['manana', 'tarde'].map(tipo => {
      const enviado = enviados.find(e => e.tipoRecorrido === tipo);
      if (enviado) return [tipo, { estado: 'enviado', completadoPor: enviado.inspector, iniciadoPor: enviado.iniciadoPor || enviado.inspector }];
      const abierto = abiertos.find(a => a.tipoRecorrido === tipo && a.fechaLocal === hoy);
      if (abierto) return [tipo, { estado: 'abierto', id: abierto.id, responsable: abierto.responsable, responsableId: abierto.responsableId, iniciadoPor: abierto.iniciadoPor }];
      return [tipo, { estado: 'libre' }];
    }));
  }

  return {
    obtener(req, res) {
      const supervisa = puedeSupervisar(req.usuario.rol);
      const soloPropios = supervisa ? null : req.usuario.id;
      const abiertos = recorridos.listarAbiertos();
      res.json({
        usuario: req.usuario,
        usuarios: supervisa ? usuarios.listar() : [],
        cronograma: semanas.listar(),
        registros: inspecciones.listar(soloPropios),
        cancelaciones: cancelaciones.listar(soloPropios),
        progreso: puedeInspeccionar(req.usuario.rol) ? (recorridos.delResponsable(req.usuario.id)?.datos ?? null) : null,
        recorridosAbiertos: abiertos,
        recorridosHoy: recorridosDeHoy(abiertos),
        ajustes: ajustes.leer()
      });
    }
  };
}
