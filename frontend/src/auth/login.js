// frontend/src/auth/login.js
// Lógica del formulario de login.
// Llama directamente a la intranet con la API key del proyecto.

import { saveSession } from '../utils/token.js';
import { isTokenAlive, getToken } from '../utils/token.js';

const INTRANET = import.meta.env.VITE_INTRANET_URL;
const API_KEY  = import.meta.env.VITE_PROJECT_API_KEY;
const BASE     = import.meta.env.BASE_URL || '/CARMEN_DE_APICALA/';

// Si ya hay sesión activa → ir al mapa
if (isTokenAlive(getToken())) {
  window.location.replace(`${BASE}index.html`);
}

const form       = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const pwdInput   = document.getElementById('password');
const togglePwd  = document.getElementById('togglePwd');
const errorDiv   = document.getElementById('loginError');
const btnLogin   = document.getElementById('btnLogin');
const btnText    = document.getElementById('btnLoginText');
const btnSpinner = document.getElementById('btnLoginSpinner');

// Toggle password visibility
togglePwd?.addEventListener('click', () => {
  const show = pwdInput.type === 'password';
  pwdInput.type = show ? 'text' : 'password';
  togglePwd.textContent = show ? '🙈' : '👁';
});

function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.removeAttribute('hidden');
}

function setLoading(on) {
  btnLogin.disabled        = on;
  btnText.textContent      = on ? 'Verificando…' : 'Ingresar al sistema';
  btnSpinner.style.display = on ? 'inline-block' : 'none';
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorDiv.setAttribute('hidden', '');

  const email    = emailInput.value.trim();
  const password = pwdInput.value;
  if (!email || !password) { showError('Completa todos los campos.'); return; }

  setLoading(true);
  try {
    const res = await fetch(`${INTRANET}/api/geoauth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Mensajes de error específicos de la intranet
      const msgs = {
        401: 'Correo o contraseña incorrectos.',
        403: data.error || 'Acceso no permitido para este proyecto.',
        400: 'Datos incompletos.',
      };
      showError(msgs[res.status] || data.error || 'Error al iniciar sesión.');
      return;
    }

    // Guardar sesión completa en localStorage
    saveSession(data);

    // Redirigir al mapa
    window.location.replace(`${BASE}index.html`);

  } catch {
    showError('No se pudo conectar con el servidor. Intenta de nuevo.');
  } finally {
    setLoading(false);
  }
});
