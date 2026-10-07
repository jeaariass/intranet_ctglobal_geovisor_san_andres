// /street360.js
let __streetLayer = null;
let __pano = null;
let __items = null;
let __isOn = false;
let __activeFeature = null;
let __coneLayer = null;
let __yawRAF = null;
let __lastYaw = null;
let __map = null;
let __ol  = null;


function normDeg(d) {
  return ((Number(d) % 360) + 360) % 360;
}

// Pannellum yaw → bearing de mapa (0° = norte, sentido horario)
function panoYawToBearing(yaw) {
  // Pannellum y el “frente” de la cámara quedan alineados agregando 180°
  // Si en el futuro usa northOffset, se puede sumar aquí también.
  return normDeg(Number(yaw) + 180);
}

// === BASE robusto (sirve en dev y cuando se despliegue) ===
function getBase() {
  // 1) Si Vite ya lo expuso desde index.html
  if (typeof window !== 'undefined' && window.__BASE_URL) return window.__BASE_URL;

  // 2) Si estamos dentro de un módulo (bundle) y existe import.meta
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) {
      return import.meta.env.BASE_URL;
    }
  } catch {}

  // 3) Fallback al <base href="..."> si existe
  const baseTag = document.querySelector('base')?.getAttribute('href');
  if (baseTag) return baseTag;

  // 4) Fallback mínimo: raíz
  return '/';
}

function baseJoin(path) {
  const base = getBase();
  return `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;
}

function normalizeSrc(relOrAbs) {
  const clean = String(relOrAbs || '').replace(/^\/+/, '');
  return baseJoin(clean);
}

async function loadManifest() {
  if (__items) return __items;

  const url = baseJoin('360/data/manifest.json');
  console.log('[street360] solicitando manifest:', url);   // 👈 LOG 1

  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url}`);

  __items = await res.json();

  __items.forEach(it => {
    it.lon = Number(it.lon);
    it.lat = Number(it.lat);
    it.heading = Number(it.heading || 0);
    // normalizar src respetando el base
    if (it.src) it.src = normalizeSrc(it.src);
    else {
      const id = (it.id || it.frame || 'pano_00000.jpg').replace(/^\/+/, '');
      it.src = baseJoin(`360/img/${id.replace(/\.jpg$/i, '')}.jpg`);
    }
  });
  console.log('[street360] manifest cargado. items:', __items.length);
  return __items;
}

function buildLayer(ol, map, items) {
  const feats = items.map(it => new ol.Feature({
    geometry: new ol.geom.Point(ol.proj.fromLonLat([it.lon, it.lat])),
    id: it.id, data: it
  }));

  const src = new ol.source.Vector({ features: feats });
  const layer = new ol.layer.Vector({
    source: src,
    style: new ol.style.Style({
      image: new ol.style.Circle({
        radius: 5,
        fill: new ol.style.Fill({ color: '#0a66c2' }),
        stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
      })
    })
  });
  layer.set('id','street360');
  map.addLayer(layer);
  return layer;
}

// === estilos base ===
const STYLE_NORMAL = new ol.style.Style({
  image: new ol.style.Circle({
    radius: 5,
    fill: new ol.style.Fill({ color: '#0a66c2' }),
    stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
  })
});

const STYLE_ACTIVE = new ol.style.Style({
  image: new ol.style.Circle({
    radius: 8,
    fill: new ol.style.Fill({ color: '#ffb703' }), // amarillo intenso
    stroke: new ol.style.Stroke({ color: '#000', width: 2 })
  })
});

const STYLE_HALO = new ol.style.Style({
  image: new ol.style.Circle({
    radius: 16,
    fill: new ol.style.Fill({ color: 'rgba(255,183,3,0.2)' }),
    stroke: new ol.style.Stroke({ color: 'rgba(255,183,3,0.5)', width: 2 })
  })
});

function openPanel() {
  const panel = document.getElementById('street360-panel');
  panel?.classList.remove('hidden');
  panel?.classList.add('show');

  // Asegura visor y recalcula tamaño tras el slide
  const pano = ensurePano();
  // dos frames + pequeño delay para que el panel ya tenga ancho real
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => pano && pano.resize(), 50);
    });
  });
}

