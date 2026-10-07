// /js/catastroStyles.js
// Estilos y utilidades compartidas para las capas de catastro de San Andrés
// (Predios + Predios patrimoniales). Datos fuente: window.PREDIOS_DATA /
// window.PATRIMONIO_DATA, cargados por <script> en index.html antes de main.js.
// Requiere OpenLayers global (ol).

export const DESTINO_LABELS = {
  'A': 'Habitacional',
  'B': 'Industrial',
  'C': 'Comercial',
  'D': 'Agropecuario',
  'E': 'Minero',
  'F': 'Cultural',
  'G': 'Recreacional / Deportivo',
  'H': 'Salubridad',
  'I': 'Institucional',
  'J': 'Lote sin construcción',
  'K': 'Educativo',
  'L': 'Religioso',
  'P': 'Pecuario',
  'R': 'Recreación y deporte',
  'S': 'Servicios especiales',
  'T': 'Transporte y comunicaciones',
};

const PATRIMONIO_POR_CODIGO = {};
(window.PATRIMONIO_DATA?.features || []).forEach((f) => {
  PATRIMONIO_POR_CODIGO[f.properties.CODIGO] = f.properties;
});

const CODIGOS_PREDIOS = {};
(window.PREDIOS_DATA?.features || []).forEach((f) => {
  CODIGOS_PREDIOS[f.properties.CODIGO] = true;
});

export function clean(val) {
  return (val && String(val).trim()) ? String(val).trim() : null;
}

export function isPatrimonio(props) {
  return !!(props && props.inmueble);
}

export function patrimonioDe(props) {
  if (!props) return null;
  if (isPatrimonio(props)) return props;
  return PATRIMONIO_POR_CODIGO[props.CODIGO] || null;
}

/** Capa "Predios patrimoniales": solo los bienes que NO están ya en Predios (evita duplicar geometría). */
export function soloPatrimonioFilter(feature) {
  return !CODIGOS_PREDIOS[feature.properties.CODIGO];
}

function olStyle({ fillColor, strokeColor, width, fillOpacity, opacity }) {
  return new ol.style.Style({
    fill: new ol.style.Fill({ color: hexToRgba(fillColor, fillOpacity) }),
    stroke: new ol.style.Stroke({ color: hexToRgba(strokeColor, opacity), width }),
  });
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const DEFAULT_STYLE               = olStyle({ fillColor: '#1D9E75', strokeColor: '#ffffff', width: 1,   fillOpacity: .55, opacity: .9 });
const HIGHLIGHT_STYLE             = olStyle({ fillColor: '#0F6E56', strokeColor: '#111827', width: 2.5, fillOpacity: .85, opacity: 1 });
const PATRIMONIO_STYLE            = olStyle({ fillColor: '#D97706', strokeColor: '#7C2D12', width: 1.5, fillOpacity: .6,  opacity: .9 });
const PATRIMONIO_HIGHLIGHT_STYLE  = olStyle({ fillColor: '#B45309', strokeColor: '#111827', width: 2.5, fillOpacity: .85, opacity: 1 });
const PREDIO_PATRIMONIAL_STYLE           = olStyle({ fillColor: '#1D9E75', strokeColor: '#D97706', width: 3, fillOpacity: .55, opacity: 1 });
const PREDIO_PATRIMONIAL_HIGHLIGHT_STYLE = olStyle({ fillColor: '#0F6E56', strokeColor: '#B45309', width: 4, fillOpacity: .85, opacity: 1 });

/** Estilo (función) para usar directamente como `style` de un ol.layer.Vector. */
export function styleForFeature(feature) {
  const props = feature.getProperties();
  if (isPatrimonio(props)) return PATRIMONIO_STYLE;
  return patrimonioDe(props) ? PREDIO_PATRIMONIAL_STYLE : DEFAULT_STYLE;
}

export function highlightStyleForFeature(feature) {
  const props = feature.getProperties();
  if (isPatrimonio(props)) return PATRIMONIO_HIGHLIGHT_STYLE;
  return patrimonioDe(props) ? PREDIO_PATRIMONIAL_HIGHLIGHT_STYLE : HIGHLIGHT_STYLE;
}
