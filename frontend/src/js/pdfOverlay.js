// /js/pdfOverlay.js
// PDFs georreferenciados como WMS con "fondo blanco" SOLO dentro del bounding box.
// Se integra al mismo panel de capas (como un grupo más), sin UI adicional.
// Requiere: GEOSERVER_PATH en ./config.js y OL global (ol).

import { GEOSERVER_PATH } from './config.js';

/** ------------------------------------------------------------------------
 *  Catálogo local (ajusta workspace/layer/name según tus capas reales)
 * ---------------------------------------------------------------------- */
const PDF_LAYERS = [
  
];

/** Utils seguros -------------------------------------------------------- */
function getMapCode(map) {
  try {
    const code = map?.getView?.()?.getProjection?.()?.getCode?.();
    return typeof code === 'string' ? code : 'EPSG:3857';
  } catch { return 'EPSG:3857'; }
}

function projIsRegistered(code) {
  try {
    return !!ol.proj.get(code);
  } catch { return false; }
}

function safeTransformExtent(extent, src, dst) {
  // Si el origen y destino son iguales o no hay transform necesaria
  if (src === dst) return extent;
  // Si alguna de las proyecciones no está registrada, no transformamos
  if (!projIsRegistered(src) || !projIsRegistered(dst)) {
    throw new Error(`No hay definición registrada para transformar de ${src} a ${dst}`);
  }
  return ol.proj.transformExtent(extent, src, dst);
}

function parseBBoxNode(bb) {
  const minx = parseFloat(bb.getAttribute('minx') ?? bb.getAttribute('minX'));
  const miny = parseFloat(bb.getAttribute('miny') ?? bb.getAttribute('minY'));
  const maxx = parseFloat(bb.getAttribute('maxx') ?? bb.getAttribute('maxX'));
  const maxy = parseFloat(bb.getAttribute('maxy') ?? bb.getAttribute('maxY'));
  return [minx, miny, maxx, maxy];
}

/** ------------------------------------------------------------------------
 *  Lee GetCapabilities y devuelve el extent del layer en el CRS del mapa
 *  - Robusto a que EPSG:9377 no esté registrada en OL
 * ---------------------------------------------------------------------- */
async function fetchExtentToMapCrs(map, workspace, layerName) {
  const url = `${GEOSERVER_PATH}/${workspace}/wms?service=WMS&version=1.3.0&request=GetCapabilities`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`GetCapabilities HTTP ${resp.status}`);
  const xmlText = await resp.text();
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');

  // Buscar <Layer> objetivo
  const layers = Array.from(xml.getElementsByTagName('Layer'));
  const full = `${workspace}:${layerName}`;
  let target = null;
  for (const L of layers) {
    const Name = L.getElementsByTagName('Name')[0]?.textContent?.trim();
    if (Name === full || Name === layerName) { target = L; break; }
  }
  if (!target) throw new Error(`Capa no encontrada: ${full}`);

  // Recolectar BoundingBox
  const mapCode = getMapCode(map);
  const bbs = Array.from(target.getElementsByTagName('BoundingBox'))
    .map(bb => ({ crs: (bb.getAttribute('CRS') || bb.getAttribute('crs') || '').trim(), extent: parseBBoxNode(bb) }));

  // Preferencia 1: bbox en el mismo CRS del mapa
  const bbMap = bbs.find(b => b.crs === mapCode);
  if (bbMap) return bbMap.extent;

  // Preferencia 2: bbox 3857 -> map
  const bb3857 = bbs.find(b => b.crs === 'EPSG:3857');
  if (bb3857) {
    try { return safeTransformExtent(bb3857.extent, 'EPSG:3857', mapCode); }
    catch { /* seguimos a siguientes opciones */ }
  }

  // Preferencia 3: EX_GeographicBoundingBox (4326) -> map
  const ex = target.getElementsByTagName('EX_GeographicBoundingBox')[0];
  if (ex) {
    const west = parseFloat(ex.getElementsByTagName('westBoundLongitude')[0].textContent);
    const south= parseFloat(ex.getElementsByTagName('southBoundLatitude')[0].textContent);
    const east = parseFloat(ex.getElementsByTagName('eastBoundLongitude')[0].textContent);
    const north= parseFloat(ex.getElementsByTagName('northBoundLatitude')[0].textContent);
    const extent4326 = [west, south, east, north];
    try { return safeTransformExtent(extent4326, 'EPSG:4326', mapCode); }
    catch { /* intentamos 9377 si es posible */ }
  }

  // Preferencia 4: bbox 9377 -> map (solo si 9377 está disponible)
  const bb9377 = bbs.find(b => b.crs === 'EPSG:9377');
  if (bb9377 && projIsRegistered('EPSG:9377')) {
    try { return safeTransformExtent(bb9377.extent, 'EPSG:9377', mapCode); }
    catch { /* última opción falla -> error abajo */ }
  }

  // Si llegamos aquí, no hay forma segura de obtener extent en el CRS del mapa
  throw new Error(`No se pudo obtener un extent utilizable para ${full} hacia ${mapCode}`);
}

