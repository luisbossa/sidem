/* Estado compartido de la aplicación.
   Los módulos ES no comparten variables globales, por eso todo el estado
   mutable vive en este objeto y se modifica como estado.propiedad = valor. */
export const estado = {
  usuarioSesion: null,

  // Recorrido en curso
  inspeccionActiva: null,
  pasoActual: 0,
  intervaloCronometro: null,
  respuestas: {},
  justificacionesSistemas: {},
  ordenRecorrido: [],
  mostrarJustificacionesPendientes: false,
  // true mientras está abierto el formulario de un sistema (para reanudar en él)
  enFormulario: false,

  // Filtros de listados
  filtroTecnicoActivo: null,
  filtroMesHistorial: 'todos',
  filtroMesInformesTecnico: 'todos',
  filtroEstadoInformesTecnico: 'todos',

  // Detalle y dashboard
  registroDetalleActivo: null,
  periodoDashboardDias: 30
};
