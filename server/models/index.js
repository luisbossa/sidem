/* Crea todos los modelos sobre una misma conexión de base de datos. */
import { Usuarios } from './user.js';
import { Sesiones } from './session.js';
import { SemanasRol } from './schedule-week.js';
import { Inspecciones } from './inspection.js';
import { Cancelaciones } from './cancellation.js';
import { RecorridosAbiertos } from './route-draft.js';
import { Ajustes } from './settings.js';

export function crearModelos(db) {
  return {
    usuarios: new Usuarios(db),
    sesiones: new Sesiones(db),
    semanas: new SemanasRol(db),
    inspecciones: new Inspecciones(db),
    cancelaciones: new Cancelaciones(db),
    recorridos: new RecorridosAbiertos(db),
    ajustes: new Ajustes(db)
  };
}
