// /js/measure.js
// Medición (Área / Perímetro) con Start/Stop, cambio de tipo que detiene,
// lista persistente, borrado individual/total y resaltado al hacer Zoom.
// Requiere OpenLayers (ol) global y que ctx.map exista (tras initMap).

export async function initMeasure(ctx) {
  const { map, root, eventBus } = ctx;
  if (!map) {
    console.error('[measure] No existe ctx.map; inicializa el mapa primero.');
    return;
  }

  // ====== UI ======
  const typeSelect = root.querySelector('#measurementTypeSelect'); // 'area' | 'perimeter' | ''
  const btnStart   = root.querySelector('#btnMeasureStart');       // Iniciar / Detener
  const btnClear   = root.querySelector('#btnMeasureClear');       // Limpiar todo
  const listEl     = root.querySelector('#measureList');           // Lista de mediciones

  if (!typeSelect || !btnStart || !btnClear || !listEl) {
    console.warn('[measure] Faltan elementos: #measurementTypeSelect, #btnMeasureStart, #btnMeasureClear, #measureList.');
    return;
  }

  // ====== Estilos (normal y resaltado) ======
  const styleNormal = new ol.style.Style({
    fill:   new ol.style.Fill({ color: 'rgba(37,99,235,0.15)' }),   // azul 600 translúcido
    stroke: new ol.style.Stroke({ color: '#2563eb', width: 2 }),
    image:  new ol.style.Circle({ radius: 4, fill: new ol.style.Fill({ color: '#2563eb' }) }),
  });
  const styleHighlight = new ol.style.Style({
    fill:   new ol.style.Fill({ color: 'rgba(239,68,68,0.20)' }),   // rojo 500 translúcido
    stroke: new ol.style.Stroke({ color: '#ef4444', width: 3 }),
    image:  new ol.style.Circle({ radius: 5, fill: new ol.style.Fill({ color: '#ef4444' }) }),
  });

  // ====== Capa vectorial para mediciones persistentes ======
  const drawSource = new ol.source.Vector();
  const drawLayer = new ol.layer.Vector({
    source: drawSource,
    style: (feature) => feature.get('highlight') ? styleHighlight : styleNormal,
  });
  drawLayer.setZIndex(999);
  map.addLayer(drawLayer);

  // ====== Estado ======
  let isRunning = false;           // ¿hay medición activa?
  let currentKind = '';            // 'area' | 'perimeter'
  let draw = null;                 // interacción Draw activa
  let sketch = null;               // feature en edición
  let geomChangeKey = null;        // listener a geometry change

  const view = map.getView();
  let measureIdSeq = 1;
  const overlays = new Map();      // id -> { overlay, element }
  const featuresById = new Map();  // id -> feature

  // Para controlar resaltado temporal
  let highlightedId = null;
  let highlightTimer = null;

  // ====== Tooltips (solo durante medición) ======
  let helpTooltip = null, helpEl = null;
  let dynTooltip  = null,  dynEl  = null;

  function createHelpTooltip() {
    destroyHelpTooltip();
    helpEl = document.createElement('div');
    helpEl.className = 'ol-tooltip ol-tooltip-help';
    helpEl.style.display = 'none';
    helpTooltip = new ol.Overlay({
      element: helpEl,
      offset: [15, 0],
      positioning: 'center-left',
    });
    map.addOverlay(helpTooltip);
  }
  function destroyHelpTooltip() {
    if (helpTooltip) map.removeOverlay(helpTooltip);
    helpTooltip = null;
    helpEl = null;
  }
  function createDynTooltip() {
    destroyDynTooltip();
    dynEl = document.createElement('div');
    dynEl.className = 'ol-tooltip ol-tooltip-measure';
    dynTooltip = new ol.Overlay({
      element: dynEl,
      offset: [0, -15],
      positioning: 'bottom-center',
    });
    map.addOverlay(dynTooltip);
  }
  function destroyDynTooltip() {
    if (dynTooltip) map.removeOverlay(dynTooltip);
    dynTooltip = null;
    dynEl = null;
  }

  // ====== Formato de valores ======
  function formatLength(line) {
    const length = ol.sphere.getLength(line, { projection: view.getProjection() });
    if (length >= 1000) return (length / 1000).toFixed(2) + ' km';
    return length.toFixed(0) + ' m';
  }
  function formatArea(polygon) {
    const area = ol.sphere.getArea(polygon, { projection: view.getProjection() });
    if (area >= 1e6) return (area / 1e6).toFixed(2) + ' km²';
    if (area >= 1e4) return (area / 1e4).toFixed(2) + ' ha';
    return area.toFixed(0) + ' m²';
  }

  // ====== Lista en UI ======
  function addListItem(id, labelText) {
    const li = document.createElement('li');
    li.dataset.mid = String(id);
    li.innerHTML = `
      <span class="mlabel"><i class="fas fa-check-circle" style="color:#2563eb"></i> ${labelText}</span>
      <span>
        <button class="mbtn" data-action="zoom">Zoom</button>
        <button class="mbtn" data-action="del">🗑</button>
      </span>
    `;
    listEl.appendChild(li);
  }
  function removeListItem(id) {
    listEl.querySelector(`li[data-mid="${id}"]`)?.remove();
  }

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button.mbtn');
    if (!btn) return;
    const li = e.target.closest('li[data-mid]');
    if (!li) return;
    const id = Number(li.dataset.mid);
    const action = btn.dataset.action;

    if (action === 'del') {
      removeMeasurement(id);
    } else if (action === 'zoom') {
      const feat = featuresById.get(id);
      if (feat) {
        const extent = feat.getGeometry().getExtent();
        map.getView().fit(extent, { maxZoom: 18, duration: 300, padding: [30,30,30,30] });
        highlightMeasurement(id); // <<--- RESALTAR
      }
    }
  });

  // ====== Resaltar medición al hacer zoom ======
  function highlightMeasurement(id, ms = 2000) {
    // quitar resaltado previo
    if (highlightTimer) {
      clearTimeout(highlightTimer);
      highlightTimer = null;
    }
    if (highlightedId != null && highlightedId !== id) {
      const prev = featuresById.get(highlightedId);
      if (prev) {
        prev.set('highlight', false);
        prev.changed();
      }
    }

    // aplicar resaltado a la actual
    const feat = featuresById.get(id);
    if (feat) {
      feat.set('highlight', true);
      feat.changed();
      highlightedId = id;

      // quitar resaltado después de ms
      highlightTimer = setTimeout(() => {
        const f = featuresById.get(id);
        if (f) {
          f.set('highlight', false);
          f.changed();
        }
        highlightedId = null;
        highlightTimer = null;
      }, ms);
    }
  }

  // ====== Crear resultado estático ======
  function finalizeMeasurement(geomType, geom) {
    const id = measureIdSeq++;

    // Overlay estático
    const el = document.createElement('div');
    el.className = 'ol-tooltip ol-tooltip-static';
    const text = (geomType === 'Polygon') ? formatArea(geom) : formatLength(geom);
    el.textContent = text;

    const ov = new ol.Overlay({
      element: el,
      offset: [0, -7],
      positioning: (geomType === 'Polygon') ? 'center-center' : 'bottom-center',
    });
    map.addOverlay(ov);
    if (geomType === 'Polygon') ov.setPosition(geom.getInteriorPoint().getCoordinates());
    else ov.setPosition(geom.getLastCoordinate());

    overlays.set(id, { overlay: ov, element: el });

    // Feature persistente (copia de la geometría)
    const feat = new ol.Feature({ geometry: geom.clone() });
    feat.set('measureId', id);
    feat.set('highlight', false);
    drawSource.addFeature(feat);
    featuresById.set(id, feat);

    // Agregar a la lista
    const label = (geomType === 'Polygon') ? `Área: ${text}` : `Perímetro: ${text}`;
    addListItem(id, label);
  }

  function removeMeasurement(id) {
    // si la eliminada era la resaltada, limpiar estado
    if (highlightedId === id) {
      highlightedId = null;
      if (highlightTimer) { clearTimeout(highlightTimer); highlightTimer = null; }
    }
    const feat = featuresById.get(id);
    if (feat) {
      drawSource.removeFeature(feat);
      featuresById.delete(id);
    }
    const rec = overlays.get(id);
    if (rec) {
      map.removeOverlay(rec.overlay);
      overlays.delete(id);
    }
    removeListItem(id);
  }

  function removeAllMeasurements() {
    highlightedId = null;
    if (highlightTimer) { clearTimeout(highlightTimer); highlightTimer = null; }
    drawSource.clear();
    featuresById.clear();
    overlays.forEach(({ overlay }) => map.removeOverlay(overlay));
    overlays.clear();
    listEl.innerHTML = '';
    stopMeasure(); // también detenemos si estaba midiendo
    setStartButton(false);
  }

  // ====== Start / Stop ======
  function startMeasure(kind) {
    // kind: 'area' | 'perimeter'
    stopMeasure(); // limpiar cualquier sesión previa
    currentKind = kind;

    // tooltips de trabajo
    createHelpTooltip();
    createDynTooltip();

    // ayuda dinámica durante medición
    const pointerMove = (evt) => {
      if (evt.dragging || !helpEl) return;
      const msg = sketch ? 'Clic para continuar, doble clic para terminar' : 'Clic para comenzar';
      helpEl.textContent = msg;
      helpEl.style.display = 'block';
      helpTooltip.setPosition(evt.coordinate);
    };
    map.on('pointermove', pointerMove);
    startMeasure._pointerMove = pointerMove;

    // interacción
    const drawType = (kind === 'area') ? 'Polygon' : 'LineString';
    draw = new ol.interaction.Draw({
      source: new ol.source.Vector(), // temporal
      type: drawType,
      stopClick: false,
    });
    map.addInteraction(draw);

    draw.on('drawstart', (evt) => {
      sketch = evt.feature;
      geomChangeKey = sketch.getGeometry().on('change', (e) => {
        const g = e.target;
        let out, coord;
        if (g.getType() === 'Polygon') {
          out = formatArea(g);
          coord = g.getInteriorPoint().getCoordinates();
        } else {
          out = formatLength(g);
          coord = g.getLastCoordinate();
        }
        if (dynEl) dynEl.textContent = out;
        if (dynTooltip) dynTooltip.setPosition(coord);
      });
    });

    draw.on('drawend', (evt) => {
      const g = evt.feature.getGeometry();
      finalizeMeasurement(drawType, g);

      if (geomChangeKey) ol.Observable.unByKey(geomChangeKey);
      geomChangeKey = null;
      sketch = null;

      // nuevo tooltip dinámico para la siguiente geometría
      destroyDynTooltip();
      createDynTooltip();
    });

    isRunning = true;
    setStartButton(true);
  }

  function stopMeasure() {
    if (draw) {
      map.removeInteraction(draw);
      draw = null;
    }
    if (geomChangeKey) {
      ol.Observable.unByKey(geomChangeKey);
      geomChangeKey = null;
    }
    if (startMeasure._pointerMove) {
      map.un('pointermove', startMeasure._pointerMove);
      startMeasure._pointerMove = null;
    }
    destroyDynTooltip();
    destroyHelpTooltip();
    sketch = null;
    isRunning = false;
  }

  // ====== Botón Iniciar/Detener ======
  function setStartButton(running) {
    if (!btnStart) return;
    if (running) {
      btnStart.textContent = 'Detener';
      btnStart.classList.add('btn-danger');
      btnStart.classList.remove('btn-primary');
      btnStart.setAttribute('aria-pressed', 'true');
    } else {
      btnStart.textContent = 'Iniciar';
      btnStart.classList.remove('btn-danger');
      btnStart.classList.add('btn-primary');
      btnStart.setAttribute('aria-pressed', 'false');
    }
  }
  setStartButton(false); // estado inicial

  // ====== Enlaces de UI ======
  btnStart.addEventListener('click', () => {
    if (isRunning) {
      stopMeasure();
      setStartButton(false);
      return;
    }
    const kind = (typeSelect.value || '').toLowerCase();
    if (kind !== 'area' && kind !== 'perimeter') return;
    startMeasure(kind);
  });

  // Cambiar tipo → detener y esperar a que el usuario pulse Iniciar
  typeSelect.addEventListener('change', () => {
    if (isRunning) {
      stopMeasure();
      setStartButton(false);
    }
    currentKind = (typeSelect.value || '').toLowerCase();
  });

  btnClear.addEventListener('click', removeAllMeasurements);

  // Atajos desde otros módulos (opcionales)
  eventBus.on('measure:clearAll', removeAllMeasurements);
  eventBus.on('measure:start', ({ type }) => {
    if (type === 'area' || type === 'perimeter') {
      typeSelect.value = type;
      // startMeasure(type); // si quisieras iniciar automáticamente
    }
  });

  // Tecla Escape: cancelar medición activa
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && isRunning) {
      stopMeasure();
      setStartButton(false);
    }
  });

  console.log('[measure] Listo: Start/Stop, cambio de tipo detiene, lista, borrado y highlight en Zoom.');
}
