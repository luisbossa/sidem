/* Pruebas de los cálculos del Dashboard (public/js/features/dashboard/calculations.js). Ejecutar: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// storage.js registra un evento del navegador al cargarse; en Node no existe
globalThis.addEventListener ??= () => {};
const {
  extraerSerieConsumo, resumenSerie, formatoFraccionTanque, formatoNivelTanque, formatoConsumo, esConsumoDiesel,
  tieneBancos, extraerSeriesBancos, unirSeriesBancos, agruparSerieDashboard
} =
  await import('../public/js/features/dashboard/calculations.js');

/* Informes con el nivel de diésel de incendios (nivelDiesel) y del generador (nivelDieselGen), un día cada uno */
const informes = (campo, niveles) => niveles.map((nivel, i) => ({
  id: `r${i}`,
  fechaISO: new Date(2026, 9, i + 1, 8).toISOString(),
  datos: { [campo]: nivel }
}));

test('formato de fracciones de tanque', () => {
  assert.equal(formatoFraccionTanque(0.25), '1/4');
  assert.equal(formatoFraccionTanque(0.5), '1/2');
  assert.equal(formatoFraccionTanque(0.75), '3/4');
  assert.equal(formatoFraccionTanque(1), '1');
  assert.equal(formatoFraccionTanque(1.25), '1 1/4');
  assert.equal(formatoFraccionTanque(0.125), '1/8');
  assert.equal(formatoFraccionTanque(0.375), '3/8');
  assert.equal(formatoFraccionTanque(0), '0');
  assert.equal(formatoFraccionTanque(0.3), '≈ 1/4', 'redondea al octavo más cercano');
  assert.equal(formatoFraccionTanque(1 / 3), '≈ 3/8');
  assert.equal(formatoFraccionTanque(0.01), '< 1/8');
  assert.equal(formatoFraccionTanque(NaN), '—');
  assert.equal(formatoNivelTanque(1), 'lleno');
  assert.equal(formatoNivelTanque(0), 'vacío');
  assert.equal(formatoNivelTanque(0.75), '3/4');
});

for (const [campoId, campoNivel] of [['__dieselIncendiosEstimado', 'nivelDiesel'], ['__dieselGenEstimado', 'nivelDieselGen']]) {
  test(`${campoId}: lee 3/4, 1/2, lleno y porcentajes, y el consumo sale en fracción de tanque`, () => {
    assert.ok(esConsumoDiesel(campoId));
    const serie = extraerSerieConsumo(informes(campoNivel, ['lleno', '3/4', '1/2', ' 1 / 4 ', 'Lleno', '50%', '1/4']), campoId);

    // lleno→3/4, 3/4→1/2, 1/2→1/4; se recarga (no cuenta); lleno→50 %, 50 %→1/4
    assert.deepEqual(serie.map(x => x.valor), [0.25, 0.25, 0.25, 0.5, 0.25]);
    assert.deepEqual(serie.map(x => formatoConsumo(x.valor, campoId)), ['1/4', '1/4', '1/4', '1/2', '1/4']);
    assert.deepEqual(serie.map(x => `${formatoNivelTanque(x.lecturaAnterior)} → ${formatoNivelTanque(x.lecturaActual)}`),
      ['lleno → 3/4', '3/4 → 1/2', '1/2 → 1/4', 'lleno → 1/2', '1/2 → 1/4']);

    const r = resumenSerie(serie);
    assert.equal(formatoConsumo(r.total, campoId), '1 1/2', 'total del período');
    assert.equal(formatoConsumo(r.promedio, campoId), '≈ 1/4', 'promedio 0,3');
  });
}

test('diésel: se ignoran lecturas que no son un nivel válido', () => {
  const serie = extraerSerieConsumo(informes('nivelDiesel', ['3/4', 'sin dato', '5/4', '', '1/2']), '__dieselIncendiosEstimado');
  assert.deepEqual(serie.map(x => x.valor), [0.25], 'compara 3/4 con 1/2 saltando las lecturas inválidas');
});