function ensurePano() {
  if (__pano) return __pano;

  __pano = pannellum.viewer('s360-viewer', {
    default: {
      firstScene: 'main',
      autoLoad: true,
      compass: true,
      sceneFadeDuration: 0
    },
    scenes: {
      main: {
        type: 'equirectangular',
        panorama: normalizeSrc('360/img/pano_00000.jpg'),
        yaw: 0
      }
    },
    showControls: true,
    hfov: 90, minHfov: 40, maxHfov: 110
  });

  __pano.on('error', e => console.error('[street360] ERROR pannellum:', e));
  return __pano;
}

function loadPano(it) {
  const pano = ensurePano();
  const src = it.src || normalizeSrc(`360/img/${(it.id || it.frame || 'pano_00000.jpg')}`);
  const heading = Number(it.heading || 0);

  // ➜ yaw inicial = heading + 180 (frente)
  const yaw0 = (heading + 180) % 360;

  const cfg = pano.getConfig();
  cfg.scenes.main.type = 'equirectangular';
  cfg.scenes.main.panorama = src;

  // loadScene(sceneId, pitch, yaw, hfov, fadeDuration)
  pano.loadScene('main', null, yaw0, null, 0);

  setTimeout(() => {
    pano.resize();
    pano.setYaw(yaw0);
  }, 30);

  // si hay punto activo, arrancar sync del cono siguiendo el yaw del visor
  if (__activeFeature) {
    const itA = __activeFeature.get('data');
    startYawSync(__ol, __map, itA.lon, itA.lat); // el cono seguirá al yaw actual del visor
  }
}

export async function initStreet360(ctx) {
  const { map, root } = ctx || {};
  if (!map || !root || typeof ol === 'undefined') {
    console.error('[street360] Falta map/root u OpenLayers (ol)');
    return;
  }
  __map = map;
  __ol  = ol;

  const btn = root.querySelector('#btn-street360');
  const btnClose = root.querySelector('#s360-close');
  if (!btn) {
    console.warn('[street360] No existe #btn-street360 en el DOM');
    return;
  }

  // Botón principal: toggle abrir/cerrar
  btn.addEventListener('click', async () => {
    try {
      if (isPanelOpen()) {
        closePanel();            // cierra y limpia cono + resaltado
        return;
      }

      if (!__isOn) {
        const items = await loadManifest();
        __streetLayer = buildLayer(ol, map, items);
        map.getView().animate({
          center: ol.proj.fromLonLat([items[0].lon, items[0].lat]),
          zoom: 16,
          duration: 300
        });
        __isOn = true;
      }

      openPanel();               // abre panel (no recrea capa)
    } catch (e) {
      console.error('[street360] Error cargando:', e);
      alert('No se pudo cargar el módulo 360. Revisa la consola.');
    }
  });

  // Botón cerrar (X)
  btnClose?.addEventListener('click', () => closePanel());

  // Click en mapa: resalta punto, dibuja cono y carga 360
  map.on('singleclick', (evt) => {
    if (!__isOn) return;

    let picked = null;
    map.forEachFeatureAtPixel(evt.pixel, (ft, layer) => {
      if (layer?.get('id') === 'street360') picked = ft;
    });
    if (!picked) return;

    // Restablecer estilo del anterior activo
    if (__activeFeature) __activeFeature.setStyle(STYLE_NORMAL);

    // Nuevo activo: estilo + halo
    picked.setStyle([STYLE_ACTIVE, STYLE_HALO]);
    __activeFeature = picked;

    const it = picked.get('data');

    // Dibuja/actualiza cono según heading del punto
    buildCone(ol, map, it.lon, it.lat, normDeg((it.heading || 0) + 180));

    // Abre panel (ajusta tamaño del visor)
    openPanel();

    // Carga imagen 360 y arranca sincronización de cono con yaw del visor
    loadPano(it);

    // Mostrar Street View real (Google)
    initGSV(it.lat, it.lon);

  });
}


