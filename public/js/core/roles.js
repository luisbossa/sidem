/* Roles y permisos. Lo usan el navegador y el servidor (server/ importa este archivo),
   así la regla de quién puede hacer qué está en un solo lugar.
   - inspector:  hace recorridos y responde las observaciones de sus informes.
   - ingeniero:  revisa informes, gestiona usuarios, rol semanal y ajustes.
   - supervisor: Supervisor Técnico; puede hacer las dos cosas, pero no revisa
                 informes de recorridos en los que participó. */
export const ROLES = ['inspector', 'ingeniero', 'supervisor'];

export const puedeInspeccionar = rol => rol === 'inspector' || rol === 'supervisor';
export const puedeSupervisar = rol => rol === 'ingeniero' || rol === 'supervisor';

/* Quien inició o completó un recorrido no revisa su propio informe */
export const participoEnInforme = (informe, usuarioId) =>
  Boolean(informe) && (informe.inspectorId === usuarioId || informe.iniciadoPorId === usuarioId);

export const puedeRevisarInforme = (usuario, informe) =>
  Boolean(usuario) && puedeSupervisar(usuario.rol) && !participoEnInforme(informe, usuario.id);

/* Presentación de cada rol: etiqueta, clase del distintivo, estado de la barra superior y vista inicial */
export const PERFILES = {
  inspector: { rolTexto: 'Técnico Inspector', rolCorto: 'Técnico', rolClase: 'role-badge-inspector', estado: 'Inspector activo', vistaInicial: 'inicio' },
  ingeniero: { rolTexto: 'Ingeniero Supervisor', rolCorto: 'Ingeniero', rolClase: 'role-badge-engineer', estado: 'Supervisor activo', vistaInicial: 'dashboard' },
  supervisor: { rolTexto: 'Supervisor Técnico', rolCorto: 'Supervisor Técnico', rolClase: 'role-badge-supervisor', estado: 'Supervisor técnico activo', vistaInicial: 'inicio' }
};
