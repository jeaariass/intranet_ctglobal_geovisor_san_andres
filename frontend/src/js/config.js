// frontend/src/js/config.js
export const GEOSERVER_PATH = (() => {
  // En dev: Vite proxy redirige /geoserver → http://200.7.107.14:8080/geoserver
  // En producción: Nginx hace lo mismo
  // NUNCA usar la URL directa desde el navegador → CORS bloqueado

  // Del login (si ya está autenticado)
  try {
    const project = JSON.parse(localStorage.getItem('ctg_project') || '{}');
    if (project.geoserver_url) {
      // Convertir URL absoluta a ruta relativa para pasar por el proxy
      return project.geoserver_url
        .replace(/^https?:\/\/[^/]+/, '')  // quita http://host:puerto
        || '/geoserver';
    }
  } catch {}

  // Fallback: ruta relativa que pasa por el proxy de Vite / Nginx
  return '/geoserver';
})();