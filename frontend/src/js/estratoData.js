// /js/estratoData.js
// Servicio simple para PRE-CARGAR y cachear el GeoJSON de Dos_quebradas:terreno_manzan.
// Se dispara la descarga apenas se importa este archivo.
// No depende del mapa (descarga en EPSG:4326). Otros módulos reproyectan si lo necesitan.

import { GEOSERVER_PATH } from './config.js';

let _status = 'idle';          // 'idle' | 'loading' | 'ready' | 'error'
let _json = null;              // GeoJSON puro (EPSG:4326)
let _error = null;
let _updatedAt = null;
let _promise = null;
const _subs = new Set();       // listeners de estado

function _emit() {
  for (const fn of _subs) {
    try { fn({ status: _status, updatedAt: _updatedAt, error: _error }); } catch {}
  }
}

async function _fetchNow() {
  const url = `${GEOSERVER_PATH}/wfs?service=WFS&version=1.1.0&request=GetFeature`
    + `&typeName=Dos_quebradas:terreno_manzan`
    + `&outputFormat=application/json`
    + `&srsName=EPSG:4326`;

  _status = 'loading'; _error = null; _emit();
  try {
    const rsp = await fetch(url);
    if (!rsp.ok) throw new Error(`WFS HTTP ${rsp.status}`);
    _json = await rsp.json();
    _status = 'ready';
    _updatedAt = new Date();
    _emit();
    return _json;
  } catch (e) {
    _status = 'error';
    _error = e;
    _emit();
    throw e;
  }
}

// Arranca la descarga apenas se importa este módulo
function ensureStarted() {
  if (!_promise) _promise = _fetchNow();
  return _promise;
}

// API pública
export const EstratoData = {
  // comienza (si no comenzó) y devuelve la misma promesa compartida
  ready: () => ensureStarted(),

  // fuerza refresco (nueva promesa)
  refresh: async () => {
    _promise = _fetchNow();
    return _promise;
  },

  // devuelve el último JSON (o null si aún no)
  getJson: () => _json,

  // estado actual
  getStatus: () => _status,

  // suscripción a cambios de estado
  onStatus: (fn) => { _subs.add(fn); return () => _subs.delete(fn); },
};
  
// kick-off inmediato
ensureStarted();
