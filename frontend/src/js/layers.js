// /js/layers.js
// UI y lógica de capas WMS (GeoServer) + Dock inferior (orden y opacidad).
// Requiere: OpenLayers global (ol), ctx.map y ctx.eventBus.
// Integra los PDFs desde pdfOverlay.js como un grupo más.

import { GEOSERVER_PATH } from './config.js';
import { getPdfLayerGroup } from './pdfOverlay.js';
import { styleForFeature, soloPatrimonioFilter } from './catastroStyles.js';

/** ============= Helper: crea una capa vectorial a partir de un GeoJSON en memoria ============= */
function createVectorGeoJSON(featureCollection, title, opts = {}) {
  const { visible = true, zIndex = 310, style } = opts;

  const source = new ol.source.Vector({
    features: new ol.format.GeoJSON().readFeatures(featureCollection, {
      featureProjection: 'EPSG:3857',
    }),
  });

  const layer = new ol.layer.Vector({ title, visible, source, style });
  layer.setZIndex(zIndex);
  layer.set('title', title);
  return layer;
}

/** ============= Helper: crea una capa WMS Tile con parámetros estándar ============= */
function createWMS(workspace, layer, title, opts = {}) {
  const {
    visible     = false,
    zIndex      = 300,
    version     = '1.1.1',           // 1.1.1 usa "SRS", 1.3.0 usa "CRS"
    format      = 'image/png',
    transparent = true,
    tiled       = true,
    styles      = '',                 // nombre de estilo en GeoServer, si aplica
    extraParams = {},                 // para CQL_FILTER u otros
  } = opts;

  const source = new ol.source.TileWMS({
    url: `${GEOSERVER_PATH}/${workspace}/wms`,
    params: {
      LAYERS:      `${workspace}:${layer}`,
      VERSION:     version,
      FORMAT:      format,
      TRANSPARENT: transparent,
      TILED:       tiled,
      STYLES:      styles,
      ...extraParams,
    },
    serverType: 'geoserver',
    crossOrigin: 'anonymous',
  });

  const wms = new ol.layer.Tile({
    title,
    visible,
    source,
  });
  wms.setZIndex(zIndex);
  // Metadatos útiles
  wms.set('workspace', workspace);
  wms.set('layerName', layer);
  wms.set('title', title);
  return wms;
}

/** ==================== Define tus grupos y capas “core” aquí ==================== */
const CORE_GROUPS = [
  {
    key: 'catastro', // Predios + patrimonio (datos locales, sin GeoServer)
    title: 'Catastro Predial',
    layers: [
      {
        id: 'predios',
        olLayer: () =>
          createVectorGeoJSON(
            window.PREDIOS_DATA || { type: 'FeatureCollection', features: [] },
            'Predios',
            { visible: true, zIndex: 310, style: styleForFeature }
          ),
      },
      {
        id: 'patrimonio',
        olLayer: () => {
          const raw = window.PATRIMONIO_DATA || { type: 'FeatureCollection', features: [] };
          const filtered = { type: 'FeatureCollection', features: raw.features.filter(soloPatrimonioFilter) };
          return createVectorGeoJSON(filtered, 'Predios patrimoniales', {
            visible: true,
            zIndex: 311,
            style: styleForFeature,
          });
        },
      },
    ],
  },
];

// En estos grupos NO se muestra el control de opacidad en el panel superior.
const NO_PANEL_OPACITY_KEYS = new Set(['pdfs']);

