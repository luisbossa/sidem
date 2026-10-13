/* Definición de los 13 sistemas y los campos de cada inspección.
   Para agregar o cambiar preguntas edite solo este archivo. */
export const SISTEMAS = [
  {
    id: 'incendios',
    nombre: 'Supresión Contra Incendios',
    icono: 'llama',
    colores: { tema: '#b91c1c', oscuro: '#7f1d1d', borde: '#991b1b', fondo: '#fef2f2', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: 'Motor diésel y sistema principal',
        campos: [
          { id: 'nivelDiesel', label: 'Nivel de diésel', tipo: 'text', placeholder: 'Ej. 1/4, 1/2, 3/4 o lleno', ayuda: 'Fracción observada en tanque' },
          { id: 'horasMotor', label: 'Horas de funcionamiento del motor', tipo: 'text', unidad: 'horas' },
          { id: 'temperaturaMotor', label: 'Temperatura del motor', tipo: 'text', unidad: '°C' },
          { id: 'temperaturaAgua', label: 'Temperatura del agua del motor', tipo: 'text', unidad: '°C' },
          { id: 'ultimaFallaMotor', label: 'Historial de fallas: última falla registrada', tipo: 'textarea', placeholder: 'Si no existen fallas, escriba: Sin fallas registradas' }
        ]
      },
      {
        titulo: 'Sistema eléctrico y baterías',
        campos: [
          { id: 'voltajeBateria1', label: 'Voltaje de batería 1', tipo: 'text', unidad: 'V' },
          { id: 'voltajeBateria2', label: 'Voltaje de batería 2', tipo: 'text', unidad: 'V' },
          { id: 'cargadorBaterias', label: 'Funcionamiento y estado del cargador de baterías', tipo: 'verificacion' }
        ]
      },
      {
        titulo: 'Bomba jockey y presión',
        campos: [
          { id: 'horasJockey', label: 'Horas de funcionamiento bomba jockey', tipo: 'text', unidad: 'horas' },
          { id: 'presionSistema', label: 'Presión de las tuberías del sistema', tipo: 'text', unidad: 'PSI' },
          { id: 'ultimaFallaJockey', label: 'Historial de fallas de bomba jockey: última falla', tipo: 'textarea', placeholder: 'Si no existen fallas, escriba: Sin fallas registradas' },
          { id: 'bombaJockeyArr', label: 'Funcionamiento de la bomba jockey (arranque manual)', tipo: 'verificacion' }
        ]
      },
      {
        titulo: 'Verificaciones generales de cuarto de bombas',
        campos: [
          { id: 'fugasIncendio', label: 'Fugas en tuberías o válvulas', tipo: 'verificacion' },
          { id: 'limpiezaTuberiasIncendio', label: 'Limpieza de tuberías y ausencia de riesgos por aceite o combustible', tipo: 'verificacion' },
          { id: 'modoAutomaticoIncendio', label: 'Todo el sistema se encuentra en modo automático', tipo: 'verificacion' },
          { id: 'limpiezaAreaIncendio', label: 'El área se encuentra limpia', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'presionConstante',
    nombre: 'Presión Constante (Agua Potable)',
    icono: 'gota',
    colores: { tema: '#0284c7', oscuro: '#0369a1', borde: '#075985', fondo: '#f0f9ff', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: 'Almacenamiento y consumos generales',
        campos: [
          { id: 'nivelTanqueBMS', label: 'Nivel del tanque de agua según BMS', tipo: 'text', placeholder: 'Ej. 85% o m³' },
          { id: 'presionRedAgua', label: 'Presión del sistema (tubería)', tipo: 'text', unidad: 'PSI' },
          { id: 'consumoDiarioAgua', label: 'Medición de consumo diario de agua', tipo: 'text', unidad: 'm³' }
        ]
      },
      {
        titulo: 'Bombas, arranque manual y modo automático',
        campos: [
          { id: 'arranqueManualBomba1', label: 'Funcionamiento de Bomba 1 (arranque manual)', tipo: 'verificacion' },
          { id: 'arranqueManualBomba2', label: 'Funcionamiento de Bomba 2 (arranque manual)', tipo: 'verificacion' },
          { id: 'arranqueManualBomba3', label: 'Funcionamiento de Bomba 3 (arranque manual)', tipo: 'verificacion' },
          { id: 'autoBombasPresionConstante', label: 'Verificar que las bombas se encuentren en automático', tipo: 'verificacion' },
          { id: 'sonidosAnomalosBombas', label: 'Inspección auditiva de sonidos anómalos en bombas', tipo: 'verificacion' },
          { id: 'fallasVariadoresAgua', label: 'Historial de fallas (variadores de frecuencia VFD de cada bomba)', tipo: 'textarea', placeholder: 'Describa fallas o escriba: Sin fallas' }
        ]
      },
      {
        titulo: 'Integridad y orden',
        campos: [
          { id: 'fugasAguaPotable', label: 'Verificar fugas en tuberías, válvulas o bombas', tipo: 'verificacion' },
          { id: 'limpiezaAreaAgua', label: 'Verificación que la zona se encuentre limpia', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'aireMedico',
    nombre: 'Gases Médicos - Aire Médico',
    icono: 'viento',
    colores: { tema: '#fde047', oscuro: '#facc15', borde: '#ca8a04', fondo: '#fffdea', textoCabecera: '#422006' },
    paneles: [
      {
        titulo: 'Funcionamiento independiente de motores y modo de operación',
        campos: [
          { id: 'funcCompresorAireM1', label: 'Correcto funcionamiento de compresor: Motor 1 (arranque manual)', tipo: 'verificacion' },
          { id: 'funcCompresorAireM2', label: 'Correcto funcionamiento de compresor: Motor 2 (arranque manual)', tipo: 'verificacion' },
          { id: 'autoBombasAire', label: 'Verificar que las bombas se encuentren en automático', tipo: 'verificacion' }
        ]
      },
      {
        titulo: 'Parámetros operativos de aire médico',
        campos: [
          { id: 'horasCompresorM1', label: 'Horas de funcionamiento: Motor 1', tipo: 'text', unidad: 'horas' },
          { id: 'horasCompresorM2', label: 'Horas de funcionamiento: Motor 2', tipo: 'text', unidad: 'horas' },
          { id: 'presionLineaAire', label: 'Presión de línea de aire médico', tipo: 'text', unidad: 'PSI' }
        ]
      },
      {
        titulo: 'Fugas y limpieza',
        campos: [
          { id: 'fugasAireMedico', label: 'Revisión que no hayan fugas en tuberías, válvulas o mangueras', tipo: 'verificacion' },
          { id: 'limpiezaAireMedico', label: 'Verificar la limpieza de la zona', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'vacioMedico',
    nombre: 'Gases Médicos - Bomba de Vacío',
    icono: 'manometro',
    colores: { tema: '#e5e7eb', oscuro: '#d1d5db', borde: '#6b7280', fondo: '#f3f4f6', textoCabecera: '#111827' },
    paneles: [
      {
        titulo: 'Funcionamiento independiente de motores y modo de operación',
        campos: [
          { id: 'funcBombaVacioM1', label: 'Correcto funcionamiento de bomba de vacío: Motor 1 (arranque manual)', tipo: 'verificacion' },
          { id: 'funcBombaVacioM2', label: 'Correcto funcionamiento de bomba de vacío: Motor 2 (arranque manual)', tipo: 'verificacion' },
          { id: 'autoBombasVacio', label: 'Verificar que las bombas de vacío se encuentren en automático', tipo: 'verificacion' }
        ]
      },
      {
        titulo: 'Horas de servicio y presión de vacío',
        campos: [
          { id: 'horasVacioM1', label: 'Horas de funcionamiento: Motor 1 vacío', tipo: 'text', unidad: 'horas' },
          { id: 'horasVacioM2', label: 'Horas de funcionamiento: Motor 2 vacío', tipo: 'text', unidad: 'horas' },
          { id: 'presionVacio', label: 'Presión de vacío', tipo: 'text', unidad: '-In/Hg' }
        ]
      },
      {
        titulo: 'Estanqueidad y limpieza de sala',
        campos: [
          { id: 'fugasVacio', label: 'Revisión que no hayan fugas en tuberías, válvulas o mangueras de vacío', tipo: 'verificacion' },
          { id: 'limpiezaVacio', label: 'Verificar la limpieza de la zona', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'manifoldOxigeno',
    nombre: 'Banco de Gases (Manifold de Oxígeno)',
    icono: 'manifoldOxigeno',
    colores: { tema: '#22a06b', oscuro: '#22a06b', borde: '#16845a', fondo: '#ecfdf5', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: 'Manifold de Oxígeno',
        campos: [
          { id: 'funcManifoldO2', label: 'Verificar el correcto funcionamiento del manifold', tipo: 'verificacion' },
          { id: 'presionBancoIzqO2', label: 'Presión del banco izquierdo', tipo: 'text', unidad: 'PSI' },
          { id: 'presionBancoDerO2', label: 'Presión del banco derecho', tipo: 'text', unidad: 'PSI' },
          { id: 'presionManifoldO2', label: 'Presión del manifold', tipo: 'text', unidad: 'PSI' },
          { id: 'presionSistemaO2', label: 'Registrar la presión del sistema', tipo: 'text', unidad: 'PSI' },
          { id: 'fugasJabonO2', label: 'Verificar fugas en tuberías, válvulas, mangueras o manifold (Prueba de jabón)', tipo: 'verificacion' },
          { id: 'limpiezaManifoldO2', label: 'Verificar la limpieza de la zona', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'estacionElectrica1',
    nombre: 'Estación Eléctrica 1',
    icono: 'enchufe',
    colores: { tema: '#475569', oscuro: '#1e293b', borde: '#334155', fondo: '#f8fafc', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: '1. Parámetros de Tensión (Voltajes)',
        campos: [
          { id: 'voltajeVab', label: 'Voltaje Vab', tipo: 'text', unidad: 'V' },
          { id: 'voltajeVbc', label: 'Voltaje Vbc', tipo: 'text', unidad: 'V' },
          { id: 'voltajeVca', label: 'Voltaje Vca', tipo: 'text', unidad: 'V' }
        ]
      },
      {
        titulo: '2. Parámetros de Corriente',
        campos: [
          { id: 'corrienteIa', label: 'Corriente Ia', tipo: 'text', unidad: 'A' },
          { id: 'corrienteIb', label: 'Corriente Ib', tipo: 'text', unidad: 'A' },
          { id: 'corrienteIc', label: 'Corriente Ic', tipo: 'text', unidad: 'A' },
          { id: 'corrienteIg', label: 'Corriente Ig', tipo: 'text', unidad: 'A' }
        ]
      },
      {
        titulo: '3. Parámetros de Potencia',
        campos: [
          { id: 'potenciaFaseA', label: 'Potencia de la fase A', tipo: 'text', unidad: 'kW' },
          { id: 'potenciaFaseB', label: 'Potencia de la fase B', tipo: 'text', unidad: 'kW' },
          { id: 'potenciaFaseC', label: 'Potencia de la fase C', tipo: 'text', unidad: 'kW' }
        ]
      },
      {
        titulo: '4. Protecciones y estado general',
        campos: [
          { id: 'breakerTransferencia', label: 'Verificar que el breaker de la transferencia esté cerrado', tipo: 'verificacion' },
          { id: 'eventosSpdEE1', label: 'Registrar los eventos del supresor de transientes (SPDs)', tipo: 'text', placeholder: 'Cantidad de eventos o condición' },
          { id: 'limpiezaEE1', label: 'Verificar la limpieza de la zona', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'subestacion2',
    nombre: 'Subestación Eléctrica 2',
    icono: 'controles',
    colores: { tema: '#334155', oscuro: '#0f172a', borde: '#1e293b', fondo: '#f1f5f9', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: 'Tableros de Transferencia Automática (ATS)',
        campos: [
          { id: 'tableroAtsEq', label: 'Verificar que el tablero ATS-EQ se encuentre en estado normal', tipo: 'verificacion' },
          { id: 'tableroAtsCr', label: 'Verificar que el tablero ATS-CR se encuentre en estado normal', tipo: 'verificacion' },
          { id: 'tableroAtsSv', label: 'Verificar que el tablero ATS-SV se encuentre en estado normal', tipo: 'verificacion' }
        ]
      },
      {
        titulo: 'UPS y supresores de transientes',
        campos: [
          { id: 'eventosSpdSub2', label: 'Registrar los eventos del supresor de transientes (SPDs)', tipo: 'text', placeholder: 'Eventos registrados' },
          { id: 'voltajeBateriasUpsSub2', label: 'Registrar el voltaje de las baterías de la UPS', tipo: 'text', unidad: 'V' },
          { id: 'historialFallasUpsSub2', label: 'Verificar el historial de fallas de la UPS', tipo: 'textarea', placeholder: 'Alarmas registradas o "Sin fallas"' },
          { id: 'limpiezaSub2', label: 'Verificar la limpieza de la zona', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'generador',
    nombre: 'Generador Eléctrico',
    icono: 'engranaje',
    colores: { tema: '#475569', oscuro: '#1e293b', borde: '#334155', fondo: '#f8fafc', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: 'Motor diésel de emergencia',
        campos: [
          { id: 'nivelDieselGen', label: 'Registrar el nivel de diésel', tipo: 'text', placeholder: 'Ej. 1/4, 1/2, 3/4 o lleno', ayuda: 'Fracción observada en tanque' },
          { id: 'horasGenerador', label: 'Registrar las horas de funcionamiento del generador', tipo: 'text', unidad: 'horas' },
          { id: 'cantidadArranquesGen', label: 'Registrar la cantidad de arranques', tipo: 'text' },
          { id: 'calentadorCamisas', label: 'Revisar el funcionamiento del calentador de camisas', tipo: 'verificacion' },
          { id: 'historialFallasGen', label: 'Verificar el historial de fallas', tipo: 'textarea', placeholder: 'Fallas o "Sin fallas"' }
        ]
      },
      {
        titulo: 'Sistemas eléctricos y contorno',
        campos: [
          { id: 'voltajeBat1Gen', label: 'Registrar el voltaje de la batería', tipo: 'text', unidad: 'V' },
          { id: 'puertasCerradasGen', label: 'Verificar que todas las puertas estén cerradas', tipo: 'verificacion' },
          { id: 'modoAutomaticoGen', label: 'Verificar que el sistema se encuentre en automático', tipo: 'verificacion' },
          { id: 'sinDerramesAceiteGen', label: 'Verificar que no hayan derrames de aceites', tipo: 'verificacion' },
          { id: 'limpiezaGen', label: 'Verificar la limpieza de la zona', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'upsEmergencias',
    nombre: 'UPS en Emergencias',
    icono: 'bateria',
    colores: { tema: '#475569', oscuro: '#1e293b', borde: '#334155', fondo: '#f8fafc', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: 'UPS de Emergencias Médicas',
        campos: [
          { id: 'voltajeBateriasUpsEmerg', label: 'Registrar el voltaje de las baterías', tipo: 'text', unidad: 'V' },
          { id: 'eventosSpdUpsEmerg', label: 'Registrar los eventos del supresor de transientes SPDs', tipo: 'text', placeholder: 'Cantidad o condición' },
          { id: 'historialFallasUpsEmerg', label: 'Verificar el historial de fallas', tipo: 'textarea', placeholder: 'Eventos o "Sin fallas"' },
          { id: 'limpiezaUpsEmerg', label: 'Verificar la limpieza de la zona', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'aguaHelada',
    nombre: 'Bombas de Agua Helada',
    icono: 'copo',
    colores: { tema: '#0891b2', oscuro: '#155e75', borde: '#0e7490', fondo: '#ecfeff', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: 'Sistema de Circulación de Agua Helada',
        campos: [
          { id: 'funcBombasHelada', label: 'Verificación del funcionamiento de las bombas', tipo: 'verificacion' },
          { id: 'historialFallasVfdHelada', label: 'Verificar el historial de fallas de los variadores', tipo: 'textarea', placeholder: 'Estado de variadores o "Sin fallas"' },
          { id: 'limpiezaAguaHelada', label: 'Verificar la limpieza de la zona', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'aireInstrumental',
    nombre: 'Manifold de Aire Instrumental',
    icono: 'manifoldAire',
    colores: { tema: '#c24141', oscuro: '#991b1b', borde: '#b91c1c', fondo: '#fef2f2', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: 'Manifold de Aire Instrumental',
        campos: [
          { id: 'funcManifoldInstr', label: 'Verificar el funcionamiento del manifold', tipo: 'verificacion' },
          { id: 'presionBancoIzqInstr', label: 'Registrar la presión del banco izquierdo', tipo: 'text', unidad: 'PSI' },
          { id: 'presionBancoDerInstr', label: 'Registrar la presión del banco derecho', tipo: 'text', unidad: 'PSI' },
          { id: 'presionSistemaInstr', label: 'Registrar la presión del sistema', tipo: 'text', unidad: 'PSI' },
          { id: 'fugasAireInstr', label: 'Verificar fugas en tuberías, mangueras o válvulas', tipo: 'verificacion' },
          { id: 'limpiezaAireInstr', label: 'Verificar la limpieza de la zona', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'deteccionIncendios',
    nombre: 'Panel de Alarmas - Incendios',
    icono: 'campana',
    colores: { tema: '#dc2626', oscuro: '#991b1b', borde: '#b91c1c', fondo: '#fef2f2', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: 'Panel de Detección de Incendios y Humo',
        campos: [
          { id: 'alimentacionAcPanel', label: 'Verificar que el panel esté con alimentación eléctrica AC', tipo: 'verificacion' },
          { id: 'historialAlarmasPanel', label: 'Verificar el historial de alarmas', tipo: 'textarea', placeholder: 'Eventos en memoria o "Sin alarmas"' },
          { id: 'limpiezaPanelIncendio', label: 'Verificar la limpieza de la zona', tipo: 'verificacion' }
        ]
      }
    ]
  },
  {
    id: 'pararrayos',
    nombre: 'Sistema de Pararrayos',
    icono: 'rayo',
    colores: { tema: '#475569', oscuro: '#1e293b', borde: '#334155', fondo: '#f8fafc', textoCabecera: '#ffffff' },
    paneles: [
      {
        titulo: 'Revisión de contadores y tierras',
        campos: [
          { id: 'contadorChiller', label: 'Revisión de contador de eventos (Chiller)', tipo: 'text', placeholder: 'Lectura numérica' },
          { id: 'cableGndChiller', label: 'Revisión visual del cable bajante GND (Chiller)', tipo: 'verificacion' },
          { id: 'contadorFarmacia', label: 'Revisión de contador de eventos (Bodega Farmacia)', tipo: 'text', placeholder: 'Lectura numérica' },
          { id: 'cableGndFarmacia', label: 'Revisión visual del cable bajante GND (Bodega Farmacia)', tipo: 'verificacion' },
          { id: 'observacionesFinales', label: 'Observaciones generales del inspector', tipo: 'textarea', placeholder: 'Anotaciones finales de la inspección...' }
        ]
      }
    ]
  }
];
