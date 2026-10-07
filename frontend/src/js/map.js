// js/map.js – Mapas base con miniaturas + formatos de coordenadas + escala dinámica
// Requiere OpenLayers (ol) y proj4 (globales) por CDN.

// ====== Texto del panel info (botón "i") ======
const INFO_HTML = `
  <p>
    Formatos de coordenadas disponibles:
    <strong>Geográficas</strong> (Longitud/Latitud, °),
    <strong>Geodésicas</strong> (E/N – MAGNA-SIRGAS 2018 Origen Nacional),
    <strong>Planas</strong> (X/Y – Web Mercator).
  </p>
  <p>
    Mapas base: <em>Construcciones (OSM)</em>, <em>Satelital (Esri World Imagery)</em>,
    <em>Terreno (OpenTopoMap)</em>.
  </p>
`;

// ====== Utilidades ======
function fmtNumber(n, dec = 0) {
  return Number(n).toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtScale(n) {
  const s = Math.round(n);
  return '1:' + s.toLocaleString('es-CO');
}

export async function initMap(ctx) {
  const { eventBus, mapEl, root } = ctx;
  if (!mapEl) throw new Error('No existe el contenedor del mapa (#map)');

  // Quitar solo el placeholder (si existe)
  const ph = mapEl.querySelector('.map-placeholder');
  if (ph) ph.remove();

  // ====== Registrar EPSG:9377 (MAGNA-SIRGAS 2018 / Origen-Nacional) en proj4 ======
  if (typeof proj4 !== 'undefined' && typeof proj4.defs === 'function') {
    if (!proj4.defs['EPSG:9377']) {
      proj4.defs(
        'EPSG:9377',
        '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 ' +
        '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs'
      );
    }
  } else {
    console.warn('[map] proj4 no está disponible; Geodésicas (E/N 9377) no funcionará.');
  }

  // ====== Referencias UI para coordenadas/escala ======
  const coordLonEl   = root.querySelector('#coordLon');
  const coordLatEl   = root.querySelector('#coordLat');
  const coordScaleEl = root.querySelector('#coordScale');
  const coordLabel1  = root.querySelector('#coordLabel1'); // Longitud / E / X
  const coordLabel2  = root.querySelector('#coordLabel2'); // Latitud  / N / Y
  const coordFormat  = root.querySelector('#coordFormat');

  // Formato actual y última posición del puntero (lon/lat)
  let formatMode = (coordFormat?.value) || 'geo'; // 'geo' | 'geod' | 'plana'
  let lastLonLat = null;

  function setLabels() {
    if (!coordLabel1 || !coordLabel2) return;
    if (formatMode === 'geo')   { coordLabel1.textContent = 'Longitud:'; coordLabel2.textContent = 'Latitud:'; }
    if (formatMode === 'geod')  { coordLabel1.textContent = 'E (m):';    coordLabel2.textContent = 'N (m):'; }
    if (formatMode === 'plana') { coordLabel1.textContent = 'X (m):';    coordLabel2.textContent = 'Y (m):'; }
  }
  setLabels();

  // ====== Centro San Andrés ======
  const SAN_ANDRES_LON = -81.7032;
  const SAN_ANDRES_LAT = 12.5567;
  const HOME_CENTER_3857 = ol.proj.fromLonLat([SAN_ANDRES_LON, SAN_ANDRES_LAT]);
  const HOME_ZOOM = 15;

  // ====== CAPAS BASE (visibilidad exclusiva) ======
  const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM({
      attributions: '© OpenStreetMap contributors',
    }),
    visible: true, // Construcciones por defecto
  });

  const esriSatLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
    }),
    visible: false,
  });

  const opentopoLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attributions: 'Map data © OpenStreetMap contributors, SRTM | Map style © OpenTopoMap (CC-BY-SA)',
      maxZoom: 17,
    }),
    visible: false,
  });

  const baseLayers = {
    osm: osmLayer,        // Construcciones
    sat: esriSatLayer,    // Satelital
    terrain: opentopoLayer// Terreno
  };

  // ====== Vista ======
  const view = new ol.View({
    center: HOME_CENTER_3857,
    zoom: HOME_ZOOM,
    minZoom: 2,
    maxZoom: 20,
  });

  // ====== Controles sin zoom nativo ======
  let controls;
  try {
    if (ol.control?.defaults?.defaults) {
      controls = ol.control.defaults.defaults({ attribution: true, rotate: true, zoom: false });
    } else if (typeof ol.control?.defaults === 'function') {
      controls = ol.control.defaults({ attribution: true, rotate: true, zoom: false });
    }
  } catch (e) { /* noop */ }
  if (!controls) controls = new ol.Collection([ new ol.control.Attribution(), new ol.control.Rotate() ]);

  // ====== Crear mapa ======
  const map = new ol.Map({
    target: mapEl,
    layers: [osmLayer, esriSatLayer, opentopoLayer],
    view,
    controls,
  });
  setTimeout(() => map.updateSize(), 0);

  // Exponer en contexto
  ctx.map = map;
  ctx.flyToDosquebradas = (z = HOME_ZOOM) =>
    view.animate({ center: HOME_CENTER_3857, zoom: z, duration: 600 });

  // ====== Escala dinámica ======
  function updateScale() {
    if (!coordScaleEl) return;
    const proj = view.getProjection();
    const center = view.getCenter();
    const resolution = view.getResolution();
    if (resolution == null || !center) return;
    const mPerPixel = ol.proj.getPointResolution(proj, resolution, center, 'm');
    const DPI = 96, INCHES_PER_M = 39.37;
    coordScaleEl.textContent = fmtScale(mPerPixel * DPI * INCHES_PER_M);
  }

  // ====== Coordenadas dinámicas (según formato) ======
  function updateCoordsFromLonLat(lon, lat) {
    if (!coordLonEl || !coordLatEl) return;

    if (formatMode === 'geo') {
      coordLonEl.textContent = fmtNumber(lon, 6);
      coordLatEl.textContent = fmtNumber(lat, 6);
    } else if (formatMode === 'plana') {
      const [x, y] = ol.proj.fromLonLat([lon, lat]); // EPSG:3857
      coordLonEl.textContent = fmtNumber(x, 2);
      coordLatEl.textContent = fmtNumber(y, 2);
    } else { // 'geod' => EPSG:9377 E/N
      if (typeof proj4 !== 'undefined') {
        const [E, N] = proj4('EPSG:4326', 'EPSG:9377', [lon, lat]);
        coordLonEl.textContent = fmtNumber(E, 2);
        coordLatEl.textContent = fmtNumber(N, 2);
      } else {
        coordLonEl.textContent = '—';
        coordLatEl.textContent = '—';
      }
    }
  }

  // Mouse move → actualizar coords y emitir evento
  map.on('pointermove', (evt) => {
    const [lon, lat] = ol.proj.toLonLat(evt.coordinate);
    lastLonLat = [lon, lat];
    updateCoordsFromLonLat(lon, lat);
    eventBus.emit('map:coords', { lon, lat, lonFixed: lon.toFixed(6), latFixed: lat.toFixed(6) });
  });

  // Cambio de formato
  coordFormat?.addEventListener('change', () => {
    formatMode = coordFormat.value;
    setLabels();
    const src = lastLonLat || ol.proj.toLonLat(view.getCenter());
    updateCoordsFromLonLat(src[0], src[1]);
  });

  // Escala al cambiar zoom/mover
  view.on('change:resolution', updateScale);
  map.on('moveend', updateScale);
  updateScale();

  // ====== Controles personalizados (zoom+/−, home, info) ======
  const zoomInBtn  = root.querySelector('#zoomInBtn');
  const zoomOutBtn = root.querySelector('#zoomOutBtn');
  const homeBtn    = root.querySelector('#homeBtn');
  const infoBtn    = root.querySelector('#infoBtn');

  zoomInBtn?.addEventListener('click', () =>
    view.animate({ zoom: (view.getZoom() ?? HOME_ZOOM) + 1, duration: 200 })
  );
  zoomOutBtn?.addEventListener('click', () =>
    view.animate({ zoom: (view.getZoom() ?? HOME_ZOOM) - 1, duration: 200 })
  );
  homeBtn?.addEventListener('click', () =>
    view.animate({ center: HOME_CENTER_3857, zoom: HOME_ZOOM, duration: 500 })
  );

  // Panel info
  const infoPanel      = root.querySelector('#infoPanel');
  const infoPanelClose = root.querySelector('#infoPanelClose');
  const infoPanelBody  = root.querySelector('#infoPanelBody');
  function openInfo() { if (infoPanelBody) infoPanelBody.innerHTML = INFO_HTML; infoPanel?.removeAttribute('hidden'); }
  function closeInfo() { infoPanel?.setAttribute('hidden', ''); }
  infoBtn?.addEventListener('click', () => { if (!infoPanel) return; if (infoPanel.hasAttribute('hidden')) openInfo(); else closeInfo(); });
  infoPanelClose?.addEventListener('click', closeInfo);
  root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && infoPanel && !infoPanel.hasAttribute('hidden')) closeInfo(); });

    // ====== Panel de mapas base (debajo del botón) ======
    const basemapBtn   = root.querySelector('#basemapBtn');
    const basemapPanel = root.querySelector('#basemapPanel');

    basemapBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation(); // evita que el click cierre el panel inmediatamente
    if (basemapPanel?.hasAttribute('hidden')) basemapPanel.removeAttribute('hidden');
    else basemapPanel?.setAttribute('hidden','');
    });

    // Cerrar si se hace click fuera del panel o del botón
    root.addEventListener('click', (ev) => {
    const withinBtn   = basemapBtn?.contains(ev.target);
    const withinPanel = basemapPanel?.contains(ev.target);
    if (!withinBtn && !withinPanel) {
        basemapPanel?.setAttribute('hidden','');
    }
    });

    // Manejar selección de basemap dentro del panel
    basemapPanel?.addEventListener('click', (e) => {
    const card = e.target.closest('.bm-card');
    if (!card) return;
    const key = card.getAttribute('data-key');

    // Visibilidad exclusiva
    Object.entries(baseLayers).forEach(([k, lyr]) => lyr.setVisible(k === key));

    // Resaltar activo
    basemapPanel.querySelectorAll('.bm-card').forEach(b => b.classList.remove('active'));
    card.classList.add('active');

    // (Opcional) cerrar al seleccionar:
    // basemapPanel.setAttribute('hidden','');
    });

  console.log('[map] listo. Base activa: Construcciones (OSM). Formato coords:', formatMode);
}