/** ==================== UI de grupos/capas (ojo + opacidad condicional) ==================== */
function renderLayersUI(rootEl, ctx, groups, olLayersById) {
  const { eventBus } = ctx;
  rootEl.innerHTML = '';

  groups.forEach((group) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'layer-group';

    groupEl.innerHTML = `
      <div class="layer-group__header">
        <i class="fas fa-layer-group"></i>
        <span>${group.title}</span>
      </div>
      <div class="layer-group__body" data-group="${group.key}"></div>
    `;
    const bodyEl = groupEl.querySelector('.layer-group__body');

    // Ocultamos slider arriba en los grupos definidos:
    const showOpacityInPanel = !NO_PANEL_OPACITY_KEYS.has(group.key);

    group.layers.forEach((def) => {
      const layer = olLayersById.get(def.id);
      if (!layer) return;

      const isVisible  = !!layer.getVisible();
      const curOpacity = typeof layer.getOpacity === 'function' ? (layer.getOpacity() ?? 1) : 1;

      const itemEl = document.createElement('div');
      itemEl.className = 'layer-item' + (isVisible ? ' active' : '');

      // Fila principal (título + ojo)
      const rowHtml = `
        <div class="layer-row">
          <span class="layer-title">${layer.get('title') || def.id}</span>
          <button class="layer-btn" title="Mostrar/Ocultar">
            <i class="fas ${isVisible ? 'fa-eye' : 'fa-eye-slash'}"></i>
          </button>
        </div>
      `;

      // Slider de opacidad (solo si está permitido en este grupo)
      const opacityHtml = showOpacityInPanel
        ? `
          <div class="opacity-row opacity-row--tall">
            <input class="opacity-slider" type="range" min="0" max="1" step="0.05" value="${curOpacity}">
            <span class="opacity-val">${Math.round(curOpacity * 100)}%</span>
          </div>
        `
        : ''; // no se muestra en base/estrat/pdfs

      itemEl.innerHTML = rowHtml + opacityHtml;

      const eyeBtn   = itemEl.querySelector('.layer-btn');
      const eyeIcon  = eyeBtn.querySelector('i');
      const title    = layer.get('title') || def.id;

      function setVisible(v) {
        layer.setVisible(v);
        if (v) {
          itemEl.classList.add('active');
          eyeIcon.classList.replace('fa-eye-slash','fa-eye');
        } else {
          itemEl.classList.remove('active');
          eyeIcon.classList.replace('fa-eye','fa-eye-slash');
        }
        eventBus.emit('layer:visibility', { title, visible: v });
      }

      eyeBtn.addEventListener('click', (e) => { e.stopPropagation(); setVisible(!layer.getVisible()); });

      // Si está permitido el slider en este grupo, lo cableamos:
      if (showOpacityInPanel) {
        const slider   = itemEl.querySelector('.opacity-slider');
        const labelVal = itemEl.querySelector('.opacity-val');

        slider?.addEventListener('input', () => {
          const val = Number(slider.value);
          labelVal.textContent = `${Math.round(val * 100)}%`;

          if (typeof layer.setOpacity === 'function') layer.setOpacity(val);
          if (layer.getLayers) layer.getLayers().forEach(ch => ch.setOpacity?.(val));

          eventBus.emit('layer:opacity', { title, opacity: val });
        });
      }

      bodyEl.appendChild(itemEl);
    });

    rootEl.appendChild(groupEl);
  });
}

