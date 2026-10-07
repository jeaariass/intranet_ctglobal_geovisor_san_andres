// /js/print.js
// Modo de impresión SIN popups: previsualiza en overlay y genera una hoja imprimible FUERA del overlay.
// Evita PDF en blanco al no ocultar el contenedor que contiene la hoja.
// Espera carga de la imagen antes de imprimir.

export function initPrint(ctx) {
  const { root, map } = ctx || {};
  if (!root) { console.error('[print] faltan ctx.root'); return; }

  const host = root.querySelector('#printRoot');
  if (!host) { console.warn('[print] No existe #printRoot en el DOM.'); return; }

  host.innerHTML = `
    <div class="print-shell">
      <div class="form-group">
        <label for="printTitle">Título</label>
        <input id="printTitle" class="form-input" type="text"
               value="GeoVisor San Andrés - Vista actual">
      </div>

      <div class="form-group">
        <label for="printNote">Nota (opcional)</label>
        <input id="printNote" class="form-input" type="text"
               placeholder="Ej.: Insumo de consulta. No constituye documento oficial.">
      </div>

      <div style="display:flex; gap:.5rem; flex-wrap:wrap;">
        <button id="btnPrintPreview" class="btn btn-primary">
          <i class="fas fa-print"></i> Previsualizar e imprimir
        </button>
        <button id="btnPrintHelp" class="btn btn-secondary">
          <i class="fas fa-circle-info"></i> Ayuda
        </button>
      </div>

      <div class="hint" style="margin-top:.6rem;">
        Este modo no abre ventanas emergentes. Genera una hoja imprimible y usa el diálogo del navegador.
      </div>
    </div>
  `;

  injectPrintStylesOnce(root);

  const btnPreview = host.querySelector('#btnPrintPreview');
  const btnHelp = host.querySelector('#btnPrintHelp');

  btnHelp.addEventListener('click', () => {
    alert(
      'Impresión (sin popups):\n' +
      '1) Clic en “Previsualizar e imprimir”.\n' +
      '2) Se verá una previsualización.\n' +
      '3) Clic en “Imprimir / Guardar PDF” o Ctrl+P.\n\n' +
      'Si el mapa sale vacío en la previsualización, revise consola (F12).'
    );
  });

  btnPreview.addEventListener('click', async () => {
    if (!map) {
      alert('No se detectó el mapa en el contexto. Verifique la inicialización de OpenLayers.');
      return;
    }

    btnPreview.disabled = true;
    btnPreview.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';

    try {
      await renderComplete(map);

      const dataUrl = captureOlMapAsPng(map);
      if (!dataUrl) {
        alert('No fue posible capturar el mapa. Revise consola (F12).');
        return;
      }

      const title = (host.querySelector('#printTitle')?.value || '').trim() || 'Vista actual';
      const note  = (host.querySelector('#printNote')?.value || '').trim();

      const scaleText =
        root.querySelector('#coordScale')?.textContent?.trim() ||
        root.querySelector('#scaleValue')?.textContent?.trim() ||
        '';

      const ts = new Date();
      ts.setMilliseconds(0);
      const iso = ts.toISOString();

      showPrintPreviewAndSheet(root, { title, note, iso, scaleText, dataUrl });

    } catch (e) {
      console.error('[print] error:', e);
      alert('Ocurrió un error generando la impresión. Revise consola (F12).');
    } finally {
      btnPreview.disabled = false;
      btnPreview.innerHTML = '<i class="fas fa-print"></i> Previsualizar e imprimir';
    }
  });

  console.log('[print] listo.');
  return true;
}

/** Espera un rendercomplete de OL */
function renderComplete(map) {
  return new Promise((resolve) => {
    let done = false;
    const onDone = () => {
      if (done) return;
      done = true;
      resolve();
    };

    try { map.renderSync?.(); } catch {}
    map.once('rendercomplete', onDone);

    // fallback
    setTimeout(onDone, 900);
  });
}

