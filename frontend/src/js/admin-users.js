// frontend/src/js/admin-users.js
// Gestión de accesos al geovisor — solo EDITOR
// Llama directamente a la API de la intranet CTGlobal

import { requireAuth, bindLogout } from '../auth/guard.js';
import { puedeUsar, aplicarVisibilidad } from '../utils/permissions.js';
import { decodeToken, getUser } from '../utils/token.js';
import { intranetApi } from '../services/api.js';

// ── 1. Verificar que sea EDITOR ───────────────────────────────
const token = requireAuth();
if (!token || !puedeUsar('verAdminPanel')) {
  alert('No tienes permiso para acceder a esta sección.');
  window.location.href = 'index.html';
  throw new Error('Sin acceso');
}

document.addEventListener('DOMContentLoaded', () => {
  aplicarVisibilidad();
  bindLogout();
  init();
});

// Obtener proyectoId del token JWT
const payload    = decodeToken();
const PROYECTO_ID = payload?.proyectoId;

// ── Referencias DOM ───────────────────────────────────────────
const tbody          = document.getElementById('usersTableBody');
const searchInput    = document.getElementById('searchInput');
const btnNewUser     = document.getElementById('btnNewUser');
const userModal      = document.getElementById('userModal');
const modalTitle     = document.getElementById('modalTitle');
const userForm       = document.getElementById('userForm');
const userIdInput    = document.getElementById('userId');
const uNombre        = document.getElementById('uNombre');
const uEmail         = document.getElementById('uEmail');
const uRol           = document.getElementById('uRol');
const uPassword      = document.getElementById('uPassword');
const uExpiresAt     = document.getElementById('uExpiresAt');
const pwdHint        = document.getElementById('pwdHint');
const modalError     = document.getElementById('modalError');
const btnModalClose  = document.getElementById('btnModalClose');
const btnModalCancel = document.getElementById('btnModalCancel');
const btnModalSave   = document.getElementById('btnModalSave');
const saveBtnText    = document.getElementById('saveBtnText');
const saveBtnSpinner = document.getElementById('saveBtnSpinner');
const countViewer    = document.getElementById('countViewer');
const countEditor    = document.getElementById('countEditor');
const countTotal     = document.getElementById('countTotal');

const ROL_CFG = {
  VIEWER:      { color: '#2563eb', bg: '#eff6ff', label: 'VIEWER' },
  FUNCIONARIO: { color: '#059669', bg: '#f0fdf4', label: 'FUNCIONARIO' },
  EDITOR:      { color: '#7c3aed', bg: '#f5f3ff', label: 'EDITOR' },
};

let allUsers = [];

// ── Formateo ─────────────────────────────────────────────────
const fmtDate = iso => iso
  ? new Date(iso).toLocaleDateString('es-CO', { dateStyle: 'short' })
  : '—';

function renderRow(u) {
  const rc  = ROL_CFG[u.rol] || { color: '#6b7280', bg: '#f3f4f6', label: u.rol };
  const exp = u.expires_at
    ? (new Date(u.expires_at) < new Date()
        ? `<span style="color:#dc2626">${fmtDate(u.expires_at)} ⚠</span>`
        : fmtDate(u.expires_at))
    : '—';
  return `
    <tr data-id="${u.id}">
      <td class="td-nombre">${u.nombre}</td>
      <td class="td-email">${u.email}</td>
      <td><span class="rol-badge" style="background:${rc.bg};color:${rc.color}">${rc.label}</span></td>
      <td><span class="estado-badge ${u.activo ? 'est-activo' : 'est-inactivo'}">
        ${u.activo ? 'Activo' : 'Inactivo'}
      </span></td>
      <td>${exp}</td>
      <td class="td-actions">
        <button class="icon-btn" data-action="edit"   title="Editar"><i class="fas fa-pen"></i></button>
        <button class="icon-btn" data-action="toggle" title="${u.activo ? 'Desactivar' : 'Activar'}">
          <i class="fas fa-${u.activo ? 'ban' : 'check-circle'}" style="color:${u.activo ? '#dc2626' : '#16a34a'}"></i>
        </button>
      </td>
    </tr>`;
}

function renderTable(list) {
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">Sin resultados</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(renderRow).join('');
}