/** ------------------------------------------------------------------------
 *  Fondo blanco como vector layer (polígono del bbox) bajo el WMS
 * ---------------------------------------------------------------------- */
function createWhiteBackdropLayer(extentMap) {
  const [minx, miny, maxx, maxy] = extentMap;
  const poly = new ol.geom.Polygon([[ [minx,miny],[maxx,miny],[maxx,maxy],[minx,maxy],[minx,miny] ]]);
  const feat = new ol.Feature(poly);
  const src  = new ol.source.Vector({ features: [feat] });

  const layer = new ol.layer.Vector({
    source: src,
    style: new ol.style.Style({
      fill:   new ol.style.Fill({ color: 'rgba(255,255,255,1)' }),
      stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0)', width: 0 }),
    }),
  });
  layer.setZIndex(349); // debajo del WMS (350)
  layer.set('title', 'PDF background');
  layer.set('isPdfBackdrop', true);
  return layer;
}

/** ------------------------------------------------------------------------
 *  Capa WMS del PDF (TRANSPARENT:true para ver solo el PDF sobre el fondo blanco)
 * ---------------------------------------------------------------------- */
function createPdfWmsLayer({ workspace, layer, title }) {
  const source = new ol.source.TileWMS({
    url: `${GEOSERVER_PATH}/${workspace}/wms`,
    params: {
      LAYERS:      `${workspace}:${layer}`,
      VERSION:     '1.1.1',
      FORMAT:      'image/png',
      TRANSPARENT: true,
      TILED:       true,
    },
    serverType: 'geoserver',
    crossOrigin: 'anonymous',
  });

  const wms = new ol.layer.Tile({ title, source });
  wms.setZIndex(350);
  wms.set('workspace', workspace);
  wms.set('layerName', layer);
  wms.set('title', title);
  wms.set('isPdf', true);
  return wms;
}

/** ------------------------------------------------------------------------
 *  Creador de un Group por PDF: [backdrop (cuando llegue el extent), WMS]
 * ---------------------------------------------------------------------- */
function createPdfGroupLayer(ctx, item) {
  const { map } = ctx;
  const group = new ol.layer.Group();
  group.set('title', item.name);
  group.set('isPdfGroup', true);
  group.set('workspace', item.workspace);
  group.set('layerName', item.layer);

  // Capa WMS (encima)
  const wms = createPdfWmsLayer({ workspace: item.workspace, layer: item.layer, title: item.name });
  group.setLayers(new ol.Collection([ wms ]));
  group.setVisible(false); // por defecto apagado

  // Async: cargar extent y colocar fondo blanco + limitar WMS
  (async () => {
    try {
      const extentMap = await fetchExtentToMapCrs(map, item.workspace, item.layer);

      // Limitar el WMS al bbox (evita pintar fuera)
      wms.setExtent(extentMap);

      // Fondo blanco SOLO dentro del bbox, debajo del WMS
      const backdrop = createWhiteBackdropLayer(extentMap);
      const coll = group.getLayers();
      coll.insertAt(0, backdrop);
    } catch (e) {
      console.warn(`[pdfOverlay] No se pudo calcular extent para ${item.workspace}:${item.layer}`, e);
    }
  })();

  return group;
}

/** ------------------------------------------------------------------------
 *  API pública para layers.js
 * ---------------------------------------------------------------------- */
export function getPdfLayerGroup() {
  return {
    key: 'pdfs',
    title: 'Herramientas',
    layers: PDF_LAYERS.map((item) => ({
      id: item.id,
      olLayer: (ctx) => createPdfGroupLayer(ctx, item),
    })),
  };
}
