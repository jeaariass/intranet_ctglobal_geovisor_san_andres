// /js/upload.js
// Importador de archivos con persistencia local (localStorage).
// Soporta: GeoJSON/JSON, KML, GPX y Shapefile .zip (con shp.js).
// Se integra con tu patrón de módulos: exporta initUploadModule(ctx)

const STORAGE_KEY = 'dq_uploads_v1';

export function initUploadModule(ctx) {
  const { map, root } = ctx;
  if (!map || !root) {
    console.error('[upload] faltan ctx.map o ctx.root');
    return;
  }

  // ---- UI ----
  const input      = root.querySelector('#uploadInput');
  const resultsDiv = root.querySelector('#uploadResults');
  const clearBtn   = root.querySelector('#clearUploads');
  const uploadTrigger = root.querySelector('#uploadTrigger'); // nuevo botón personalizado

  if (!input || !resultsDiv) {
    console.warn('[upload] Falta #uploadInput o #uploadResults en el DOM');
    return;
  }

  // Conectar botón personalizado con input oculto
  if (uploadTrigger) {
    uploadTrigger.addEventListener('click', () => {
      input.click();
    });
  }

  // ---- Estado en memoria (capas vivas en OL) ----
  // Mapa: id -> { layer, name }
  const live = new Map();

  // ---- Helpers de persistencia ----
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function saveState(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }
  function appendEntryToUI(entry) {
    // entry: { id, name, size?, createdAt? }
    const row = document.createElement('div');
    row.className = 'upload-item';
    row.dataset.uid = String(entry.id);

    // Nombre (con ellipsis por CSS y tooltip completo)
    const nameEl = document.createElement('span');
    nameEl.textContent = entry.name;   // <- era "nombreLarguisimo" en tu snippet
    nameEl.title = entry.name;         // tooltip
    row.appendChild(nameEl);

    // Botón Zoom
    const btnZoom = document.createElement('button');
    btnZoom.className = 'mbtn';
    btnZoom.dataset.action = 'zoom';
    btnZoom.textContent = 'Zoom';
    row.appendChild(btnZoom);

    // Botón Borrar
    const btnDelete = document.createElement('button');
    btnDelete.className = 'mbtn';
    btnDelete.dataset.action = 'del';
    btnDelete.textContent = '🗑';
    row.appendChild(btnDelete);

    resultsDiv.appendChild(row);
  }

  // ---- Escritura/lectura de features (GeoJSON 4326 <-> proyección del mapa) ----
  const gj = new ol.format.GeoJSON();

  function featuresToGeoJSON4326(features) {
    // serializa las features (que vienen en CRS del mapa) a GeoJSON EPSG:4326 para persistir compacto
    return gj.writeFeaturesObject(features, {
      dataProjection: 'EPSG:4326',
      featureProjection: map.getView().getProjection(), // desde CRS del mapa -> 4326
      decimals: 7,
    });
  }

  function geojson4326ToFeatures(geojsonObj) {
    // lee GeoJSON EPSG:4326 y lo reproyecta al CRS del mapa
    return gj.readFeatures(geojsonObj, {
      dataProjection: 'EPSG:4326',
      featureProjection: map.getView().getProjection(),
    });
  }

  // ---- Crear capa vectorial con estilo consistente ----
  function makeVectorLayer(features, title) {
    const src = new ol.source.Vector({ features });
    const styleNormal = new ol.style.Style({
      stroke: new ol.style.Stroke({ color: '#2563eb', width: 2 }),
      fill:   new ol.style.Fill({ color: 'rgba(37,99,235,0.10)' }),
      image:  new ol.style.Circle({
        radius: 5,
        fill: new ol.style.Fill({ color: '#2563eb' }),
        stroke: new ol.style.Stroke({ color: '#ffffff', width: 1 }),
      }),
    });
    const layer = new ol.layer.Vector({ source: src, style: styleNormal });
    layer.set('title', title);
    layer.setZIndex(950);
    return layer;
  }

  // ---- Restaurar desde localStorage al iniciar ----
  (function restoreAll() {
    const list = loadState(); // [{id,name,gj4326}]
    list.forEach(entry => {
      try {
        const feats = geojson4326ToFeatures(entry.gj4326);
        const layer = makeVectorLayer(feats, `Importado: ${entry.name}`);
        map.addLayer(layer);
        live.set(entry.id, { layer, name: entry.name });
        appendEntryToUI(entry);
      } catch (e) {
        console.warn('[upload] no se pudo restaurar', entry.name, e);
      }
    });
    if (list.length && featsHaveExtent()) {
      // centra en todo lo cargado
      fitAllImported();
    }
  })();

  function featsHaveExtent() {
    for (const { layer } of live.values()) {
      const ext = layer.getSource().getExtent();
      if (ext && !isNaN(ext[0])) return true;
    }
    return false;
  }

  function fitAllImported() {
    // un extent envolvente de todas las capas importadas
    let union = null;
    for (const { layer } of live.values()) {
      const ext = layer.getSource().getExtent();
      if (!ext || isNaN(ext[0])) continue;
      union = union ? ol.extent.extend(union, ext) : ol.extent.clone(ext);
    }
    if (union) map.getView().fit(union, { duration: 600, padding: [40,40,40,40] });
  }

  // ---- Detección simple de CRS de entrada para GeoJSON (por si viene en 3857) ----
  function guessGeoJSONCrs(text) {
    try {
      const obj = JSON.parse(text);
      // Si declara crs, úsalo
      if (obj.crs && obj.crs.properties && obj.crs.properties.name) {
        const name = String(obj.crs.properties.name);
        if (/3857|900913/.test(name)) return 'EPSG:3857';
        if (/4326|CRS84/.test(name))  return 'EPSG:4326';
      }
      // Heurística: mirar primer punto
      const coords = findFirstCoord(obj);
      if (coords && Math.max(Math.abs(coords[0]), Math.abs(coords[1])) > 200) {
        return 'EPSG:3857';
      }
    } catch {}
    return 'EPSG:4326';
  }
  function findFirstCoord(obj) {
    // muy simple: busca el primer array [x,y] dentro de coordinates
    if (!obj || !obj.type) return null;
    const coords = (obj.coordinates)
      || (obj.geometry && obj.geometry.coordinates)
      || (obj.features && obj.features[0] && (obj.features[0].geometry?.coordinates));
    if (!coords) return null;
    // aplanar hasta llegar a [x,y]
    let c = coords;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') return c;
    return null;
  }

  // ---- Cargar archivo(s) ----
  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // estado persistente actual
    const persisted = loadState();

    for (const file of files) {
      try {
        const lower = file.name.toLowerCase();
        let features = null;

        if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
          const text = await file.text();
          const dataCRS = guessGeoJSONCrs(text); // EPSG:4326 (default) o 3857
          features = gj.readFeatures(text, {
            dataProjection: dataCRS,
            featureProjection: map.getView().getProjection(),
          });

        } else if (lower.endsWith('.kmz')) {
        // KMZ: preferimos usar ol.format.KMZ (OL 7+). Si no existe, fallback con JSZip -> KML.
        const proj = map.getView().getProjection();

        if (ol.format && ol.format.KMZ) {
            // --- Ruta A: OpenLayers 7+ con KMZ nativo ---
            const ab = await file.arrayBuffer();
            const kmz = new ol.format.KMZ();
            features = kmz.readFeatures(ab, {
            dataProjection: 'EPSG:4326',
            featureProjection: proj,
            });
        } else {
            // --- Ruta B: Fallback con JSZip: extraer primer .kml del .kmz ---
            if (typeof JSZip === 'undefined') {
            alert('Para cargar .kmz necesitas incluir JSZip (ver instrucción en el HTML).');
            continue;
            }
            const ab = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(ab);
            // buscar doc.kml o, si no existe, el primer .kml
            let kmlFile = zip.file(/(^|\/)doc\.kml$/i)[0];
            if (!kmlFile) {
            const kmlFiles = zip.file(/\.kml$/i);
            kmlFile = kmlFiles && kmlFiles[0];
            }
            if (!kmlFile) {
            alert(`No se encontró un .kml dentro de ${file.name}`);
            continue;
            }
            const kmlText = await kmlFile.async('text');
            const kml = new ol.format.KML();
            features = kml.readFeatures(kmlText, {
            dataProjection: 'EPSG:4326',
            featureProjection: proj,
            });
        }

        } else if (lower.endsWith('.kml')) {
        const text = await file.text();
        const kml = new ol.format.KML();
        features = kml.readFeatures(text, {
        dataProjection: 'EPSG:4326',
        featureProjection: map.getView().getProjection(),
        });

        } else if (lower.endsWith('.gpx')) {
          const text = await file.text();
          const gpx = new ol.format.GPX();
          features = gpx.readFeatures(text, {
            dataProjection: 'EPSG:4326',
            featureProjection: map.getView().getProjection(),
          });

        } else if (lower.endsWith('.zip')) {
          // shapefile .zip con shp.js (debe estar cargado en index.html)
          if (typeof shp !== 'function') {
            alert('Para .zip (shapefile) necesitas incluir shp.min.js en el HTML.');
            continue;
          }
          const ab = await file.arrayBuffer();
          const geojson = await shp(ab); // FeatureCollection (4326)
          features = gj.readFeatures(geojson, {
            dataProjection: 'EPSG:4326',
            featureProjection: map.getView().getProjection(),
          });

        } else if (lower.endsWith('.shp')) {
          alert('Carga directa de .shp no soportada. Usa el .zip del shapefile o conviértelo a GeoJSON.');
          continue;

        } else {
          alert(`Formato no soportado: ${file.name}`);
          continue;
        }

        if (!features || features.length === 0) {
          alert(`No se encontraron entidades en ${file.name}`);
          continue;
        }

        // Crear capa y añadir al mapa
        const layer = makeVectorLayer(features, `Importado: ${file.name}`);
        map.addLayer(layer);

        // Generar ID estable y guardar en memoria + UI
        const id = Date.now() + Math.floor(Math.random() * 1000);
        live.set(id, { layer, name: file.name });

        appendEntryToUI({ id, name: file.name });

        // Persistir en localStorage como GeoJSON (EPSG:4326)
        const gj4326 = featuresToGeoJSON4326(features);
        persisted.push({ id, name: file.name, gj4326, createdAt: Date.now() });
        saveState(persisted);

        // Zoom al archivo recién cargado
        const ext = layer.getSource().getExtent();
        if (ext && !isNaN(ext[0])) {
          map.getView().fit(ext, { duration: 600, padding: [40,40,40,40] });
        }

      } catch (err) {
        console.error('[upload] Error al procesar', file.name, err);
        alert(`Error al cargar ${file.name}: ${err.message || err}`);
      }
    }

    input.value = ''; // reset para permitir recargar el mismo archivo
  });

  // ---- Acciones en lista (Zoom / Eliminar) ----
  resultsDiv.addEventListener('click', (e) => {
    const btn = e.target.closest('button.mbtn');
    const item = e.target.closest('.upload-item');
    if (!btn || !item) return;

    const id = Number(item.dataset.uid);
    const rec = live.get(id);
    if (!rec) return;

    if (btn.dataset.action === 'zoom') {
      const ext = rec.layer.getSource().getExtent();
      if (ext && !isNaN(ext[0])) {
        map.getView().fit(ext, { duration: 500, padding: [40,40,40,40] });
      }
    }

    if (btn.dataset.action === 'del') {
      // quitar del mapa y de memoria
      map.removeLayer(rec.layer);
      live.delete(id);
      item.remove();
      // quitar de localStorage
      const list = loadState().filter(x => x.id !== id);
      saveState(list);
    }
  });

  // ---- Limpiar todo ----
  clearBtn?.addEventListener('click', () => {
    for (const { layer } of live.values()) map.removeLayer(layer);
    live.clear();
    resultsDiv.innerHTML = '';
    saveState([]);
  });

  console.log('[upload] listo con persistencia local.');
}