function updateSummary(list) {
  countViewer.textContent  = list.filter(u => u.rol === 'VIEWER').length;
  countEditor.textContent  = list.filter(u => u.rol === 'EDITOR').length;
  countTotal.textContent   = list.length;
  // Mostrar FUNCIONARIO en el chip si existe
  const countFunc = list.filter(u => u.rol === 'FUNCIONARIO').length;
  const funcEl = document.getElementById('countFuncionario');
  if (funcEl) funcEl.textContent = countFunc;
}

// ── Carga ─────────────────────────────────────────────────────
async function init() {
  if (!PROYECTO_ID) {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-error">No se pudo obtener el ID del proyecto.</td></tr>';
    return;
  }
  await loadUsers();
}

async function loadUsers() {
  try {
    const data = await intranetApi.getUsers(PROYECTO_ID);
    allUsers = data.usuarios || data || [];
    renderTable(allUsers);
    updateSummary(allUsers);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="tbl-error"><i class="fas fa-exclamation-circle"></i> ${e.message}</td></tr>`;
  }
}

// ── Búsqueda ──────────────────────────────────────────────────
searchInput?.addEventListener('input', () => {
  const q = searchInput.value.toLowerCase();
  renderTable(allUsers.filter(u =>
    u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  ));
});

// ── Acciones en tabla ─────────────────────────────────────────
tbody.addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const u  = allUsers.find(x => String(x.id) === id);

  if (btn.dataset.action === 'edit') {
    openModal(u);
  }
  if (btn.dataset.action === 'toggle') {
    const accion = u.activo ? 'desactivar' : 'activar';
    if (!confirm(`¿${accion} a ${u.nombre}?`)) return;
    try {
      await intranetApi.toggleUser(PROYECTO_ID, id);
      await loadUsers();
    } catch (err) { alert(`Error: ${err.message}`); }
  }
});

// ── Modal ─────────────────────────────────────────────────────
function openModal(usuario = null) {
  hideModalError();
  userForm.reset();

  if (usuario) {
    modalTitle.textContent = 'Editar usuario';
    userIdInput.value      = usuario.id;
    uNombre.value          = usuario.nombre;
    uEmail.value           = usuario.email;
    uRol.value             = usuario.rol;
    uExpiresAt.value       = usuario.expires_at ? usuario.expires_at.split('T')[0] : '';
    uEmail.disabled        = true;
    pwdHint.style.display  = 'inline';
    uPassword.required     = false;
  } else {
    modalTitle.textContent = 'Nuevo usuario';
    userIdInput.value      = '';
    uEmail.disabled        = false;
    pwdHint.style.display  = 'none';
    uPassword.required     = true;
  }

  userModal.removeAttribute('hidden');
  uNombre.focus();
}

function closeModal() {
  userModal.setAttribute('hidden', '');
  uEmail.disabled = false;
}

function showModalError(msg) {
  modalError.textContent = msg;
  modalError.removeAttribute('hidden');
}
function hideModalError() {
  modalError.setAttribute('hidden', '');
}

btnNewUser?.addEventListener('click', () => openModal());
btnModalClose?.addEventListener('click', closeModal);
btnModalCancel?.addEventListener('click', closeModal);
userModal?.addEventListener('click', e => { if (e.target === userModal) closeModal(); });

// ── Guardar ───────────────────────────────────────────────────
userForm?.addEventListener('submit', async e => {
  e.preventDefault();
  hideModalError();

  const id       = userIdInput.value;
  const nombre   = uNombre.value.trim();
  const email    = uEmail.value.trim();
  const rol      = uRol.value;
  const password = uPassword.value;
  const expires  = uExpiresAt.value || null;

  if (!nombre) { showModalError('El nombre es obligatorio.'); return; }

  // Mostrar spinner
  btnModalSave.disabled    = true;
  saveBtnText.textContent  = 'Guardando…';
  saveBtnSpinner.removeAttribute('hidden');

  try {
    if (id) {
      const payload = { nombre, rol, expiresAt: expires };
      if (password) payload.password = password;
      await intranetApi.createUser(PROYECTO_ID, { ...payload, id }); // intranet PUT
    } else {
      if (!email)    { showModalError('El correo es obligatorio.'); return; }
      if (!password) { showModalError('La contraseña es obligatoria para nuevos usuarios.'); return; }
      await intranetApi.createUser(PROYECTO_ID, { nombre, email, password, rol, expiresAt: expires });
    }
    closeModal();
    await loadUsers();
  } catch (err) {
    showModalError(err.message);
  } finally {
    btnModalSave.disabled   = false;
    saveBtnText.textContent = 'Guardar';
    saveBtnSpinner.setAttribute('hidden', '');
  }
});
