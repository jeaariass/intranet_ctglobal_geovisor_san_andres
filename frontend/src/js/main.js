// frontend/src/js/main.js
import { requireAuth, bindLogout }       from '../auth/guard.js';
import { puedeUsar, aplicarVisibilidad } from '../utils/permissions.js';
import { intranetApi }                   from '../services/api.js';
import { getUser }                       from '../utils/token.js';

const token = requireAuth();
if (!token) throw new Error('No autenticado');

window.addEventListener('beforeunload', () => intranetApi.sessionEnd());

class EventBus {
  constructor() { this._l = {}; }
  on(e, fn)  { (this._l[e] ??= []).push(fn); }
  emit(e, d) { (this._l[e] || []).forEach(fn => fn(d)); }
}

async function bootstrap() {
  aplicarVisibilidad();
  bindLogout();

  const user = getUser();
  if (user?.nombre) {
    const el = document.getElementById('userInitials');
    if (el) el.textContent = user.nombre.charAt(0).toUpperCase();
  }

  const mapEl = document.getElementById('map');
  const ctx   = { eventBus: new EventBus(), mapEl, root: document };

  const { initMap }    = await import('./map.js');
  await initMap(ctx);

  const { initLayers } = await import('./layers.js');
  await initLayers(ctx);

  try {
    const { initPredioPanel } = await import('./predioPanel.js');
    await initPredioPanel(ctx);
  } catch (e) { console.warn('[GeoVisor] predioPanel:', e.message); }

  // ── Herramientas condicionales ────────────────────────────
  if (puedeUsar('identificarFeature')) {
    try {
      const { initIdentify } = await import('./identify.js');
      await initIdentify(ctx);
    } catch (e) { console.warn('[GeoVisor] identify:', e.message); }
  }

  if (puedeUsar('medirArea')) {
    try {
      const { initMeasure } = await import('./measure.js');
      await initMeasure(ctx);
    } catch (e) { console.warn('[GeoVisor] measure:', e.message); }
  }

  if (puedeUsar('verTablaAtributos')) {
    try {
      const { initLayerQueryUI } = await import('./layerQuery.js');
      await initLayerQueryUI(ctx);
    } catch (e) { console.warn('[GeoVisor] layerQuery:', e.message); }
  }

  if (puedeUsar('imprimirMapa')) {
    try {
      const { initPrint } = await import('./print.js');
      await initPrint(ctx);
    } catch (e) { console.warn('[GeoVisor] print:', e.message); }
  }

  if (puedeUsar('subirArchivos')) {
    try {
      const { initUploadModule } = await import('./upload.js');
      await initUploadModule(ctx);
    } catch (e) { console.warn('[GeoVisor] upload:', e.message); }
  }

  if (puedeUsar('capturaCoords')) {
    try {
      const { initCoordinatePicker } = await import('./coordpicker.js');
      await initCoordinatePicker(ctx);
    } catch (e) { console.warn('[GeoVisor] coordpicker:', e.message); }
  }

  // ── Repositorio documental ────────────────────────────────
  try {
    const { initDocRepo }   = await import('./docRepo.js');
    const { initDocUpload } = await import('./docUpload.js');
    initDocRepo(ctx);
    initDocUpload(ctx);
  } catch (e) { console.warn('[GeoVisor] docRepo/docUpload:', e.message); }

  console.log('[GeoVisor] Listo ✓ — San Andrés');
}

bootstrap().catch(err => console.error('[GeoVisor] Error:', err));