/** ==================== Inicializador del módulo ==================== */
export async function initLayers(ctx) {
  const { map, root, eventBus } = ctx;
  if (!map) {
    console.error('[layers] ctx.map no existe. Asegúrate de que initMap corre antes.');
    return;
  }

  // 1) Grupos finales: core + PDFs
  const PDF_GROUP = getPdfLayerGroup();
  const ALL_GROUPS = PDF_GROUP.layers.length > 0
    ? [...CORE_GROUPS, PDF_GROUP]
    : [...CORE_GROUPS];


  // 2) Crear capas y agregarlas al mapa
  const olLayersById = new Map();
  ALL_GROUPS.forEach((group) => {
    group.layers.forEach((def) => {
      try {
        const layer = def.olLayer(ctx);
        if (layer) {
          olLayersById.set(def.id, layer);
          map.addLayer(layer);
        }
      } catch (e) {
        console.error('[layers] Error creando capa', def.id, e);
      }
    });
  });

  // 3) Renderizar UI principal (ojo; opacidad condicional)
  const panelEl = root.querySelector('#layersPanel');
  if (!panelEl) {
    console.warn('[layers] No existe #layersPanel en el DOM.');
    return;
  }
  renderLayersUI(panelEl, ctx, ALL_GROUPS, olLayersById);

  // ===== 4) Dock inferior: orden y opacidad (para TODAS las capas visibles) =====
  // Buscar el dock que ya existe en el HTML
  const zDock = root.querySelector('#zOrderDock');
  if (!zDock) {
    console.warn('[layers] No se encontró #zOrderDock en el HTML');
    return;
  }
  const zList = zDock.querySelector('#zOrderList');
  if (!zList) {
    console.warn('[layers] No se encontró #zOrderList dentro del dock');
    return;
  }

  // Helpers: buscar por título dentro del mapa (incluye Groups)
  function findLayersByTitle(title) {
    const found = [];
    (function each(layer) {
      if (layer && typeof layer.get === 'function') {
        const t = layer.get('title');
        if (t && t.trim() === title) found.push(layer);
      }
      if (layer && layer.getLayers) {
        layer.getLayers().forEach(each);
      }
    })(map.getLayerGroup());
    return found;
  }

  // Orden activo Top→Bottom (índice 0 = más arriba)
  const activeOrder = [];

  function layerIsInDock(title) {
    return activeOrder.includes(title);
  }
  function addToDock(title) {
    if (!layerIsInDock(title)) activeOrder.unshift(title); // al activarse, entra arriba
    renderDock();
    applyZIndexFromOrder();
  }
  function removeFromDock(title) {
    const i = activeOrder.indexOf(title);
    if (i >= 0) activeOrder.splice(i, 1);
    renderDock();
    applyZIndexFromOrder();
  }

  // Aplica zIndex según activeOrder
  const BASE_TOP_Z = 1000;
  const STEP_Z     = 2;
  function applyZIndexFromOrder() {
    let z = BASE_TOP_Z;
    for (const title of activeOrder) {
      const layers = findLayersByTitle(title);
      layers.forEach((lyr) => {
        lyr.setZIndex?.(z);
        if (lyr.getLayers) lyr.getLayers().forEach(ch => ch.setZIndex?.(z));
      });
      z -= STEP_Z;
    }
  }

  // Construcción de item del dock (con slider SIEMPRE aquí)
  function buildDockItem(title) {
    const layers = findLayersByTitle(title);
    let curOpacity = 1;
    if (layers[0] && typeof layers[0].getOpacity === 'function') {
      curOpacity = layers[0].getOpacity() ?? 1;
    }

    const item = document.createElement('div');
    item.className = 'zDock__item';
    item.dataset.title = title;

    item.innerHTML = `
      <div class="zDock__row">
        <span class="zDock__handle" title="Arrastrar" aria-label="Arrastrar" draggable="true">☰</span>
        <span class="zDock__title">${title}</span>
      </div>
      <div class="zDock__opacity">
        <input class="zDock__slider" type="range" min="0" max="1" step="0.05" value="${curOpacity}">
        <span class="zDock__oval">${Math.round(curOpacity * 100)}%</span>
      </div>
    `;

    const handle  = item.querySelector('.zDock__handle');
    const slider  = item.querySelector('.zDock__slider');
    const oval    = item.querySelector('.zDock__oval');

    // Solo el HANDLE es draggable; el slider NO inicia drag
    handle.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', title);
      item.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => item.classList.remove('dragging'));

    // Evitar que el slider dispare drag: hacerlo "alto" + parar eventos de puntero
    slider.addEventListener('pointerdown', (e) => e.stopPropagation());
    slider.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    slider.addEventListener('mousedown',  (e) => e.stopPropagation());
    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      oval.textContent = `${Math.round(val * 100)}%`;
      layers.forEach((lyr) => {
        lyr.setOpacity?.(val);
        if (lyr.getLayers) lyr.getLayers().forEach(ch => ch.setOpacity?.(val));
      });
      eventBus.emit('layer:opacity', { title, opacity: val });
    });

    return item;
  }

  // Render dock
  function renderDock() {
    zList.innerHTML = '';
    activeOrder.forEach((title) => {
      zList.appendChild(buildDockItem(title));
    });
  }

  // DnD en el dock
  zList.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    const dragging = zList.querySelector('.zDock__item.dragging');
    if (!dragging) return;
    const after = Array.from(zList.querySelectorAll('.zDock__item:not(.dragging)'))
      .find(el => {
        const box = el.getBoundingClientRect();
        return ev.clientY <= box.top + box.height / 2;
      });
    if (after) zList.insertBefore(dragging, after);
    else zList.appendChild(dragging);
  });

  zList.addEventListener('drop', () => {
    activeOrder.length = 0;
    Array.from(zList.querySelectorAll('.zDock__item')).forEach(el => {
      activeOrder.push(el.dataset.title);
    });
    applyZIndexFromOrder();
  });

  // Sincronizar con visibilidad desde la UI principal
  eventBus.on('layer:visibility', ({ title, visible }) => {
    if (visible) addToDock(title);
    else removeFromDock(title);
  });

  // Inicial: meter al dock lo que ya está visible
  const initiallyVisible = [];
  ALL_GROUPS.forEach(g => {
    g.layers.forEach(d => {
      const lyr = olLayersById.get(d.id);
      if (lyr?.getVisible?.()) initiallyVisible.push(lyr.get('title') || d.id);
    });
  });
  initiallyVisible.forEach(addToDock);

  // Exponer para módulos que necesiten referenciar capas por id (p.ej. predioPanel.js)
  ctx.olLayersById = olLayersById;

  console.log('[layers] Capas registradas:', [...olLayersById.keys()]);
}