test('los demás consumos siguen en números', () => {
  assert.equal(esConsumoDiesel('consumoDiarioAgua'), false);
  assert.equal(formatoConsumo(12.5, 'consumoDiarioAgua'), (12.5).toLocaleString('es-CR', { maximumFractionDigits: 2 }));
  const agua = extraerSerieConsumo(informes('consumoDiarioAgua', ['10', '12,5']), 'consumoDiarioAgua');
  assert.deepEqual(agua.map(x => x.valor), [10, 12.5]);
});

/* ---- Bancos de gases: izquierdo y derecho por separado ---- */

/* Informes con las presiones de los dos bancos, un día cada uno */
const informesBancos = (campoIzq, campoDer, lecturas) => lecturas.map(([izq, der], i) => ({
  id: `g${i}`,
  inspector: 'Ronald',
  fechaISO: new Date(2026, 9, i + 1, 8).toISOString(),
  datos: { [campoIzq]: izq, [campoDer]: der }
}));

for (const [campoId, campoIzq, campoDer] of [
  ['__oxigenoEstimado', 'presionBancoIzqO2', 'presionBancoDerO2'],
  ['__aireInstrumentalEstimado', 'presionBancoIzqInstr', 'presionBancoDerInstr']
]) {
  test(`${campoId}: consumo del banco izquierdo y del derecho por separado`, () => {
    assert.ok(tieneBancos(campoId));
    // Día 4: el banco izquierdo se recarga (sube) mientras el derecho sigue consumiendo
    const registros = informesBancos(campoIzq, campoDer, [
      ['2000', '2000'], ['1800', '1900'], ['1500', '1900'], ['2200', '1700'], ['2000', '1600']
    ]);
    const { izquierdo, derecho } = extraerSeriesBancos(registros, campoId);

    assert.deepEqual(izquierdo.map(x => [x.registro.id, x.valor]), [['g1', 200], ['g2', 300], ['g4', 200]], 'la recarga del izquierdo no cuenta');
    assert.deepEqual(derecho.map(x => [x.registro.id, x.valor]), [['g1', 100], ['g2', 0], ['g3', 200], ['g4', 100]]);
    assert.deepEqual(izquierdo.map(x => [x.lecturaAnterior, x.lecturaActual]), [[2000, 1800], [1800, 1500], [2200, 2000]]);

    // El total de cada informe es la suma de los dos bancos; antes la recarga del izquierdo ocultaba el consumo del derecho
    const total = extraerSerieConsumo(registros, campoId);
    assert.deepEqual(total.map(x => [x.registro.id, x.valor]), [['g1', 300], ['g2', 300], ['g3', 200], ['g4', 300]]);
    assert.equal(total.find(x => x.registro.id === 'g3').izquierdo, null, 'ese día el izquierdo no tiene consumo');
    assert.equal(total.find(x => x.registro.id === 'g3').derecho.valor, 200);
    assert.equal(resumenSerie(total).total, 1100);
    assert.deepEqual(unirSeriesBancos({ izquierdo, derecho }).map(x => x.valor), total.map(x => x.valor));

    // Agrupado por día, cada banco tiene sus propias barras
    assert.deepEqual(agruparSerieDashboard(izquierdo, 'diario').map(g => g.valor), [200, 300, 200]);
    assert.deepEqual(agruparSerieDashboard(derecho, 'mensual').map(g => g.valor), [400]);
  });
}

test('bancos: un banco sin lectura no impide calcular el otro', () => {
  const registros = informesBancos('presionBancoIzqO2', 'presionBancoDerO2', [['2000', '1000'], ['1900', ''], ['1700', '800']]);
  const { izquierdo, derecho } = extraerSeriesBancos(registros, '__oxigenoEstimado');
  assert.deepEqual(izquierdo.map(x => x.valor), [100, 200]);
  assert.deepEqual(derecho.map(x => [x.registro.id, x.valor]), [['g2', 200]], 'compara con la última lectura válida');
  assert.equal(extraerSeriesBancos(registros, 'consumoDiarioAgua'), null, 'el agua no tiene bancos');
});
