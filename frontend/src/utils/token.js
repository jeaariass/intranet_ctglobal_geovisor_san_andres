// frontend/src/utils/token.js
// Guardar, leer y decodificar el JWT de la intranet CTGlobal
// Claves de localStorage: ctg_token, ctg_session, ctg_user, ctg_project

const KEYS = {
  TOKEN:   'ctg_token',
  SESSION: 'ctg_session',
  USER:    'ctg_user',
  PROJECT: 'ctg_project',
};

export function saveSession({ token, sessionId, user, project }) {
  localStorage.setItem(KEYS.TOKEN,   token);
  localStorage.setItem(KEYS.SESSION, String(sessionId));
  localStorage.setItem(KEYS.USER,    JSON.stringify(user));
  localStorage.setItem(KEYS.PROJECT, JSON.stringify(project));
}

export function getToken()   { return localStorage.getItem(KEYS.TOKEN); }
export function getSessionId() { return localStorage.getItem(KEYS.SESSION); }

export function getUser() {
  try { return JSON.parse(localStorage.getItem(KEYS.USER)); }
  catch { return null; }
}

export function getProject() {
  try { return JSON.parse(localStorage.getItem(KEYS.PROJECT)); }
  catch { return null; }
}

/**
 * Decodifica el payload del JWT sin verificar la firma.
 * La verificación real la hace el backend.
 * @returns {object|null} payload decodificado
 */
export function decodeToken(token = getToken()) {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

/** ¿El token sigue vigente según su campo exp? */
export function isTokenAlive(token = getToken()) {
  const payload = decodeToken(token);
  if (!payload) return false;
  return payload.exp * 1000 > Date.now();
}

export function clearSession() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}
