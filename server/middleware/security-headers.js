/* Cabeceras de seguridad para todas las respuestas. */
export function cabecerasSeguridad(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  next();
}

/* Las respuestas de la API nunca se guardan en caché */
export function sinCache(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
