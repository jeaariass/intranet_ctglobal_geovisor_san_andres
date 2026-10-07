// /js/predioPanel.js
// Panel de detalle de predio/bien patrimonial — clic sobre las capas
// "Predios" / "Predios patrimoniales" (creadas en layers.js a partir de
// window.PREDIOS_DATA / window.PATRIMONIO_DATA).
// Requiere OpenLayers global (ol), ctx.map, ctx.olLayersById.

import { DESTINO_LABELS, clean, isPatrimonio, patrimonioDe, highlightStyleForFeature } from './catastroStyles.js';

export async function initPredioPanel(ctx) {
  const { map, root, olLayersById } = ctx;
  if (!map || !olLayersById) return;

  const prediosLayer    = olLayersById.get('predios');
  const patrimonioLayer = olLayersById.get('patrimonio');
  if (!prediosLayer && !patrimonioLayer) return;

  const panel        = root.querySelector('#predioPanel');
  const detailBox     = root.querySelector('#predioDetail');
  const nodataBox     = root.querySelector('#predioNoData');
  if (!panel || !detailBox || !nodataBox) {
    console.warn('[predioPanel] Falta markup del panel en el DOM.');
    return;
  }

  const els = {
    badgeDetail:   root.querySelector('#predio-patrimonio-badge'),
    badgeNodata:   root.querySelector('#predio-nodata-patrimonio'),
    nombre:        root.querySelector('#predio-nombre'),
    codigo:        root.querySelector('#predio-codigo'),
    matricula:     root.querySelector('#predio-matricula'),
    direccion:     root.querySelector('#predio-direccion'),
    areaTerreno:   root.querySelector('#predio-area-terreno'),
    areaConstr:    root.querySelector('#predio-area-construccion'),
    destino:       root.querySelector('#predio-destino'),
    avaluo:        root.querySelector('#predio-avaluo'),
    fotoBox:       root.querySelector('#predio-foto-box'),
    fotoEmpty:     root.querySelector('#predio-foto-empty'),
    foto:          root.querySelector('#predio-foto'),
    btnPdf:        root.querySelector('#btnPredioPdf'),
    btnFichaDet:   root.querySelector('#btnPredioFichaPatrimonio'),
    btnFichaNodata:root.querySelector('#btnPredioNodataFichaPatrimonio'),
    nodataCodigo:  root.querySelector('#predio-nodata-codigo'),
    close:         root.querySelector('#predioPanelClose'),
  };

  let activeFeature = null;
  let currentProps  = null;

  // Códigos de predio que SÍ tienen PDF real en data/pdfs/ (la mayoría no tiene).
  // Sin esto, el botón quedaba habilitado siempre y al hacer clic en un predio sin
  // ficha, el navegador pedía un PDF inexistente y Vite devolvía index.html de vuelta
  // (parecía que "reabría el visor").
  let prediosConFicha = new Set();
  fetch('data/doc-manifest.json')
    .then((r) => r.json())
    .then((manifest) => {
      const folder = manifest.find((f) => f.key === 'predios');
      (folder?.files || []).forEach((f) => {
        const codigo = String(f.id || '').replace(/^pdf_/, '');
        if (codigo) prediosConFicha.add(codigo);
      });
    })
    .catch((e) => console.warn('[predioPanel] No se pudo cargar doc-manifest.json:', e.message));

  function layerFilter(l) { return l === prediosLayer || l === patrimonioLayer; }

  function resetActiveStyle() {
    if (activeFeature) activeFeature.setStyle(undefined);
    activeFeature = null;
  }

  function closePanel() {
    resetActiveStyle();
    currentProps = null;
    panel.setAttribute('hidden', '');
  }

  function cargarFoto(src) {
    if (!src) {
      els.foto.removeAttribute('src');
      els.fotoBox.classList.add('hidden');
      els.fotoEmpty.classList.remove('hidden');
      return;
    }
    els.foto.onerror = () => {
      els.fotoBox.classList.add('hidden');
      els.fotoEmpty.classList.remove('hidden');
    };
    els.foto.onload = () => {
      els.fotoEmpty.classList.add('hidden');
      els.fotoBox.classList.remove('hidden');
    };
    els.foto.src = src;
  }

  function render(feature) {
    const p = feature.getProperties();
    currentProps = p;

    const patrimonial = isPatrimonio(p);
    const pat = patrimonioDe(p);
    const codigo = clean(p.CODIGO) || '—';
    const destinoCod = clean(p.R1_Destino);

    const hasData = clean(p.R1_Nombre) || clean(p.R1_Direcci) || clean(p.R2_Matricu) ||
      destinoCod || (p.R1_AreaTer > 0) || (p.R1_AreaCon > 0) || (p.R1_Avaluo > 0);

    const badgeText = pat ? `Bien patrimonial · ${pat.inmueble} · ${pat.ZONA}` : '';
    [els.badgeDetail, els.badgeNodata].forEach((el) => {
      if (!el) return;
      el.textContent = badgeText;
      el.classList.toggle('hidden', !pat);
    });
    [els.btnFichaDet, els.btnFichaNodata].forEach((el) => {
      if (!el) return;
      el.classList.toggle('hidden', !(pat && pat.FICHA));
    });

    if (!hasData) {
      els.nodataCodigo.textContent = 'Código: ' + codigo;
      detailBox.classList.add('hidden');
      nodataBox.classList.remove('hidden');
      panel.removeAttribute('hidden');
      return;
    }
    nodataBox.classList.add('hidden');

    const nombre = clean(p.R1_Nombre) || ('Predio ' + p.CODIGO);
    const matricula = clean(p.R2_Matricu) || '—';
    const direccion = clean(p.R1_Direcci) || '—';
    const destino = (destinoCod && DESTINO_LABELS[destinoCod]) ? DESTINO_LABELS[destinoCod] : (destinoCod || '—');
    const areaT = (p.R1_AreaTer > 0) ? Number(p.R1_AreaTer).toLocaleString('es-CO') + ' m²' : '—';
    const areaC = (p.R1_AreaCon > 0) ? Number(p.R1_AreaCon).toLocaleString('es-CO') + ' m²' : '—';

    let avaluoText = '—';
    if (p.R1_Avaluo > 0) {
      avaluoText = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p.R1_Avaluo);
    }

    els.nombre.textContent = nombre;
    els.codigo.textContent = 'Código: ' + codigo;
    els.matricula.textContent = 'Matrícula: ' + matricula;
    els.direccion.textContent = direccion;
    els.areaTerreno.textContent = areaT;
    els.areaConstr.textContent = areaC;
    els.destino.textContent = destino;
    els.avaluo.textContent = avaluoText;

    cargarFoto(patrimonial ? p.FOTO : 'data/fotos/' + codigo + '.jpg');

    if (patrimonial) {
      els.btnPdf.textContent = p.FICHA ? 'Ver ficha de caracterización' : 'Ficha de caracterización no disponible';
      els.btnPdf.disabled = !p.FICHA;
      els.btnFichaDet.classList.add('hidden');
    } else {
      const tieneFicha = prediosConFicha.has(codigo);
      els.btnPdf.textContent = tieneFicha ? 'Ver ficha de caracterización' : 'Ficha de caracterización no disponible';
      els.btnPdf.disabled = !tieneFicha;
    }
    els.btnPdf.classList.toggle('btn-pdf-patrimonio', patrimonial);

    detailBox.classList.remove('hidden');
    panel.removeAttribute('hidden');
  }

  function selectFeature(feature, { zoom = false } = {}) {
    resetActiveStyle();
    feature.setStyle(highlightStyleForFeature(feature));
    activeFeature = feature;
    render(feature);
    if (zoom) {
      map.getView().fit(feature.getGeometry().getExtent(), {
        duration: 400, maxZoom: 19, padding: [60, 60, 60, 60],
      });
    }
  }

  map.on('singleclick', (evt) => {
    const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f, { layerFilter, hitTolerance: 2 });
    if (!feature) return;
    selectFeature(feature);
  });

  // Permite que otros módulos (p.ej. layerQuery.js) abran el panel de un predio
  // encontrado por búsqueda, sin duplicar la lógica de resaltado/render.
  ctx.selectPredioFeature = selectFeature;

  els.btnPdf?.addEventListener('click', () => {
    if (!currentProps) return;
    if (isPatrimonio(currentProps)) {
      const pat = patrimonioDe(currentProps);
      if (pat?.FICHA) window.open(encodeURI(pat.FICHA), '_blank');
      return;
    }
    window.open('data/pdfs/' + currentProps.CODIGO + '.pdf', '_blank');
  });

  [els.btnFichaDet, els.btnFichaNodata].forEach((btn) => {
    btn?.addEventListener('click', () => {
      const pat = patrimonioDe(currentProps);
      if (pat?.FICHA) window.open(encodeURI(pat.FICHA), '_blank');
    });
  });

  els.close?.addEventListener('click', closePanel);

  console.log('[predioPanel] activo.');
}
