// frontend/src/services/api.js
// Cliente HTTP del geovisor.
//   - Peticiones al backend propio (capas, archivos, verify) → VITE_API_URL
//   - Peticiones a la intranet (layer-view, session-end, admin) → VITE_INTRANET_URL
//   - Inyecta token automáticamente en todos los headers

import { getToken, clearSession } from '../utils/token.js';

const GV_API    = import.meta.env.VITE_API_URL;      // /api/gv/carmen
const INTRANET  = import.meta.env.VITE_INTRANET_URL; // https://ctglobal.com.co/api/intranet
const BASE      = import.meta.env.BASE_URL || '/CARMEN_DE_APICALA/';

// ── Fetch con token ───────────────────────────────────────────
async function request(baseUrl, path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Sesión inválida o expirada → al login
    clearSession();
    window.location.href = `${BASE}login.html`;
    return;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error HTTP ${res.status}`);
  }

  return res.json();
}

// ── Backend del geovisor ──────────────────────────────────────
export const gvApi = {
  /** Verificar token con la intranet (vía backend) */
  verify: () => request(GV_API, '/verify'),

  /** Obtener configuración de capas WMS del proyecto */
  getLayers: () => request(GV_API, '/layers'),

  /** Listar PDFs del proyecto */
  getPdfs: () => request(GV_API, '/files/pdfs'),
};

// ── Intranet (analytics y admin) ─────────────────────────────
export const intranetApi = {
  /**
   * Reportar que el usuario consultó una capa.
   * No lanza error — el mapa no debe bloquearse por esto.
   */
  reportLayerView(layerName, layerTitle) {
    const token = getToken();
    if (!token) return;
    fetch(`${INTRANET}/api/geoauth/layer-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ layerName, layerTitle }),
    }).catch(() => {});
  },

  /** Notificar fin de sesión (llamar en logout y beforeunload) */
  sessionEnd() {
    const token = getToken();
    if (!token) return;
    fetch(`${INTRANET}/api/geoauth/session-end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => {});
  },

  // ── Admin de usuarios (llama directamente a la intranet) ──
  getUsers(proyectoId) {
    return request(INTRANET, `/api/geoprojects/${proyectoId}/users`);
  },
  createUser(proyectoId, data) {
    return request(INTRANET, `/api/geoprojects/${proyectoId}/users`, {
      method: 'POST', body: JSON.stringify(data),
    });
  },
  toggleUser(proyectoId, userId) {
    return request(INTRANET, `/api/geoprojects/${proyectoId}/users/${userId}/toggle`, {
      method: 'PATCH',
    });
  },
};
