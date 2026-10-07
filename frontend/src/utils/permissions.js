// frontend/src/utils/permissions.js
import { decodeToken } from './token.js';

export const ROLES = {
  VIEWER:     'VIEWER',
  FUNCIONARIO: 'FUNCIONARIO',  // nuevo — técnico / funcionario municipal
  EDITOR:     'EDITOR',
};

// ─────────────────────────────────────────────────────────────
// TABLA DE PERMISOS
//
// VIEWER      → consulta básica del mapa
// FUNCIONARIO → herramientas técnicas (todo menos gestión de usuarios
//               y carga de documentos al repositorio)
// EDITOR      → control total
// ─────────────────────────────────────────────────────────────
const PERMISOS = {

  VIEWER: [
    'verCapas',
    'buscarPredio',
    'medirDistancia',
    'medirArea',
    'verTablaAtributos',
    'identificarFeature',
  ],

  FUNCIONARIO: [
    'verCapas',
    'buscarPredio',
    'medirDistancia',
    'medirArea',
    'verTablaAtributos',
    'identificarFeature',
    'imprimirMapa',       // Imprimir
    'capturaCoords',      // Captura de coordenadas
    'subirArchivos',      // Cargar GeoJSON/KML/Shape al mapa
  ],

  EDITOR: [
    'verCapas',
    'buscarPredio',
    'medirDistancia',
    'medirArea',
    'verTablaAtributos',
    'identificarFeature',
    'imprimirMapa',
    'capturaCoords',
    'subirArchivos',      // Cargar GeoJSON/KML/Shape al mapa
    'subirDocumentos',    // Cargar documentos al repositorio documental
    'editarAtributos',
    'verAdminPanel',      // Gestión de usuarios (admin-users.html)
  ],

};

export function getRol() {
  const payload = decodeToken();
  return payload?.rol || ROLES.VIEWER;
}

export function puedeUsar(herramienta) {
  const rol   = getRol();
  const perms = PERMISOS[rol] || PERMISOS.VIEWER;
  return perms.includes(herramienta);
}

export function aplicarVisibilidad() {
  document.querySelectorAll('[data-permiso]').forEach(el => {
    if (!puedeUsar(el.dataset.permiso)) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  });
}