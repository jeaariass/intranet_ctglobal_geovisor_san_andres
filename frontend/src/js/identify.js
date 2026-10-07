// /js/identify.js
export async function initIdentify(ctx) {
  const { map, root, eventBus } = ctx;
  if (!map) return;

  const btnToggle = root.querySelector('#btnIdentifyToggle');
  const btnClear  = root.querySelector('#btnIdentifyClear');
  const modeSel   = root.querySelector('#identifyMode');
  const resultsEl = root.querySelector('#identifyResults');
  if (!btnToggle || !btnClear || !modeSel || !resultsEl) return;

  // Capa de highlight
  const highlightSource = new ol.source.Vector();
  const highlightLayer = new ol.layer.Vector({
    source: highlightSource,
    style: new ol.style.Style({
      fill:   new ol.style.Fill({ color: 'rgba(234,179,8,0.20)' }),
      stroke: new ol.style.Stroke({ color: '#f59e0b', width: 3 }),
      image:  new ol.style.Circle({ radius: 5, fill: new ol.style.Fill({ color: '#f59e0b' }) }),
    }),
  });
  highlightLayer.setZIndex(1000);
  map.addLayer(highlightLayer);

  let running = false;
  let singleClickHandler = null;
  const geojson = new ol.format.GeoJSON();

  // Tooltip de ayuda (para que “se vea” que está activo)
  let helpOverlay, helpEl;
  function showHelpAt(coord, text) {
    if (!helpOverlay) {
      helpEl = document.createElement('div');
      helpEl.className = 'ol-tooltip ol-tooltip-help';
      helpOverlay = new ol.Overlay({ element: helpEl, offset: [10,0], positioning: 'center-left' });
      map.addOverlay(helpOverlay);
    }
    helpEl.textContent = text;
    helpEl.style.display = 'block';
    helpOverlay.setPosition(coord);
  }
  function hideHelp() { if (helpEl) helpEl.style.display = 'none'; }

  function setButtonState(isOn) {
    running = isOn;
    if (isOn) {
      btnToggle.textContent = 'Detener';
      btnToggle.classList.add('btn-danger');
      btnToggle.classList.remove('btn-primary');
      // cursor crosshair
      const tgt = map.getTargetElement();
      if (tgt) tgt.style.cursor = 'crosshair';
    } else {
      btnToggle.textContent = 'Iniciar';
      btnToggle.classList.remove('btn-danger');
      btnToggle.classList.add('btn-primary');
      const tgt = map.getTargetElement();
      if (tgt) tgt.style.cursor = '';
      hideHelp();
    }
  }
  setButtonState(false);

  function clearResults() {
    resultsEl.innerHTML = '';
    highlightSource.clear();
  }

  function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

  function getVisibleWmsLayersTopFirst() {
    const arr = [];
    map.getLayers().forEach((lyr) => {
      if (lyr instanceof ol.layer.Tile) {
        const src = lyr.getSource?.();
        if (src instanceof ol.source.TileWMS && lyr.getVisible()) arr.push(lyr);
      }
    });
    return arr.sort((a,b)=>(b.getZIndex()||0)-(a.getZIndex()||0));
  }
  function getTitleForLayer(lyr) {
    return lyr.get('title') || `${lyr.get('workspace')||''}:${lyr.get('layerName')||''}` || 'Capa WMS';
  }

  async function fetchGFI(src, coordinate, res, proj, preferJSON=true) {
    const commonParams = { FEATURE_COUNT: 10, QUERY_LAYERS: src.getParams().LAYERS };
    const infoFormat = preferJSON ? 'application/json' : 'text/html';
    const url = src.getFeatureInfoUrl(coordinate, res, proj, { INFO_FORMAT: infoFormat, ...commonParams });
    if (!url) return null;
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) return null;
    return preferJSON ? resp.json() : resp.text();
  }

  function appendResultCard(layerTitle, feature, idSeq, layerId) {
    const props = feature.getProperties();
    delete props.geometry;
    const entries = Object.entries(props).filter(([k,v]) => v!==null && v!==undefined && v!=='');
    const div = document.createElement('div');
    div.className = 'id-item';
    div.dataset.fid = String(idSeq);
    div.innerHTML = `
      <div class="id-head">
        <span class="title"><i class="fas fa-layer-group"></i> ${escapeHtml(layerTitle)}</span>
        <span class="actions">
          <button class="mbtn" data-action="zoom">Zoom</button>
          <button class="mbtn" data-action="del">🗑</button>
        </span>
      </div>
      <table class="id-table"><tbody>
        ${entries.map(([k,v])=>`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`).join('')}
      </tbody></table>
    `;
    const fCopy = feature.clone();
    fCopy.set('idSeq', idSeq);
    fCopy.set('layerId', layerId);
    highlightSource.addFeature(fCopy);
    resultsEl.prepend(div);
  }

  resultsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button.mbtn');
    if (!btn) return;
    const card = e.target.closest('.id-item');
    if (!card) return;
    const fid = Number(card.dataset.fid);
    const action = btn.dataset.action;

    if (action === 'del') {
      // quitar feature asociada y la card
      highlightSource.getFeatures().forEach((f) => {
        if (f.get('idSeq') === fid) highlightSource.removeFeature(f);
      });
      card.remove();
    } else if (action === 'zoom') {
      const feat = highlightSource.getFeatures().find(f => f.get('idSeq') === fid);
      if (feat) {
        map.getView().fit(feat.getGeometry().getExtent(), { maxZoom: 18, duration: 300, padding: [30,30,30,30] });
      }
    }
  });

  async function doIdentifyAtCoordinate(coordinate) {
    const res  = map.getView().getResolution();
    const proj = map.getView().getProjection();
    const layers = getVisibleWmsLayersTopFirst();
    if (!layers.length) return;

    const mode = modeSel.value; // 'top' | 'all'
    const toQuery = (mode === 'top') ? [layers[0]] : layers;

    let anyFound = false;
    let idSeq = Date.now();

    for (const lyr of toQuery) {
      const src = lyr.getSource();
      // 1) intentar JSON
      let data = await fetchGFI(src, coordinate, res, proj, true);
      if (data && data.features) {
        const feats = new ol.format.GeoJSON().readFeatures(data, { featureProjection: proj });
        if (feats.length) {
          anyFound = true;
          const layerTitle = getTitleForLayer(lyr);
          const layerId = lyr.get('layerName') || src.getParams().LAYERS;
          feats.forEach(f => appendResultCard(layerTitle, f, ++idSeq, layerId));
          if (mode === 'top') break;
          continue;
        }
      }
      // 2) fallback HTML (por si algún workspace viejo no tiene JSON)
      const html = await fetchGFI(src, coordinate, res, proj, false);
      if (html && /<table/i.test(html)) {
        anyFound = true;
        const layerTitle = getTitleForLayer(lyr);
        // no intentamos parsear HTML a feature; solo tarjeta “HTML crudo”
        const div = document.createElement('div');
        div.className = 'id-item';
        div.innerHTML = `
          <div class="id-head">
            <span class="title"><i class="fas fa-layer-group"></i> ${escapeHtml(layerTitle)} (HTML)</span>
          </div>
          <div class="id-html">${html}</div>
        `;
        resultsEl.prepend(div);
        if (mode === 'top') break;
      }
    }

    if (!anyFound) {
      const div = document.createElement('div');
      div.className = 'id-item';
      div.innerHTML = `<div class="id-head"><span class="title">Sin resultados</span></div>`;
      resultsEl.prepend(div);
    }
  }

  function onSingleClick(evt) {
    showHelpAt(evt.coordinate, 'Consultando…');
    doIdentifyAtCoordinate(evt.coordinate).finally(()=>hideHelp());
  }

  // pointermove solo para mostrar ayuda cuando está activo
  function onPointerMove(evt) {
    if (!running) return;
    if (evt.dragging) return;
    showHelpAt(evt.coordinate, 'Clic en el mapa para consultar');
  }

  map.on('pointermove', onPointerMove);

  // Integración suave con “Medición”: apágala al iniciar Identify
  function stopMeasureIfRunning() {
    ctx.eventBus.emit('measure:clearAll'); // limpia y detiene si estaba activa
  }

  btnToggle.addEventListener('click', () => {
    if (running) {
      if (singleClickHandler) {
        ol.Observable.unByKey(singleClickHandler);
        singleClickHandler = null;
      }
      setButtonState(false);
    } else {
      stopMeasureIfRunning();
      singleClickHandler = map.on('singleclick', onSingleClick);
      setButtonState(true);
    }
  });

  btnClear.addEventListener('click', () => clearResults());

  // Atajos externos
  eventBus.on('identify:clear', clearResults);
  eventBus.on('identify:start', () => {
    if (!running) {
      stopMeasureIfRunning();
      singleClickHandler = map.on('singleclick', onSingleClick);
      setButtonState(true);
    }
  });
  eventBus.on('identify:stop', () => {
    if (running) {
      if (singleClickHandler) ol.Observable.unByKey(singleClickHandler);  // ← correcto
      singleClickHandler = null; setButtonState(false);
    }
  });

  console.log('[identify] activo.');
}
