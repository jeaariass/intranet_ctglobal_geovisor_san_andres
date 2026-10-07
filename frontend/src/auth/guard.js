// frontend/src/auth/guard.js
// Protege las páginas del geovisor.
// Importar en cada página protegida y llamar requireAuth() al inicio.

import { getToken, isTokenAlive, clearSession } from '../utils/token.js';
import { aplicarVisibilidad } from '../utils/permissions.js';
import { getUser, getProject } from '../utils/token.js';

const INTRANET = import.meta.env.VITE_INTRANET_URL;
const BASE     = import.meta.env.BASE_URL || '/CARMEN_DE_APICALA/';

/**
 * Verifica que haya sesión activa y devuelve el payload del token.
 * Si no hay sesión o expiró → redirige a login.
 * @returns {object|null} payload JWT
 */
export function requireAuth() {
  const token = getToken();
  if (!token || !isTokenAlive(token)) {
    logout();
    return null;
  }

  // Aplicar visibilidad de herramientas según rol
  document.addEventListener('DOMContentLoaded', () => {
    aplicarVisibilidad();
    _fillUserUI();
  });

  return getToken();
}

/** Rellena elementos con data-user-* */
function _fillUserUI() {
  const user    = getUser();
  const project = getProject();
  if (!user) return;
  document.querySelectorAll('[data-user-nombre]').forEach(el => { el.textContent = user.nombre; });
  document.querySelectorAll('[data-user-rol]').forEach(el => { el.textContent = user.rol; });
  if (project) {
    document.querySelectorAll('[data-project-nombre]').forEach(el => { el.textContent = project.nombre; });
  }
}

/**
 * Cierra sesión: notifica a la intranet y limpia localStorage.
 */
export async function logout() {
  const token = getToken();
  if (token) {
    try {
      await fetch(`${INTRANET}/api/geoauth/session-end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      });
    } catch { /* no bloquear si falla */ }
  }
  clearSession();
  window.location.href = `${BASE}login.html`;
}

/** Enlaza todos los botones de logout con modal personalizado */
export function bindLogout() {
  // Crear modal si no existe
  if (!document.getElementById('logoutModal')) {
    const modal = document.createElement('div');
    modal.id = 'logoutModal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:rgba(15,23,42,.55);backdrop-filter:blur(4px);
      display:none;align-items:center;justify-content:center;padding:1rem;
    `;
    modal.innerHTML = `
      <div style="
        background:#fff;border-radius:16px;
        width:min(380px,100%);padding:2rem 1.75rem 1.5rem;
        box-shadow:0 32px 80px rgba(0,0,0,.25);
        display:flex;flex-direction:column;align-items:center;gap:.75rem;
        animation:_lgFadeIn .18s ease;
      ">
        <div style="
          width:56px;height:56px;border-radius:50%;
          background:linear-gradient(135deg,#fee2e2,#fecaca);
          display:flex;align-items:center;justify-content:center;
          font-size:1.5rem;color:#dc2626;margin-bottom:.25rem;
        "><i class='fas fa-sign-out-alt'></i></div>

        <div style="text-align:center">
          <div style="font-size:1.05rem;font-weight:800;color:#111827;margin-bottom:.35rem">
            ¿Cerrar sesión?
          </div>
          <div style="font-size:.85rem;color:#6b7280;line-height:1.5">
            Se cerrará tu sesión activa en el GeoVisor.<br>
            Tendrás que volver a iniciar sesión para continuar.
          </div>
        </div>

        <div style="
          display:flex;gap:.6rem;width:100%;margin-top:.5rem;
        ">
          <button id="_lgCancel" style="
            flex:1;padding:.65rem;border-radius:9px;
            border:1.5px solid #e5e7eb;background:#f9fafb;
            font-size:.88rem;font-weight:700;cursor:pointer;color:#374151;
            transition:background .15s;
          ">Cancelar</button>
          <button id="_lgConfirm" style="
            flex:1;padding:.65rem;border-radius:9px;
            border:none;background:linear-gradient(135deg,#dc2626,#b91c1c);
            font-size:.88rem;font-weight:700;cursor:pointer;color:#fff;
            display:flex;align-items:center;justify-content:center;gap:.4rem;
            transition:opacity .15s;
          "><i class='fas fa-sign-out-alt'></i> Cerrar sesión</button>
        </div>
      </div>
      <style>
        @keyframes _lgFadeIn {
          from { opacity:0; transform:scale(.93) translateY(8px); }
          to   { opacity:1; transform:scale(1)  translateY(0);    }
        }
        #_lgCancel:hover  { background:#f3f4f6; }
        #_lgConfirm:hover { opacity:.88; }
      </style>
    `;
    document.body.appendChild(modal);

    // Cerrar al clic en el fondo
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.style.display = 'none';
    });

    document.getElementById('_lgCancel').addEventListener('click', () => {
      modal.style.display = 'none';
    });

    document.getElementById('_lgConfirm').addEventListener('click', () => {
      modal.style.display = 'none';
      logout();
    });
  }

  // Enlazar botones
  document.querySelectorAll('#btnLogout, [data-logout]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('logoutModal').style.display = 'flex';
    });
  });
}
