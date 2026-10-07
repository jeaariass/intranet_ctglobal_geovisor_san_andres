// /js/encuestas.js
// Encuestas (UI) con captura de ubicación por clic en mapa + persistencia local (Opera/localStorage).
// Sin campos de "observación" en ninguna sección.
// No guarda en BD aún, pero mantiene identificadores listos para Postgres.

export function initSurveys(ctx) {
  const { root, eventBus, map } = ctx || {};
  if (!root) { console.error('[encuestas] faltan ctx.root'); return; }

  const host = root.querySelector('#surveysRoot');
  if (!host) { console.warn('[encuestas] No existe #surveysRoot en el DOM.'); return; }

  const STORAGE_KEY = 'cda_surveys_v1';

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');

  const nowISO = () => { const d = new Date(); d.setMilliseconds(0); return d.toISOString(); };
  const genId  = () => `enc_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  const readValue = (sel) => (host.querySelector(sel)?.value ?? '').trim();
  const readRadio = (name) =>
    host.querySelector(`input[type="radio"][name="${CSS.escape(name)}"]:checked`)?.value ?? '';
  const readChecks = (name) =>
    Array.from(host.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]:checked`))
      .map(i => i.value);

  const loadAll = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  };
  const saveAll = (arr) => localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));

  // ---------- estado ----------
  let captureMode = false;
  let encLon = null;
  let encLat = null;
  let mapClickKey = null;

  // ---------- UI ----------
  host.innerHTML = `
    <div class="sv-shell">

      <!-- Barra de progreso de pasos -->
      <div class="sv-stepper">
        <div class="sv-step active" data-step="1">
          <div class="sv-step-icon"><i class="fas fa-map-marker-alt"></i></div>
          <span>Ubicación</span>
        </div>
        <div class="sv-step-line"></div>
        <div class="sv-step" data-step="2">
          <div class="sv-step-icon"><i class="fas fa-users"></i></div>
          <span>Percepción</span>
        </div>
        <div class="sv-step-line"></div>
        <div class="sv-step" data-step="3">
          <div class="sv-step-icon"><i class="fas fa-city"></i></div>
          <span>Diagnóstico</span>
        </div>
        <div class="sv-step-line"></div>
        <div class="sv-step" data-step="4">
          <div class="sv-step-icon"><i class="fas fa-clipboard-list"></i></div>
          <span>Inventario</span>
        </div>
        <div class="sv-step-line"></div>
        <div class="sv-step" data-step="5">
          <div class="sv-step-icon"><i class="fas fa-comment-dots"></i></div>
          <span>Participación</span>
        </div>
        <div class="sv-step-line"></div>
        <div class="sv-step" data-step="6">
          <div class="sv-step-icon"><i class="fas fa-check"></i></div>
          <span>Historial</span>
        </div>
      </div>

      <!-- Meta info -->
      <div class="sv-meta-bar">
        <div class="sv-meta-chip">
          <i class="fas fa-fingerprint"></i>
          <span class="sv-meta-lbl">ID:</span>
          <span id="enc_id" class="sv-meta-val">${esc(genId())}</span>
        </div>
        <div class="sv-meta-chip">
          <i class="fas fa-clock"></i>
          <span class="sv-meta-lbl">Fecha:</span>
          <span id="enc_ts" class="sv-meta-val">${esc(nowISO())}</span>
        </div>
      </div>

      <!-- ═══ PASO 1: UBICACIÓN ═══ -->
      <div class="sv-pane active" data-pane="1">
        <div class="sv-pane-header sv-color-blue">
          <div class="sv-pane-icon"><i class="fas fa-map-marker-alt"></i></div>
          <div>
            <div class="sv-pane-title">Ubicación de la encuesta</div>
            <div class="sv-pane-sub">Capture la ubicación haciendo clic en el mapa (opcional)</div>
          </div>
        </div>
        <div class="sv-pane-body">
          <div class="sv-loc-grid">
            <div class="sv-loc-coord">
              <div class="sv-loc-label"><i class="fas fa-arrows-left-right"></i> Longitud</div>
              <div class="sv-loc-value" id="enc_lon">—</div>
            </div>
            <div class="sv-loc-coord">
              <div class="sv-loc-label"><i class="fas fa-arrows-up-down"></i> Latitud</div>
              <div class="sv-loc-value" id="enc_lat">—</div>
            </div>
          </div>
          <div class="sv-loc-actions">
            <button type="button" class="sv-btn sv-btn-primary" id="btnCaptureOnMap">
              <i class="fas fa-crosshairs"></i> Capturar en mapa
            </button>
            <button type="button" class="sv-btn sv-btn-ghost" id="btnClearCoords">
              <i class="fas fa-eraser"></i> Limpiar
            </button>
          </div>
          <div class="sv-hint" id="locHint">
            <i class="fas fa-circle-info"></i> Active "Capturar en mapa" y haga clic en el mapa para fijar la ubicación.
          </div>
        </div>
        <div class="sv-nav">
          <span></span>
          <button type="button" class="sv-btn sv-btn-primary sv-btn-next" data-go="2">
            Siguiente <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>

      <!-- ═══ PASO 2: PERCEPCIÓN CIUDADANA ═══ -->
      <div class="sv-pane" data-pane="2">
        <div class="sv-pane-header sv-color-purple">
          <div class="sv-pane-icon"><i class="fas fa-users"></i></div>
          <div>
            <div class="sv-pane-title">Percepción ciudadana</div>
            <div class="sv-pane-sub">Situación general del municipio según el ciudadano</div>
          </div>
        </div>
        <div class="sv-pane-body">

          <div class="sv-field">
            <label class="sv-label">Problemas percibidos <span class="sv-tag">múltiple</span></label>
            <div class="sv-check-grid">
              ${mkChecks('pc_problemas', [
                ['seguridad', 'Seguridad y convivencia'],
                ['movilidad', 'Movilidad'],
                ['esp_publico', 'Espacio público'],
                ['ambiente', 'Ambiente (ruido, residuos, aire)'],
                ['riesgos', 'Riesgos / desastres'],
                ['servicios', 'Servicios públicos'],
                ['equipamientos', 'Equipamientos (salud / educación / deporte)'],
                ['otro', 'Otro']
              ])}
            </div>
          </div>

          <div class="sv-field-row">
            <div class="sv-field">
              <label class="sv-label" for="pc_prioridad">Principal prioridad del municipio</label>
              <select id="pc_prioridad" class="sv-select">
                <option value="">Seleccione…</option>
                <option value="seguridad">Seguridad</option>
                <option value="movilidad">Movilidad</option>
                <option value="esp_publico">Espacio público</option>
                <option value="ambiente">Ambiente</option>
                <option value="riesgos">Gestión del riesgo</option>
                <option value="equipamientos">Equipamientos</option>
                <option value="empleo">Empleo / economía</option>
              </select>
            </div>
            <div class="sv-field">
              <label class="sv-label">Sensación de seguridad</label>
              <div class="sv-radio-pills">
                ${mkRadios('pc_seguridad', [['alta','Alta'],['media','Media'],['baja','Baja']])}
              </div>
            </div>
          </div>

          <div class="sv-field">
            <label class="sv-label">Satisfacción general <span class="sv-tag">1 = Muy insatisfecho · 5 = Muy satisfecho</span></label>
            <div class="sv-rating">
              ${mkRadios('pc_satisfaccion', [['1','1'],['2','2'],['3','3'],['4','4'],['5','5']])}
            </div>
          </div>

        </div>
        <div class="sv-nav">
          <button type="button" class="sv-btn sv-btn-ghost sv-btn-prev" data-go="1">
            <i class="fas fa-arrow-left"></i> Anterior
          </button>
          <button type="button" class="sv-btn sv-btn-primary sv-btn-next" data-go="3">
            Siguiente <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>

      <!-- ═══ PASO 3: DIAGNÓSTICOS SECTORIALES ═══ -->
      <div class="sv-pane" data-pane="3">
        <div class="sv-pane-header sv-color-teal">
          <div class="sv-pane-icon"><i class="fas fa-city"></i></div>
          <div>
            <div class="sv-pane-title">Diagnósticos sectoriales</div>
            <div class="sv-pane-sub">Estado percibido de cada sector del municipio</div>
          </div>
        </div>
        <div class="sv-pane-body">
          <div class="sv-sector-grid">
            ${renderSector('Movilidad', 'ds_movilidad_estado', 'fa-road')}
            ${renderSector('Ambiente', 'ds_ambiente_estado', 'fa-leaf')}
            ${renderSector('Espacio público', 'ds_espacio_publico_estado', 'fa-tree-city')}
            ${renderSector('Gestión de riesgos', 'ds_riesgos_estado', 'fa-triangle-exclamation')}
          </div>
        </div>
        <div class="sv-nav">
          <button type="button" class="sv-btn sv-btn-ghost sv-btn-prev" data-go="2">
            <i class="fas fa-arrow-left"></i> Anterior
          </button>
          <button type="button" class="sv-btn sv-btn-primary sv-btn-next" data-go="4">
            Siguiente <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>

      <!-- ═══ PASO 4: INVENTARIOS ═══ -->
      <div class="sv-pane" data-pane="4">
        <div class="sv-pane-header sv-color-orange">
          <div class="sv-pane-icon"><i class="fas fa-clipboard-list"></i></div>
          <div>
            <div class="sv-pane-title">Inventarios simples</div>
            <div class="sv-pane-sub">Registre puntos de interés, equipamientos o conflictos detectados</div>
          </div>
        </div>
        <div class="sv-pane-body">
          <div class="sv-field-row">
            <div class="sv-field">
              <label class="sv-label" for="inv_tipo">Tipo de inventario</label>
              <select id="inv_tipo" class="sv-select">
                <option value="">Seleccione…</option>
                <option value="equipamiento">Equipamiento</option>
                <option value="conflicto_uso">Conflicto de uso</option>
                <option value="punto_critico">Punto crítico</option>
              </select>
            </div>
            <div class="sv-field">
              <label class="sv-label" for="inv_nombre">Nombre / referencia</label>
              <input id="inv_nombre" class="sv-input" type="text" placeholder="Ej: Parque central">
            </div>
          </div>
          <div class="sv-field-row">
            <div class="sv-field">
              <label class="sv-label">Estado</label>
              <div class="sv-radio-pills sv-estado">
                ${mkRadios('inv_estado', [['bueno','Bueno'],['regular','Regular'],['malo','Malo']])}
              </div>
            </div>
            <div class="sv-field">
              <label class="sv-label">Urgencia de intervención</label>
              <div class="sv-radio-pills sv-urgencia">
                ${mkRadios('inv_urgencia', [['baja','Baja'],['media','Media'],['alta','Alta']])}
              </div>
            </div>
          </div>
        </div>
        <div class="sv-nav">
          <button type="button" class="sv-btn sv-btn-ghost sv-btn-prev" data-go="3">
            <i class="fas fa-arrow-left"></i> Anterior
          </button>
          <button type="button" class="sv-btn sv-btn-primary sv-btn-next" data-go="5">
            Siguiente <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>

      <!-- ═══ PASO 5: PARTICIPACIÓN ═══ -->
      <div class="sv-pane" data-pane="5">
        <div class="sv-pane-header sv-color-green">
          <div class="sv-pane-icon"><i class="fas fa-comment-dots"></i></div>
          <div>
            <div class="sv-pane-title">Participación ciudadana</div>
            <div class="sv-pane-sub">Propuestas, observaciones o alertas del ciudadano</div>
          </div>
        </div>
        <div class="sv-pane-body">
          <div class="sv-field-row">
            <div class="sv-field">
              <label class="sv-label" for="part_tipo">Tipo de aporte</label>
              <select id="part_tipo" class="sv-select">
                <option value="">Seleccione…</option>
                <option value="propuesta">Propuesta</option>
                <option value="observacion">Observación</option>
                <option value="alerta">Alerta</option>
              </select>
            </div>
            <div class="sv-field">
              <label class="sv-label" for="part_contacto">Contacto <span class="sv-tag">opcional</span></label>
              <input id="part_contacto" class="sv-input" type="text" placeholder="Email o teléfono">
            </div>
          </div>

          <div class="sv-field">
            <label class="sv-label" for="part_texto">Aporte / descripción</label>
            <textarea id="part_texto" class="sv-input sv-textarea" rows="4"
              placeholder="Describa su propuesta, observación o alerta…"></textarea>
          </div>

          <div class="sv-field-row">
            <div class="sv-field">
              <label class="sv-label" for="part_capa_ref">Capa de referencia <span class="sv-tag">opcional</span></label>
              <input id="part_capa_ref" class="sv-input" type="text" placeholder="Ej: division_municipal">
            </div>
            <div class="sv-field">
              <label class="sv-label" for="part_obj_ref">ID objeto <span class="sv-tag">opcional</span></label>
              <input id="part_obj_ref" class="sv-input" type="text" placeholder="Ej: 00123">
            </div>
          </div>
        </div>
        <div class="sv-nav">
          <button type="button" class="sv-btn sv-btn-ghost sv-btn-prev" data-go="4">
            <i class="fas fa-arrow-left"></i> Anterior
          </button>
          <button type="button" class="sv-btn sv-btn-success" id="btnSaveSurvey">
            <i class="fas fa-save"></i> Guardar encuesta
          </button>
        </div>
      </div>

      <!-- ═══ PASO 6: HISTORIAL ═══ -->
      <div class="sv-pane" data-pane="6">
        <div class="sv-pane-header sv-color-gray">
          <div class="sv-pane-icon"><i class="fas fa-clock-rotate-left"></i></div>
          <div>
            <div class="sv-pane-title">Historial de encuestas</div>
            <div class="sv-pane-sub">Encuestas guardadas localmente en este dispositivo</div>
          </div>
        </div>
        <div class="sv-pane-body">
          <div class="sv-history-toolbar">
            <span class="sv-badge" id="historyCount">0</span> encuestas guardadas
            <button type="button" class="sv-btn sv-btn-ghost sv-btn-sm" id="btnResetSurvey" style="margin-left:auto">
              <i class="fas fa-plus"></i> Nueva encuesta
            </button>
            <button type="button" class="sv-btn sv-btn-danger sv-btn-sm" id="btnClearHistory">
              <i class="fas fa-trash"></i> Borrar todo
            </button>
          </div>
          <div id="historyList" class="sv-history-list"></div>
        </div>
        <div class="sv-nav">
          <button type="button" class="sv-btn sv-btn-ghost sv-btn-prev" data-go="5">
            <i class="fas fa-arrow-left"></i> Anterior
          </button>
        </div>
      </div>

    </div>
  `;

    injectLocalStylesOnce();

  // ---------- bindings ----------
  const idEl = host.querySelector('#enc_id');
  const tsEl = host.querySelector('#enc_ts');

  const setLocUI = () => {
    host.querySelector('#enc_lon').textContent = (encLon == null) ? '—' : String(encLon);
    host.querySelector('#enc_lat').textContent = (encLat == null) ? '—' : String(encLat);
  };
  setLocUI();

  const btnCapture = host.querySelector('#btnCaptureOnMap');
  btnCapture.addEventListener('click', () => toggleCaptureMode());

  host.querySelector('#btnClearCoords').addEventListener('click', () => {
    encLon = null; encLat = null; setLocUI();
  });

  host.querySelector('#btnSaveSurvey').addEventListener('click', () => {
    const payload = buildPayload();
    const ok = validateRequired(payload);
    if (!ok) return;

    console.log('[ENCUESTA] Registro:', payload);

    const all = loadAll();
    all.unshift(payload);
    saveAll(all);

    renderHistory();
    resetForNewSurvey(false);
    alert('Encuesta guardada localmente (Opera). Revise consola y “Encuestas realizadas”.');
  });

  host.querySelector('#btnResetSurvey').addEventListener('click', () => resetForNewSurvey(true));

  host.querySelector('#btnClearHistory').addEventListener('click', () => {
    if (!confirm('¿Borrar el historial local de encuestas?')) return;
    saveAll([]);
    renderHistory();
  });

  renderHistory();

  // ── Stepper: navegación entre pasos ──────────────────────────────────────
  const panes   = Array.from(host.querySelectorAll('.sv-pane'));
  const steps   = Array.from(host.querySelectorAll('.sv-step'));

  function goToStep(n) {
    const num = Number(n);
    panes.forEach(p => p.classList.toggle('active', Number(p.dataset.pane) === num));
    steps.forEach((s, i) => {
      const sn = i + 1;
      s.classList.toggle('active', sn === num);
      s.classList.toggle('done',   sn < num);
      s.classList.remove('active');
      if (sn === num) s.classList.add('active');
    });
    host.closest('#surveysRoot')?.scrollTo?.(0, 0);
  }

  // Botones siguiente/anterior
  host.addEventListener('click', e => {
    const btn = e.target.closest('[data-go]');
    if (btn) goToStep(btn.dataset.go);
  });

  // Clic en step del stepper
  steps.forEach((s, i) => {
    s.addEventListener('click', () => goToStep(i + 1));
  });

  // ── Pills interactivas (radio) ────────────────────────────────────────────
  host.addEventListener('change', e => {
    const inp = e.target;
    if (inp.type === 'radio') {
      const name = inp.name;
      host.querySelectorAll(`.sv-radio-item input[name="${CSS.escape(name)}"]`).forEach(r => {
        r.closest('.sv-radio-item')?.classList.toggle('checked', r.checked);
      });
    }
    if (inp.type === 'checkbox') {
      inp.closest('.sv-check-item')?.classList.toggle('checked', inp.checked);
    }
  });

  // ── Al guardar → ir al historial ─────────────────────────────────────────
  const _origSave = host.querySelector('#btnSaveSurvey');
  if (_origSave) {
    const _origHandler = _origSave.onclick;
    _origSave.addEventListener('click', () => {
      // La lógica de guardado ya está arriba; aquí solo navegamos
      setTimeout(() => {
        const all = loadAll();
        if (all.length > 0) goToStep(6);
      }, 150);
    });
  }

  console.log('[encuestas] listo.');
  return true;

  // =========================
  //          LÓGICA
  // =========================

  function toggleCaptureMode() {
    captureMode = !captureMode;

    btnCapture.classList.toggle('btn-secondary', !captureMode);
    btnCapture.classList.toggle('btn-primary', captureMode);
    btnCapture.innerHTML = captureMode
      ? '<i class="fas fa-xmark"></i> Cancelar captura'
      : '<i class="fas fa-crosshairs"></i> Capturar en mapa';

    const hint = host.querySelector('#locHint');

    if (!map) {
      hint.textContent = captureMode
        ? 'No se detectó “map” en el contexto. Verifique la inicialización del visor.'
        : 'Active “Capturar en mapa” y haga clic en el mapa para fijar la ubicación.';
      return;
    }

    const viewport = map.getViewport?.();
    if (viewport) viewport.style.cursor = captureMode ? 'crosshair' : '';

    if (captureMode) {
      hint.textContent = 'Modo captura activo: haga clic en el mapa para fijar Lon/Lat.';
      mapClickKey = map.on('singleclick', (evt) => {
        try {
          const lonLat = (window.ol?.proj?.toLonLat)
            ? window.ol.proj.toLonLat(evt.coordinate)
            : null;

          if (!lonLat) {
            alert('No se pudo transformar coordenada. Verifique que OpenLayers (ol) esté disponible.');
            return;
          }

          const lon = Number(lonLat[0]);
          const lat = Number(lonLat[1]);
          encLon = Number.isFinite(lon) ? lon.toFixed(6) : null;
          encLat = Number.isFinite(lat) ? lat.toFixed(6) : null;
          setLocUI();

          toggleCaptureMode();
        } catch (e) {
          console.error('[encuestas] error capturando coordenadas:', e);
        }
      });
    } else {
      hint.textContent = 'Active “Capturar en mapa” y haga clic en el mapa para fijar la ubicación.';
      if (mapClickKey && map.un) {
        map.un('singleclick', mapClickKey.listener || mapClickKey);
      }
      mapClickKey = null;
    }
  }

  function resetForNewSurvey(clearForm) {
    if (idEl) idEl.textContent = genId();
    if (tsEl) tsEl.textContent = nowISO();
    encLon = null; encLat = null; setLocUI();

    if (clearForm) {
      host.querySelectorAll('input[type="text"], textarea').forEach(i => i.value = '');
      host.querySelectorAll('input[type="radio"]').forEach(i => i.checked = false);
      host.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);
      host.querySelectorAll('select').forEach(s => s.value = '');
    }
  }

  function buildPayload() {
    return {
      enc_id: idEl?.textContent?.trim() || genId(),
      enc_ts: tsEl?.textContent?.trim() || nowISO(),
      enc_lon: encLon,
      enc_lat: encLat,

      // -------- Percepción ciudadana (pc_)
      pc_problemas: readChecks('pc_problemas'),
      pc_prioridad: readValue('#pc_prioridad'),
      pc_satisfaccion: readRadio('pc_satisfaccion'),
      pc_seguridad: readRadio('pc_seguridad'),

      // -------- Diagnósticos sectoriales (ds_) (solo estado, sin observación)
      ds_movilidad_estado: readRadio('ds_movilidad_estado'),
      ds_ambiente_estado: readRadio('ds_ambiente_estado'),
      ds_espacio_publico_estado: readRadio('ds_espacio_publico_estado'),
      ds_riesgos_estado: readRadio('ds_riesgos_estado'),

      // -------- Inventarios simples (inv_) (sin observaciones)
      inv_tipo: readValue('#inv_tipo'),
      inv_nombre: readValue('#inv_nombre'),
      inv_estado: readRadio('inv_estado'),
      inv_urgencia: readRadio('inv_urgencia'),

      // -------- Participación (part_)
      part_tipo: readValue('#part_tipo'),
      part_texto: readValue('#part_texto'),
      part_capa_ref: readValue('#part_capa_ref'),
      part_obj_ref: readValue('#part_obj_ref'),
      part_contacto: readValue('#part_contacto'),
    };
  }

  function validateRequired(p) {
    const hasAny =
      (p.pc_problemas?.length > 0) ||
      !!p.pc_prioridad || !!p.pc_satisfaccion || !!p.pc_seguridad ||
      !!p.ds_movilidad_estado || !!p.ds_ambiente_estado || !!p.ds_espacio_publico_estado || !!p.ds_riesgos_estado ||
      !!p.inv_tipo || !!p.inv_nombre || !!p.inv_estado || !!p.inv_urgencia ||
      !!p.part_tipo || !!p.part_texto;

    if (!hasAny) {
      alert('La encuesta está vacía. Diligencie al menos una sección antes de guardar.');
      return false;
    }
    return true;
  }

  function renderHistory() {
    const list = host.querySelector('#historyList');
    const count = host.querySelector('#historyCount');
    const all = loadAll();
    if (count) count.textContent = String(all.length);

    if (!list) return;
    if (!all.length) {
      list.innerHTML = `<div class="hint">No hay encuestas guardadas localmente aún.</div>`;
      return;
    }

    list.innerHTML = all.slice(0, 30).map((r, idx) => {
      const subtitle = `${esc(r.enc_ts || '')} · ${r.enc_lon && r.enc_lat ? `(${esc(r.enc_lon)}, ${esc(r.enc_lat)})` : 'Sin ubicación'}`;
      return `
        <div class="history-item">
          <div class="history-main">
            <div class="history-id">${esc(r.enc_id || '')}</div>
            <div class="history-sub">${subtitle}</div>
          </div>
          <div class="history-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-act="view" data-idx="${idx}">
              <i class="fas fa-eye"></i>
            </button>
            <button type="button" class="btn btn-sm" data-act="del" data-idx="${idx}">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-act');
        const idx = Number(btn.getAttribute('data-idx'));
        const allNow = loadAll();

        if (act === 'view') {
          console.log('[ENCUESTA] Ver registro:', allNow[idx]);
          alert('Registro enviado a consola (F12 → Console).');
          return;
        }
        if (act === 'del') {
          if (!confirm('¿Eliminar esta encuesta del historial local?')) return;
          allNow.splice(idx, 1);
          saveAll(allNow);
          renderHistory();
        }
      });
    });
  }

  // =========================
  //      RENDER SECCIONES
  // =========================

  function renderAllSections() {
    return `
      <div class="survey-section">
        <h5 class="section-title">1) Percepción ciudadana</h5>

        <div class="form-group">
          <label>Problemas percibidos (selección múltiple)</label>
          <div class="check-grid">
            ${mkChecks('pc_problemas', [
              ['seguridad', 'Seguridad y convivencia'],
              ['movilidad', 'Movilidad'],
              ['esp_publico', 'Espacio público'],
              ['ambiente', 'Ambiente (ruido, residuos, aire)'],
              ['riesgos', 'Riesgos / desastres'],
              ['servicios', 'Servicios públicos'],
              ['equipamientos', 'Equipamientos (salud/educación/deporte)'],
              ['otro', 'Otro']
            ])}
          </div>
          <small class="hint">ID: <code>pc_problemas[]</code></small>
        </div>

        <div class="form-group">
          <label for="pc_prioridad">Principal prioridad del municipio</label>
          <select id="pc_prioridad" class="form-select">
            <option value="">Seleccione...</option>
            <option value="seguridad">Seguridad</option>
            <option value="movilidad">Movilidad</option>
            <option value="esp_publico">Espacio público</option>
            <option value="ambiente">Ambiente</option>
            <option value="riesgos">Gestión del riesgo</option>
            <option value="equipamientos">Equipamientos</option>
            <option value="empleo">Empleo / economía</option>
          </select>
          <small class="hint">ID: <code>pc_prioridad</code></small>
        </div>

        <div class="form-group">
          <label>Satisfacción general</label>
          <div class="radio-row">
            ${mkRadios('pc_satisfaccion', [['1','1'],['2','2'],['3','3'],['4','4'],['5','5']])}
          </div>
          <small class="hint">ID: <code>pc_satisfaccion</code></small>
        </div>

        <div class="form-group">
          <label>Sensación de seguridad</label>
          <div class="radio-row">
            ${mkRadios('pc_seguridad', [['alta','Alta'],['media','Media'],['baja','Baja']])}
          </div>
          <small class="hint">ID: <code>pc_seguridad</code></small>
        </div>
      </div>

      <div class="survey-section">
        <h5 class="section-title">2) Diagnósticos sectoriales</h5>

        ${renderSector('Movilidad', 'ds_movilidad_estado')}
        ${renderSector('Ambiente', 'ds_ambiente_estado')}
        ${renderSector('Espacio público', 'ds_espacio_publico_estado')}
        ${renderSector('Riesgos', 'ds_riesgos_estado')}
      </div>

      <div class="survey-section">
        <h5 class="section-title">3) Inventarios simples</h5>

        <div class="form-grid-2">
          <div class="form-group">
            <label for="inv_tipo">Tipo de inventario</label>
            <select id="inv_tipo" class="form-select">
              <option value="">Seleccione...</option>
              <option value="equipamiento">Equipamiento</option>
              <option value="conflicto_uso">Conflicto de uso</option>
              <option value="punto_critico">Punto crítico</option>
            </select>
            <small class="hint">ID: <code>inv_tipo</code></small>
          </div>

          <div class="form-group">
            <label for="inv_nombre">Nombre / referencia</label>
            <input id="inv_nombre" class="form-input" type="text">
            <small class="hint">ID: <code>inv_nombre</code></small>
          </div>
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label>Estado</label>
            <div class="radio-row">
              ${mkRadios('inv_estado', [['bueno','Bueno'],['regular','Regular'],['malo','Malo']])}
            </div>
            <small class="hint">ID: <code>inv_estado</code></small>
          </div>

          <div class="form-group">
            <label>Urgencia</label>
            <div class="radio-row">
              ${mkRadios('inv_urgencia', [['baja','Baja'],['media','Media'],['alta','Alta']])}
            </div>
            <small class="hint">ID: <code>inv_urgencia</code></small>
          </div>
        </div>
      </div>

      <div class="survey-section">
        <h5 class="section-title">4) Participación</h5>

        <div class="form-group">
          <label for="part_tipo">Tipo de aporte</label>
          <select id="part_tipo" class="form-select">
            <option value="">Seleccione...</option>
            <option value="propuesta">Propuesta</option>
            <option value="observacion">Observación</option>
            <option value="alerta">Alerta</option>
          </select>
          <small class="hint">ID: <code>part_tipo</code></small>
        </div>

        <div class="form-group">
          <label for="part_texto">Aporte</label>
          <textarea id="part_texto" class="form-input" rows="4"></textarea>
          <small class="hint">ID: <code>part_texto</code></small>
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label for="part_capa_ref">Capa de referencia (opcional)</label>
            <input id="part_capa_ref" class="form-input" type="text">
            <small class="hint">ID: <code>part_capa_ref</code></small>
          </div>

          <div class="form-group">
            <label for="part_obj_ref">ID objeto (opcional)</label>
            <input id="part_obj_ref" class="form-input" type="text">
            <small class="hint">ID: <code>part_obj_ref</code></small>
          </div>
        </div>

        <div class="form-group">
          <label for="part_contacto">Contacto (opcional)</label>
          <input id="part_contacto" class="form-input" type="text">
          <small class="hint">ID: <code>part_contacto</code></small>
        </div>
      </div>
    `;
  }

  // Diagnóstico sectorial — tarjeta con icono
  function renderSector(label, radioName, icon = 'fa-circle') {
    return `
      <div class="sv-sector-card">
        <div class="sv-sector-title">
          <i class="fas ${esc(icon)}"></i>
          ${esc(label)}
        </div>
        <div class="sv-radio-pills sv-estado">
          ${mkRadios(radioName, [['bueno','Bueno'],['regular','Regular'],['malo','Malo'],['na','N/A']])}
        </div>
      </div>
    `;
  }

  function mkChecks(name, items) {
    return items.map(([val, label]) => `
      <label class="sv-check-item">
        <input type="checkbox" name="${esc(name)}" value="${esc(val)}">
        <span>${esc(label)}</span>
      </label>
    `).join('');
  }

  function mkRadios(name, items) {
    return items.map(([val, label]) => `
      <label class="sv-radio-item" data-val="${esc(val)}">
        <input type="radio" name="${esc(name)}" value="${esc(val)}">
        ${esc(label)}
      </label>
    `).join('');
  }

  function injectLocalStylesOnce() {
    if (root.getElementById('surveyStylesV3')) return;
    const st = root.createElement('style');
    st.id = 'surveyStylesV3';
    st.textContent = `
      /* ── Shell ── */
      .sv-shell { font-family:'Segoe UI',Arial,sans-serif; color:#111827; padding:1.25rem; display:flex; flex-direction:column; gap:1.1rem; }

      /* ── Stepper ── */
      .sv-stepper { display:flex; align-items:center; gap:0; padding:.1rem 0; overflow-x:auto; }
      .sv-step { display:flex; flex-direction:column; align-items:center; gap:.3rem; min-width:72px; cursor:pointer; }
      .sv-step-icon {
        width:38px; height:38px; border-radius:50%;
        background:#f3f4f6; border:2px solid #e5e7eb;
        display:flex; align-items:center; justify-content:center;
        font-size:.85rem; color:#9ca3af;
        transition:all .2s;
      }
      .sv-step span { font-size:.68rem; font-weight:600; color:#9ca3af; white-space:nowrap; transition:color .2s; }
      .sv-step.active .sv-step-icon { background:#2563eb; border-color:#2563eb; color:#fff; }
      .sv-step.active span { color:#2563eb; }
      .sv-step.done .sv-step-icon { background:#dcfce7; border-color:#16a34a; color:#16a34a; }
      .sv-step.done span { color:#16a34a; }
      .sv-step-line { flex:1; height:2px; background:#e5e7eb; min-width:12px; }

      /* ── Meta bar ── */
      .sv-meta-bar { display:flex; gap:.65rem; flex-wrap:wrap; }
      .sv-meta-chip {
        display:flex; align-items:center; gap:.4rem;
        background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px;
        padding:.35rem .7rem; font-size:.78rem; color:#6b7280;
      }
      .sv-meta-chip i { color:#2563eb; }
      .sv-meta-lbl { color:#9ca3af; }
      .sv-meta-val { color:#111827; font-weight:700; font-family:monospace; font-size:.77rem; max-width:200px; overflow:hidden; text-overflow:ellipsis; }

      /* ── Panes ── */
      .sv-pane { display:none; flex-direction:column; gap:1rem; }
      .sv-pane.active { display:flex; }

      /* ── Pane header ── */
      .sv-pane-header {
        display:flex; align-items:center; gap:.85rem;
        padding:.85rem 1rem; border-radius:12px;
      }
      .sv-pane-icon {
        width:44px; height:44px; border-radius:10px;
        display:flex; align-items:center; justify-content:center;
        font-size:1.1rem; color:#fff; flex-shrink:0;
      }
      .sv-pane-title { font-weight:800; font-size:.95rem; }
      .sv-pane-sub { font-size:.78rem; opacity:.8; margin-top:.1rem; }

      .sv-color-blue   { background:linear-gradient(135deg,#eff6ff,#dbeafe); color:#1e40af; }
      .sv-color-blue   .sv-pane-icon { background:#2563eb; }
      .sv-color-purple { background:linear-gradient(135deg,#f5f3ff,#ede9fe); color:#5b21b6; }
      .sv-color-purple .sv-pane-icon { background:#7c3aed; }
      .sv-color-teal   { background:linear-gradient(135deg,#f0fdfa,#ccfbf1); color:#065f46; }
      .sv-color-teal   .sv-pane-icon { background:#059669; }
      .sv-color-orange { background:linear-gradient(135deg,#fff7ed,#fed7aa); color:#9a3412; }
      .sv-color-orange .sv-pane-icon { background:#ea580c; }
      .sv-color-green  { background:linear-gradient(135deg,#f0fdf4,#bbf7d0); color:#14532d; }
      .sv-color-green  .sv-pane-icon { background:#16a34a; }
      .sv-color-gray   { background:linear-gradient(135deg,#f9fafb,#f3f4f6); color:#374151; }
      .sv-color-gray   .sv-pane-icon { background:#6b7280; }

      /* ── Pane body ── */
      .sv-pane-body { display:flex; flex-direction:column; gap:.85rem; }

      /* ── Campos ── */
      .sv-field { display:flex; flex-direction:column; gap:.3rem; flex:1; }
      .sv-field-row { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; }
      .sv-label { font-size:.82rem; font-weight:700; color:#374151; display:flex; align-items:center; gap:.4rem; }
      .sv-tag { font-size:.7rem; font-weight:500; color:#9ca3af; background:#f3f4f6; border-radius:4px; padding:.05rem .35rem; }

      .sv-input, .sv-select, .sv-textarea {
        padding:.52rem .75rem; border:1.5px solid #d1d5db; border-radius:9px;
        font-size:.84rem; color:#111827; background:#fff; outline:none;
        transition:border-color .2s, box-shadow .2s;
        font-family:inherit;
      }
      .sv-input:focus, .sv-select:focus, .sv-textarea:focus {
        border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,.1);
      }
      .sv-textarea { resize:vertical; min-height:90px; }

      /* ── Checkboxes ── */
      .sv-check-grid { display:grid; grid-template-columns:1fr 1fr; gap:.4rem .5rem; }
      .sv-check-item {
        display:flex; align-items:center; gap:.5rem;
        padding:.4rem .6rem; border:1.5px solid #e5e7eb; border-radius:8px;
        cursor:pointer; font-size:.82rem; color:#374151; transition:all .15s;
      }
      .sv-check-item:hover { border-color:#2563eb; background:#eff6ff; }
      .sv-check-item input[type=checkbox] { accent-color:#2563eb; width:15px; height:15px; flex-shrink:0; }
      .sv-check-item.checked { border-color:#2563eb; background:#eff6ff; color:#1d4ed8; font-weight:600; }

      /* ── Radios tipo pill ── */
      .sv-radio-pills { display:flex; flex-wrap:wrap; gap:.4rem; }
      .sv-radio-item {
        display:flex; align-items:center; gap:.4rem;
        padding:.38rem .75rem; border:1.5px solid #e5e7eb; border-radius:20px;
        cursor:pointer; font-size:.82rem; color:#6b7280; transition:all .15s;
        background:#fff;
      }
      .sv-radio-item:hover { border-color:#2563eb; color:#2563eb; }
      .sv-radio-item input[type=radio] { display:none; }
      .sv-radio-item.checked { border-color:#2563eb; background:#2563eb; color:#fff; font-weight:700; }

      /* Pills de estado */
      .sv-estado .sv-radio-item.checked[data-val=bueno]    { background:#16a34a; border-color:#16a34a; }
      .sv-estado .sv-radio-item.checked[data-val=regular]  { background:#d97706; border-color:#d97706; }
      .sv-estado .sv-radio-item.checked[data-val=malo]     { background:#dc2626; border-color:#dc2626; }
      .sv-urgencia .sv-radio-item.checked[data-val=baja]   { background:#059669; border-color:#059669; }
      .sv-urgencia .sv-radio-item.checked[data-val=media]  { background:#d97706; border-color:#d97706; }
      .sv-urgencia .sv-radio-item.checked[data-val=alta]   { background:#dc2626; border-color:#dc2626; }

      /* ── Rating de estrellas numéricas ── */
      .sv-rating { display:flex; gap:.45rem; flex-wrap:wrap; }
      .sv-rating .sv-radio-item {
        width:46px; height:46px; border-radius:10px;
        justify-content:center; font-size:1.1rem; font-weight:800;
        padding:0;
      }
      .sv-rating .sv-radio-item.checked { background:#f59e0b; border-color:#f59e0b; color:#fff; }

      /* ── Sectores ── */
      .sv-sector-grid { display:grid; grid-template-columns:1fr 1fr; gap:.75rem; }
      .sv-sector-card {
        background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px;
        padding:.75rem; display:flex; flex-direction:column; gap:.5rem;
      }
      .sv-sector-title {
        display:flex; align-items:center; gap:.4rem;
        font-weight:700; font-size:.83rem; color:#374151;
      }
      .sv-sector-title i { color:#059669; }

      /* ── Ubicación ── */
      .sv-loc-grid { display:grid; grid-template-columns:1fr 1fr; gap:.65rem; margin-bottom:.75rem; }
      .sv-loc-coord {
        background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px;
        padding:.55rem .75rem; text-align:center;
      }
      .sv-loc-label { font-size:.74rem; color:#6b7280; margin-bottom:.15rem; display:flex; align-items:center; justify-content:center; gap:.3rem; }
      .sv-loc-value { font-size:.95rem; font-weight:700; color:#111827; font-family:monospace; }
      .sv-loc-actions { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:.6rem; }
      .sv-hint { font-size:.78rem; color:#6b7280; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:.45rem .65rem; display:flex; align-items:flex-start; gap:.4rem; }
      .sv-hint i { color:#0284c7; flex-shrink:0; margin-top:.05rem; }

      /* ── Botones ── */
      .sv-btn {
        display:inline-flex; align-items:center; gap:.4rem;
        padding:.48rem 1rem; border-radius:9px; border:none;
        font-size:.84rem; font-weight:700; cursor:pointer;
        transition:all .15s; white-space:nowrap; font-family:inherit;
      }
      .sv-btn:active { transform:scale(.97); }
      .sv-btn-sm { padding:.35rem .7rem; font-size:.79rem; }
      .sv-btn-primary { background:#2563eb; color:#fff; }
      .sv-btn-primary:hover { background:#1d4ed8; }
      .sv-btn-ghost { background:#f3f4f6; color:#374151; border:1px solid #e5e7eb; }
      .sv-btn-ghost:hover { background:#e5e7eb; }
      .sv-btn-success { background:#16a34a; color:#fff; }
      .sv-btn-success:hover { background:#15803d; }
      .sv-btn-danger { background:#dc2626; color:#fff; }
      .sv-btn-danger:hover { background:#b91c1c; }

      /* ── Nav inferior del pane ── */
      .sv-nav {
        display:flex; justify-content:space-between; align-items:center;
        padding-top:.75rem; border-top:1px solid #f3f4f6;
        margin-top:.25rem;
      }

      /* ── Historial ── */
      .sv-history-toolbar { display:flex; align-items:center; gap:.5rem; font-size:.83rem; color:#6b7280; flex-wrap:wrap; }
      .sv-badge {
        background:#2563eb; color:#fff; border-radius:20px;
        padding:.1rem .55rem; font-size:.78rem; font-weight:700;
      }
      .sv-history-list { display:flex; flex-direction:column; gap:.45rem; margin-top:.5rem; max-height:280px; overflow:auto; }
      .sv-history-item {
        display:flex; justify-content:space-between; align-items:center;
        padding:.55rem .75rem; border:1px solid #e5e7eb; border-radius:10px;
        background:#fff; gap:.75rem;
      }
      .sv-history-id { font-weight:700; color:#111827; font-size:.82rem; font-family:monospace; }
      .sv-history-sub { color:#6b7280; font-size:.76rem; margin-top:.1rem; }
      .sv-history-actions { display:flex; gap:.3rem; flex-shrink:0; }

      @media (max-width:580px){
        .sv-field-row { grid-template-columns:1fr; }
        .sv-check-grid { grid-template-columns:1fr; }
        .sv-sector-grid { grid-template-columns:1fr; }
        .sv-loc-grid { grid-template-columns:1fr 1fr; }
        .sv-stepper { gap:0; }
        .sv-step { min-width:52px; }
        .sv-step span { display:none; }
      }
    `;
    root.head.appendChild(st);
  }
}