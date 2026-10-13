/* Contraseñas con scrypt (incluido en Node). Formato guardado: scrypt$N$r$p$sal$hash (base64). */
import crypto from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const LONGITUD = 64;

export function generarHash(contrasena) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(contrasena, sal, LONGITUD, { N, r: R, p: P });
  return ['scrypt', N, R, P, sal.toString('base64'), hash.toString('base64')].join('$');
}

export function verificarContrasena(contrasena, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, 'base64');
  const calculado = crypto.scryptSync(contrasena, Buffer.from(salB64, 'base64'), esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(esperado, calculado);
}

/* Hash ficticio para comparar en tiempo constante cuando el usuario no existe */
export const HASH_FICTICIO = generarHash(crypto.randomBytes(12).toString('hex'));
