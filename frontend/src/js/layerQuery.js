// /js/layerQuery.js
// Búsqueda por atributo sobre las capas locales "Predios" y "Predios patrimoniales"
// (datos en memoria desde window.PREDIOS_DATA / window.PATRIMONIO_DATA, sin WFS).

const FICHA_FILTER_KEY = '__conFicha';

const LAYER_DEFS = {
  predios: {
    label: 'Predios',
    attrs: [
      { key: 'CODIGO', label: 'Código catastral' },
      { key: 'R1_Nombre', label: 'Propietario' },
      { key: 'R1_Direcci', label: 'Dirección' },
      { key: 'R2_Matricu', label: 'Matrícula inmobiliaria' },
    ],
    fichaLabel: 'Solo predios con ficha/PDF disponible',
  },
  patrimonio: {
    label: 'Predios patrimoniales',
    attrs: [
      { key: 'inmueble', label: 'Código de inmueble (ej: U-1, R-121)' },
      { key: 'R1_Nombre', label: 'Propietario' },
      { key: 'ZONA', label: 'Zona' },
      { key: 'CODIGO', label: 'Código catastral' },
    ],
    fichaLabel: 'Solo con ficha de inventario disponible',
  },
};

export async function initLayerQueryUI(ctx) {
  const { map, root, olLayersById, selectPredioFeature } = ctx || {};
  const doc = root || document;

  const layerSelect        = doc.getElementById('queryLayerSelect');
  const attributeContainer = doc.getElementById('attributesContainer');
  const attributeSelect    = doc.getElementById('attributeSelect');
  const filterContainer    = doc.getElementById('filterContainer');
  const filterInput        = doc.getElementById('filterValue');
  const executeBtn         = doc.getElementById('executeQuery');
  const resultsDiv         = doc.getElementById('queryResults');
  const resultsSelect      = doc.getElementById('queryResultsSelect');
  const clearBtn           = doc.getElementById('clearQueryResults');

  if (!map || !olLayersById || !layerSelect || !attributeSelect || !filterInput || !executeBtn) {
    console.warn('[layerQuery] Falta map/olLayersById o elementos del DOM'); return;
  }

  // Códigos de predio con PDF real (mismo manifiesto que usa predioPanel.js).
  let prediosConFicha = new Set();
  try {
    const resp = await fetch('data/doc-manifest.json');
    const manifest = await resp.json();
    const folder = manifest.find((f) => f.key === 'predios');
    (folder?.files || []).forEach((f) => {
      const codigo = String(f.id || '').replace(/^pdf_/, '');
      if (codigo) prediosConFicha.add(codigo);
    });
  } catch (e) {
    console.warn('[layerQuery] No se pudo cargar doc-manifest.json:', e.message);
  }

  function tieneFicha(layerKey, feature) {
    if (layerKey === 'predios') return prediosConFicha.has(String(feature.get('CODIGO') ?? ''));
    return !!feature.get('FICHA');
  }

  // ── Cargar lista de capas ──────────────────────────────────
  layerSelect.innerHTML = '<option value="">Seleccione una capa</option>' +
    Object.entries(LAYER_DEFS).map(([key, def]) => `<option value="${key}">${def.label}</option>`).join('');

  attributeContainer.style.display = 'none';
  filterContainer.style.display    = 'none';
  executeBtn.style.display         = 'none';

  // ── Sugerencias (autocompletar) ─────────────────────────────
  const suggestBox = doc.createElement('div');
  suggestBox.style.cssText = `
    position:absolute; left:0; right:0; top:100%;
    z-index:9000; background:#fff;
    border:1.5px solid #2563eb; border-top:none;
    border-radius:0 0 9px 9px;
    max-height:200px; overflow-y:auto;
    box-shadow:0 6px 16px rgba(37,99,235,.15);
    display:none;
  `;
  filterContainer.style.position = 'relative';
  filterContainer.appendChild(suggestBox);

  let allValues   = new Set();
  let suggestOpen = false;

  function highlightText(text, q) {
    if (!q) return escHtml(text);
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escHtml(text).replace(new RegExp(`(${safe})`, 'gi'), '<strong style="color:#2563eb;font-weight:700">$1</strong>');
  }

  function showSuggestions(q) {
    const term = q.toLowerCase();
    const matches = term.length === 0
      ? [...allValues].slice(0, 40)
      : [...allValues].filter((v) => v.toLowerCase().includes(term)).slice(0, 40);

    if (!matches.length) { hideSuggestions(); return; }

    suggestBox.innerHTML = matches.map((v) => `
      <div class="qs-item" style="padding:.42rem .75rem;cursor:pointer;font-size:.83rem;color:#111827;border-bottom:1px solid #f3f4f6;line-height:1.4;" data-val="${escAttr(v)}">${highlightText(v, q)}</div>
    `).join('');

    suggestBox.querySelectorAll('.qs-item').forEach((item) => {
      item.addEventListener('mouseenter', () => { item.style.background = '#eff6ff'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        filterInput.value = item.dataset.val;
        hideSuggestions();
      });
    });

    suggestBox.style.display = 'block';
    suggestOpen = true;
  }

  function hideSuggestions() { suggestBox.style.display = 'none'; suggestOpen = false; }

  filterInput.addEventListener('input', () => showSuggestions(filterInput.value));
  filterInput.addEventListener('focus', () => { if (allValues.size) showSuggestions(filterInput.value); });
  filterInput.addEventListener('blur', () => setTimeout(hideSuggestions, 160));

  // ── Cambio de CAPA ──────────────────────────────────────────
  layerSelect.addEventListener('change', () => {
    attributeSelect.innerHTML = '<option value="">Seleccione un atributo</option>';
    resultsDiv.innerHTML      = '';
    resultsSelect.innerHTML   = '<option value="">Seleccione un resultado</option>';
    filterInput.value         = '';
    allValues                 = new Set();
    hideSuggestions();

    const key = layerSelect.value;
    const def = LAYER_DEFS[key];
    if (!def) {
      attributeContainer.style.display = 'none';
      filterContainer.style.display    = 'none';
      executeBtn.style.display         = 'none';
      return;
    }

    attributeContainer.style.display = 'block';
    executeBtn.style.display         = 'inline-block';

    const opts = [
      `<option value="${FICHA_FILTER_KEY}">★ ${escHtml(def.fichaLabel)}</option>`,
      ...def.attrs.map((a) => `<option value="${a.key}">${escHtml(a.label)}</option>`),
    ];
    attributeSelect.innerHTML = '<option value="">Seleccione un atributo</option>' + opts.join('');
  });

  // ── Cambio de ATRIBUTO ──────────────────────────────────────
  attributeSelect.addEventListener('change', () => {
    filterInput.value = '';
    allValues = new Set();
    hideSuggestions();

    const key = layerSelect.value;
    const attr = attributeSelect.value;

    if (!key || !attr || attr === FICHA_FILTER_KEY) {
      filterContainer.style.display = 'none';
      return;
    }
    filterContainer.style.display = 'block';

    const layer = olLayersById.get(key);
    const features = layer?.getSource()?.getFeatures() || [];
    features.forEach((f) => {
      const v = f.get(attr);
      if (v !== null && v !== undefined && String(v).trim() !== '') allValues.add(String(v).trim());
    });

    filterInput.placeholder = allValues.size > 0
      ? `Escribe o elige entre ${allValues.size} valores…`
      : 'Escribe el valor a buscar';
  });

  // ── EJECUTAR BÚSQUEDA ───────────────────────────────────────
  executeBtn.addEventListener('click', () => {
    resultsDiv.innerHTML    = '';
    resultsSelect.innerHTML = '<option value="">Seleccione un resultado</option>';
    hideSuggestions();

    const key = layerSelect.value;
    const def = LAYER_DEFS[key];
    const attr = attributeSelect.value;
    if (!def || !attr) {
      resultsDiv.innerHTML = '<p style="color:#dc2626;font-size:.83rem">Seleccione capa y atributo.</p>';
      return;
    }

    const layer = olLayersById.get(key);
    const features = layer?.getSource()?.getFeatures() || [];

    let matched;
    if (attr === FICHA_FILTER_KEY) {
      matched = features.filter((f) => tieneFicha(key, f));
    } else {
      const q = filterInput.value.trim().toLowerCase();
      if (!q) {
        resultsDiv.innerHTML = '<p style="color:#dc2626;font-size:.83rem">Escriba un valor a buscar.</p>';
        return;
      }
      matched = features.filter((f) => String(f.get(attr) ?? '').toLowerCase().includes(q));
    }

    if (!matched.length) {
      resultsDiv.innerHTML = '<p style="color:#6b7280;font-size:.83rem">Sin resultados.</p>';
      return;
    }

    const container = doc.createElement('div');
    matched.slice(0, 200).forEach((f, idx) => {
      const p = f.getProperties();
      const codigo = p.CODIGO || '—';
      const nombre = (key === 'patrimonio' && p.inmueble)
        ? `${p.inmueble}${p.R1_Nombre ? ' — ' + p.R1_Nombre : ''}`
        : (p.R1_Nombre || `Predio ${codigo}`);
      const ficha = tieneFicha(key, f);

      const item = doc.createElement('div');
      item.className = 'query-result-item';
      item.style.cursor = 'pointer';
      item.innerHTML = `
        <h5 style="color:#2563eb;font-size:.8rem;margin-bottom:.3rem">${escHtml(nombre)}</h5>
        <div style="font-size:.78rem"><strong>Código:</strong> ${escHtml(String(codigo))}</div>
        <div style="font-size:.78rem;margin-top:.15rem">
          <span style="color:${ficha ? '#15803d' : '#9ca3af'};font-weight:600">
            ${ficha ? '✓ Con ficha disponible' : '— Sin ficha disponible'}
          </span>
        </div>
      `;
      item.addEventListener('click', () => selectResult(idx));
      container.appendChild(item);

      const opt = doc.createElement('option');
      opt.value = idx;
      opt.textContent = `${idx + 1}. ${nombre}`;
      resultsSelect.appendChild(opt);
    });

    resultsDiv.appendChild(container);
    resultsDiv.insertAdjacentHTML('afterbegin', `<p style="color:#6b7280;font-size:.78rem;margin-bottom:.4rem">${matched.length} resultado(s)${matched.length > 200 ? ' (mostrando 200)' : ''}</p>`);

    function selectResult(idx) {
      const f = matched[idx];
      if (!f) return;
      if (typeof selectPredioFeature === 'function') {
        selectPredioFeature(f, { zoom: true });
      } else {
        map.getView().fit(f.getGeometry().getExtent(), { duration: 400, maxZoom: 19, padding: [60, 60, 60, 60] });
      }
    }

    resultsSelect.addEventListener('change', () => {
      const idx = Number(resultsSelect.value);
      if (!isNaN(idx)) selectResult(idx);
    });
  });

  // ── Limpiar ──────────────────────────────────────────────────
  clearBtn.addEventListener('click', () => {
    resultsDiv.innerHTML    = '';
    resultsSelect.innerHTML = '<option value="">Seleccione un resultado</option>';
    filterInput.value       = '';
    hideSuggestions();
  });

  console.log('[layerQuery] listo.');
}

// ── Helpers ────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;');
}
