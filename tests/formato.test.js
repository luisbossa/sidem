/* Pruebas del formato de fechas del navegador (public/js/core/format.js). Ejecutar: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Zona horaria del personal: en UTC-6 un día "AAAA-MM-DD" leído como UTC se corre al día anterior
process.env.TZ = 'America/Costa_Rica';
const { aFecha, formatearFechaCompleta, formatearDiaSemana, lunesDeLaSemana, sumarDias, fechaLocalISO, DIAS_SEMANA_ROL } =
  await import('../public/js/core/format.js');

test('un día AAAA-MM-DD se muestra en su fecha, sin correrse al día anterior', () => {
  assert.equal(new Date('2026-10-19').getDate(), 18, 'así fallaba antes: el lunes 19 aparecía como domingo 18');
  assert.equal(aFecha('2026-10-19').getDate(), 19);
  assert.equal(aFecha('2026-10-19').getDay(), 1, 'es lunes');
  assert.match(formatearFechaCompleta('2026-10-19'), /^lunes, 19 de octubre de 2026$/);
  assert.match(formatearDiaSemana('2026-10-23'), /^viernes/);
  // Los instantes completos (con hora) siguen igual
  assert.equal(aFecha('2026-10-19T15:00:00.000Z').toISOString(), '2026-10-19T15:00:00.000Z');
});

test('semana del rol: se ajusta al lunes y termina el viernes', () => {
  assert.equal(DIAS_SEMANA_ROL, 5);
  const casos = {
    '2026-10-19': '2026-10-19', // lunes
    '2026-10-21': '2026-10-19', // miércoles → lunes de esa semana
    '2026-10-23': '2026-10-19', // viernes
    '2026-10-24': '2026-10-26', // sábado → lunes siguiente
    '2026-10-25': '2026-10-26' // domingo → lunes siguiente
  };
  for (const [elegido, lunes] of Object.entries(casos)) {
    assert.equal(lunesDeLaSemana(elegido), lunes, elegido);
    assert.equal(aFecha(sumarDias(lunes, DIAS_SEMANA_ROL - 1)).getDay(), 5, 'el cierre es viernes');
  }
  assert.equal(sumarDias('2026-10-29', 4), '2026-11-02', 'cruza de mes');
  assert.equal(sumarDias('2026-12-28', 4), '2027-01-01', 'cruza de año');
  assert.equal(fechaLocalISO(new Date(2026, 9, 19, 23, 30)), '2026-10-19', 'de noche sigue siendo el mismo día local');
});