/** Captura mapa OL como PNG combinando todos los canvases del viewport */
function captureOlMapAsPng(map) {
  const viewport = map.getViewport?.();
  if (!viewport) { console.error('[print] map.getViewport() no disponible.'); return null; }

  const canvasList = viewport.querySelectorAll('canvas');
  if (!canvasList || !canvasList.length) {
    console.error('[print] no se encontraron canvas en el viewport.');
    return null;
  }

  const size = map.getSize?.();
  if (!size) { console.error('[print] map.getSize() no disponible.'); return null; }

  const out = document.createElement('canvas');
  out.width = size[0];
  out.height = size[1];
  const ctx = out.getContext('2d');

  // Fondo blanco para PDF
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);

  canvasList.forEach((c) => {
    if (c.width === 0 || c.height === 0) return;

    const opacity = Number(c.style.opacity || 1);
    ctx.globalAlpha = Number.isFinite(opacity) ? opacity : 1;

    const transform = c.style.transform;
    if (transform && transform.startsWith('matrix(')) {
      const values = transform
        .replace('matrix(', '')
        .replace(')', '')
        .split(',')
        .map(v => Number(v.trim()));
      if (values.length === 6 && values.every(Number.isFinite)) {
        ctx.setTransform(values[0], values[1], values[2], values[3], values[4], values[5]);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    try { ctx.drawImage(c, 0, 0); }
    catch (e) { console.warn('[print] drawImage falló:', e); }
  });

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;

  try {
    return out.toDataURL('image/png');
  } catch (e) {
    console.error('[print] toDataURL falló:', e);
    return null;
  }
}

/**
 * Crea:
 * 1) Overlay de previsualización (pantalla)
 * 2) Hoja imprimible fuera del overlay (para @media print)
 */
function showPrintPreviewAndSheet(root, { title, note, iso, scaleText, dataUrl }) {
  // Limpieza previa
  root.getElementById('printOverlay')?.remove();
  root.getElementById('printSheet')?.remove();

  // 1) Hoja imprimible (FUERA del overlay)
  const sheet = root.createElement('div');
  sheet.id = 'printSheet';
  sheet.className = 'print-sheet';
  sheet.innerHTML = `
    <div class="sheet-header">
      <div>
        <div class="sheet-title">${escapeHtml(title)}</div>
        ${note ? `<div class="sheet-note">${escapeHtml(note)}</div>` : ``}
      </div>
      <div class="sheet-meta">
        <div><strong>Fecha:</strong> ${escapeHtml(iso)}</div>
        ${scaleText ? `<div><strong>Escala (referencial):</strong> ${escapeHtml(scaleText)}</div>` : ``}
      </div>
    </div>

    <div class="sheet-map">
      <img id="printSheetImg" src="${dataUrl}" alt="Mapa" />
    </div>

    <div class="sheet-footer">
      <div>GeoVisor San Andrés</div>
      <div>Generado desde vista actual</div>
    </div>
  `;
  root.body.appendChild(sheet);

  // 2) Overlay (solo previsualización)
  const overlay = root.createElement('div');
  overlay.id = 'printOverlay';
  overlay.className = 'print-overlay';
  overlay.innerHTML = `
    <div class="print-modal">
      <div class="print-modal-header">
        <div class="pm-title">
          <div class="pm-h1">${escapeHtml(title)}</div>
          ${note ? `<div class="pm-note">${escapeHtml(note)}</div>` : ``}
        </div>
        <div class="pm-meta">
          <div><strong>Fecha:</strong> ${escapeHtml(iso)}</div>
          ${scaleText ? `<div><strong>Escala (referencial):</strong> ${escapeHtml(scaleText)}</div>` : ``}
        </div>
      </div>

      <div class="print-map-wrap">
        <img id="printPreviewImg" src="${dataUrl}" alt="Mapa" />
      </div>

      <div class="print-modal-actions">
        <button class="btn btn-primary" id="btnDoPrint">
          <i class="fas fa-print"></i> Imprimir / Guardar PDF
        </button>
        <button class="btn btn-secondary" id="btnClosePrint">
          <i class="fas fa-xmark"></i> Cerrar
        </button>
      </div>

      <div class="hint" style="margin-top:.6rem;">
        Si se imprime vacío, normalmente es porque la imagen aún no terminó de cargar. Este módulo espera la carga antes de imprimir.
      </div>
    </div>
  `;
  root.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    // La hoja imprimible se conserva por si se desea Ctrl+P luego;
    // si se prefiere borrar también, descomentar:
    // sheet.remove();
  };

  overlay.querySelector('#btnClosePrint')?.addEventListener('click', close);

  // Esperar que la imagen cargue antes de imprimir
  const imgSheet = sheet.querySelector('#printSheetImg');
  const imgPrev  = overlay.querySelector('#printPreviewImg');

  const waitImg = (img) => new Promise((res) => {
    if (!img) return res();
    if (img.complete && img.naturalWidth > 0) return res();
    img.onload = () => res();
    img.onerror = () => res(); // evitar bloqueo por error
  });

  overlay.querySelector('#btnDoPrint')?.addEventListener('click', async () => {
    try {
      await waitImg(imgSheet);
      await waitImg(imgPrev);

      // Forzar reflow (ayuda a algunos navegadores antes de imprimir)
      void sheet.offsetHeight;

      window.print();
    } catch (e) {
      console.error('[print] error al imprimir:', e);
      window.print();
    }
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function injectPrintStylesOnce(root) {
  if (root.getElementById('printStylesV3')) return;

  const st = root.createElement('style');
  st.id = 'printStylesV3';
  st.textContent = `
    /* Overlay */
    .print-overlay{
      position: fixed; inset: 0;
      background: rgba(0,0,0,.45);
      z-index: 9999;
      display:flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
    }
    .print-modal{
      width: min(980px, 100%);
      max-height: 92vh;
      overflow: auto;
      background:#fff;
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0,0,0,.35);
      border: 1px solid #e5e7eb;
      padding: 14px;
    }
    .print-modal-header{
      display:flex;
      justify-content: space-between;
      gap: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e5e7eb;
    }
    .pm-h1{ font-weight: 900; color:#111827; font-size: 14px; }
    .pm-note{ color:#6b7280; font-size: 12px; margin-top: 4px; }
    .pm-meta{ color:#6b7280; font-size: 12px; text-align: right; line-height: 1.35; }
    .print-map-wrap{
      margin-top: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      background:#fff;
    }
    .print-map-wrap img{ width:100%; height:auto; display:block; }
    .print-modal-actions{
      display:flex;
      gap:.5rem;
      flex-wrap: wrap;
      justify-content: flex-end;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #e5e7eb;
    }

    /* Hoja imprimible (oculta en pantalla) */
    .print-sheet{ display:none; }

    /* Impresión: ocultar toda la app y mostrar solo #printSheet */
    @media print{
    @page { size: A4 landscape; margin: 10mm; }

    /* Ocultar toda la app */
    body * { display: none !important; }

    /* Mostrar solo la hoja */
    #printSheet { display: block !important; }
    #printSheet, #printSheet * { display: block !important; }

    /* Evitar que el contenido “crezca” y pagine */
    #printSheet{
        position: relative !important;
        width: 100% !important;
        height: 100% !important;     /* clave */
        padding: 0 !important;
        overflow: hidden !important; /* clave */
        box-sizing: border-box;
    }

    /* Header / footer sin saltos */
    .sheet-header, .sheet-footer, .sheet-map{
        break-inside: avoid !important;
        page-break-inside: avoid !important;
    }

    /* Reservar altura real para que TODO quepa en una sola hoja */
    .sheet-header{ margin-bottom: 6mm !important; }
    .sheet-footer{
        position: fixed !important;
        left: 10mm !important;
        right: 10mm !important;
        bottom: 8mm !important;      /* clave: lo fija en la misma página */
        margin: 0 !important;
    }

    /* La imagen se ajusta al espacio restante */
    .sheet-map{
        margin: 0 !important;
        border: 0 !important;
    }
    .sheet-map img{
        width: 100% !important;
        height: auto !important;
        max-height: 155mm !important; /* ajusta si aún pagina (bajar a 145mm) */
        object-fit: contain !important;
    }
    }


    /* Estilo de hoja */
    #printSheet{
      font-family: Arial, Helvetica, sans-serif;
      color:#111827;
    }
    .sheet-header{
      display:flex;
      justify-content: space-between;
      gap: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e5e7eb;
    }
    .sheet-title{ font-size: 14px; font-weight: 800; margin:0; }
    .sheet-note{ font-size: 12px; color:#6b7280; margin-top: 4px; }
    .sheet-meta{ font-size: 12px; color:#6b7280; text-align: right; line-height:1.35; }
    .sheet-map{
      margin-top: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      overflow: hidden;
    }
    .sheet-map img{ width:100%; height:auto; display:block; }
    .sheet-footer{
      margin-top: 10px;
      font-size: 11px;
      color:#6b7280;
      display:flex;
      justify-content: space-between;
    }
  `;
  root.head.appendChild(st);
}
