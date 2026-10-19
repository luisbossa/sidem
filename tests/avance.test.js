/* Pruebas del avance de un recorrido (public/js/core/avance.js). Ejecutar: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dondeQuedo, campoCompleto, camposObligatorios } from '../public/js/core/avance.js';
import { SISTEMAS } from '../public/js/data/systems.js';

const incendios = SISTEMAS[0];
const preguntas = camposObligatorios(incendios);

test('campoCompleto: datos y verificaciones', () => {
  const dato = preguntas.find(c => c.tipo !== 'verificacion');
  const verificacion = preguntas.find(c => c.tipo === 'verificacion');
  assert.equal(campoCompleto(dato, ''), false);
  assert.equal(campoCompleto(dato, '  '), false);
  assert.equal(campoCompleto(dato, '3/4'), true);
  assert.equal(campoCompleto(verificacion, { estado: '', detalle: '' }), false);
  assert.equal(campoCompleto(verificacion, { estado: 'Conforme', detalle: '' }), true);
  assert.equal(campoCompleto(verificacion, { estado: 'No conforme', detalle: '' }), false, 'No conforme exige detalle');
  assert.equal(campoCompleto(verificacion, { estado: 'No conforme', detalle: 'Fuga' }), true);
  assert.ok(!preguntas.some(c => c.id === 'observacionesFinales'), 'las observaciones finales son opcionales');
});

test('dondeQuedo: el sistema abierto y su primera pregunta sin responder', () => {
  const respuestas = { [preguntas[0].id]: '3/4', [preguntas[1].id]: '120' };
  const q = dondeQuedo({ enFormulario: true, pasoActual: 0, respuestas, ordenRecorrido: [incendios.id] });
  assert.equal(q.sistemaIndice, 0);
  assert.equal(q.sistema, `1. ${incendios.nombre}`);
  assert.equal(q.pregunta, preguntas[2].label, 'sigue en la tercera pregunta');
  assert.equal(q.enFormulario, true);
});

test('dondeQuedo: en el listado, toma el último sistema que se abrió', () => {
  const ultimo = SISTEMAS[2];
  const q = dondeQuedo({ enFormulario: false, pasoActual: 0, respuestas: {}, ordenRecorrido: [SISTEMAS[0].id, ultimo.id] });
  assert.equal(q.sistema, `3. ${ultimo.nombre}`);
  assert.equal(q.pregunta, camposObligatorios(ultimo)[0].label);
  assert.equal(q.enFormulario, false);
});

test('dondeQuedo: sistema completo y borradores sin avance', () => {
  const todo = Object.fromEntries(preguntas.map(c => [c.id, c.tipo === 'verificacion' ? { estado: 'Conforme', detalle: '' } : '10']));
  assert.equal(dondeQuedo({ enFormulario: true, pasoActual: 0, respuestas: todo }).pregunta, null);
  assert.equal(dondeQuedo({ inspeccionActiva: {} }), null, 'recién iniciado: todavía no abrió ningún sistema');
  assert.equal(dondeQuedo(null), null);
  assert.equal(dondeQuedo({ enFormulario: true, pasoActual: 99 }), null, 'paso inválido');
});
