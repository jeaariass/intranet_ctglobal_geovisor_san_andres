/* /js/coordpicker.js
Herramienta "Capturar coordenadas" con Start/Stop, marcador, tooltip, Zoom y abrir en Google Maps.
FIX: remover correctamente el listener retornado por map.on(...) usando ol.Observable.unByKey(key)
*/

export function initCoordinatePicker(ctx) {
const { map, root, eventBus } = ctx || {};
if (!map || !root) {
console.error('[coordpicker] faltan ctx.map o ctx.root');
return;
}

const btnToggle = root.querySelector('#btnCoordPickToggle');
const btnClear = root.querySelector('#btnCoordPickClear');
const outEl = root.querySelector('#coordPickDisplay');
const mapsLink = root.querySelector('#coordPickGoogle');
const zoomBtn = root.querySelector('#coordPickZoom');

if (!btnToggle || !outEl || !mapsLink) {
console.warn('[coordpicker] Faltan elementos en el DOM (#btnCoordPickToggle, #coordPickDisplay, #coordPickGoogle).');
return;
}

// Capa y estilo del marcador
const src = new ol.source.Vector();
const style = new ol.style.Style({
image: new ol.style.Circle({
radius: 6,
fill: new ol.style.Fill({ color: '#10b981' }),
stroke: new ol.style.Stroke({ color: '#064e3b', width: 2 }),
}),
});

const layer = new ol.layer.Vector({ source: src, style });
layer.setZIndex(1200);
layer.set('title', 'Coordenada (capturada)');
map.addLayer(layer);

// Estado
let running = false;
let clickKey = null;

// Tooltip de ayuda
let helpOverlay = null;
let helpEl = null;

function showHelpAt(coord, text) {
if (!helpOverlay) {
helpEl = document.createElement('div');
helpEl.className = 'ol-tooltip ol-tooltip-help';
helpOverlay = new ol.Overlay({
element: helpEl,
offset: [10, 0],
positioning: 'center-left'
});
map.addOverlay(helpOverlay);
}
helpEl.textContent = text;
helpEl.style.display = 'block';
helpOverlay.setPosition(coord);
}

function hideHelp() {
if (helpEl) helpEl.style.display = 'none';
}

function setButtonState(isOn) {
running = isOn;

if (isOn) {
  btnToggle.textContent = 'Detener';
  btnToggle.classList.add('btn-danger');
  btnToggle.classList.remove('btn-primary');
  map.getTargetElement().style.cursor = 'crosshair';
} else {
  btnToggle.textContent = 'Iniciar';
  btnToggle.classList.remove('btn-danger');
  btnToggle.classList.add('btn-primary');
  map.getTargetElement().style.cursor = '';
  hideHelp();
}

}

// Estado inicial
setButtonState(false);
outEl.innerHTML = 'Sin coordenadas.';

// Utilidades formato
const f6 = (n) => (Math.round(Number(n) * 1e6) / 1e6).toFixed(6);
const f2 = (n) => (Math.round(Number(n) * 1e2) / 1e2).toFixed(2);

// Render de salida
function writeOutput(mapCoord) {
const proj = map.getView().getProjection();
const [lon, lat] = ol.proj.toLonLat(mapCoord, proj);

const x = f2(mapCoord[0]);
const y = f2(mapCoord[1]);

outEl.innerHTML = `
  <div><strong>Geográficas (WGS84):</strong> lat ${f6(lat)}, lon ${f6(lon)}</div>
  <div><strong>Mapa (${proj.getCode()}):</strong> X ${x}, Y ${y}</div>
`;

mapsLink.href = `https://www.google.com/maps?q=${f6(lat)},${f6(lon)}`;
mapsLink.target = '_blank';
mapsLink.rel = 'noopener';

}

function placeMarker(mapCoord) {
src.clear();
src.addFeature(new ol.Feature(new ol.geom.Point(mapCoord)));
writeOutput(mapCoord);
}

function zoomToMarker() {
const f = src.getFeatures()[0];
if (!f) return;
const ext = f.getGeometry().getExtent();
map.getView().fit(ext, { duration: 400, maxZoom: 18, padding: [40, 40, 40, 40] });
}

// FIX: desregistrar por key correctamente
function unbindSingleClick() {
if (!clickKey) return;
try {
if (ol && ol.Observable && typeof ol.Observable.unByKey === 'function') {
ol.Observable.unByKey(clickKey);
} else {
// Fallback: si por alguna razón no existe unByKey, se evita dejar el modo corriendo.
console.warn('[coordpicker] ol.Observable.unByKey no está disponible; no se puede desregistrar por key.');
}
} finally {
clickKey = null;
}
}

// Eventos
function onPointerMove(evt) {
if (!running || evt.dragging) return;
showHelpAt(evt.coordinate, 'Clic en el mapa para capturar coordenadas');
}
map.on('pointermove', onPointerMove);

function stop() {
unbindSingleClick();
setButtonState(false);
}

function onClick(evt) {
// Defensa ante doble disparo o estados inconsistentes
if (!running) return;

placeMarker(evt.coordinate);

// Abrir maps en nueva pestaña
const href = mapsLink.href;
if (href) {
  try { window.open(href, '_blank', 'noopener'); } catch (e) { /* noop */ }
}

// Detener modo captura
stop();

}

function start() {
// Asegurar que no quede un listener anterior
unbindSingleClick();

clickKey = map.on('singleclick', onClick);
setButtonState(true);

}

// UI
btnToggle.addEventListener('click', () => (running ? stop() : start()));

if (btnClear) {
btnClear.addEventListener('click', () => {
src.clear();
outEl.innerHTML = 'Sin coordenadas.';
});
}

if (zoomBtn) {
zoomBtn.addEventListener('click', () => zoomToMarker());
}

// Si cambias de pestaña, detener (opcional)
root.querySelectorAll('.tab').forEach((tab) => {
tab.addEventListener('click', () => { if (running) stop(); });
});

// Atajos por eventBus (si existe)
if (eventBus && typeof eventBus.on === 'function') {
eventBus.on('coordpick', () => start());
eventBus.on('coordpick', () => stop());
eventBus.on('coordpick', () => {
src.clear();
outEl.innerHTML = 'Sin coordenadas.';
});
}

console.log('[coordpicker] listo.');
}