function buildCone(ol, map, lon, lat, headingDeg, length = 25, angle = 25) {
  // normaliza heading a [0, 360)
  const h = ((Number(headingDeg) % 360) + 360) % 360;

  const center4326 = [lon, lat];
  const center = ol.proj.fromLonLat(center4326);
  const proj = map.getView().getProjection();
  const toRad = Math.PI / 180;

  // desplazamiento aproximado en grados (latitud/longitud) para 'length' metros
  const dDeg = length / 111320; // aprox. 1° ≈ 111.32 km

  const left4326 = [
    lon + dDeg * Math.sin((h - angle) * toRad),
    lat + dDeg * Math.cos((h - angle) * toRad)
  ];
  const right4326 = [
    lon + dDeg * Math.sin((h + angle) * toRad),
    lat + dDeg * Math.cos((h + angle) * toRad)
  ];

  const left = ol.proj.transform(left4326, 'EPSG:4326', proj);
  const right = ol.proj.transform(right4326, 'EPSG:4326', proj);

  const polygon = new ol.geom.Polygon([[center, left, right, center]]);
  const ft = new ol.Feature({ geometry: polygon });

  const style = new ol.style.Style({
    fill: new ol.style.Fill({ color: 'rgba(255,183,3,0.3)' }),
    stroke: new ol.style.Stroke({ color: '#ffb703', width: 2 })
  });
  ft.setStyle(style);

  if (!__coneLayer) {
    __coneLayer = new ol.layer.Vector({ source: new ol.source.Vector(), zIndex: 999 });
    map.addLayer(__coneLayer);
  }
  __coneLayer.getSource().clear();
  __coneLayer.getSource().addFeature(ft);
}

function startYawSync(ol, map, lon, lat) {
  stopYawSync();
  __lastYaw = null;

  const loop = () => {
    if (!__pano || !__activeFeature) return;

    const yaw = Number(__pano.getYaw() || 0);
    const bearing = panoYawToBearing(yaw); // 👈 convierte yaw del visor a bearing de mapa

    if (__lastYaw === null || Math.abs(bearing - __lastYaw) > 0.1) {
      __lastYaw = bearing;
      buildCone(ol, map, lon, lat, bearing);
    }
    __yawRAF = requestAnimationFrame(loop);
  };
  __yawRAF = requestAnimationFrame(loop);
}


function stopYawSync() {
  if (__yawRAF) cancelAnimationFrame(__yawRAF);
  __yawRAF = null;
  __lastYaw = null;
}

// --- NUEVO: helpers de panel ---
function isPanelOpen() {
  const p = document.getElementById('street360-panel');
  return p?.classList.contains('show');
}

function clearConeAndActive() {
  // quitar cono
  if (__coneLayer) __coneLayer.getSource()?.clear();
  // detener sincronización
  stopYawSync();
  // restablecer estilo del punto activo
  if (__activeFeature) {
    __activeFeature.setStyle(STYLE_NORMAL);
    __activeFeature = null;
  }
}

// --- Actualice closePanel() para limpiar todo ---
function closePanel() {
  const panel = document.getElementById('street360-panel');
  panel?.classList.remove('show');
  clearConeAndActive();
}



// panellium y streett si algo borrar  ---

let __gsv = null;
let __gsvService = null;

function initGSV(lat, lon) {
  if (!window.google || !google.maps) {
    console.error('[GSV] Google Maps JS API no cargada.');
    return;
  }

  const svContainer = document.getElementById('gsv-viewer');
  if (!svContainer) return;

  if (!__gsvService) __gsvService = new google.maps.StreetViewService();

  __gsvService.getPanorama({ location: { lat, lng: lon }, radius: 50 }, (data, status) => {
    if (status === 'OK') {
      __gsv = new google.maps.StreetViewPanorama(svContainer, {
        pano: data.location.pano,
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
      });
    } else {
      svContainer.innerHTML = `<p style="text-align:center;padding-top:2em;">No disponible en Google Street View</p>`;
    }
  });
}
