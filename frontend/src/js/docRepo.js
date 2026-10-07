// /js/docRepo.js
// Repositorio documental fullscreen vinculado a capas.
// Renderiza su propio HTML + CSS (no requiere pegar overlay en index.html).
// Carga manifiesto desde /public/doc-repo.json

export function initDocRepo(ctx) {
  const root = ctx?.root || document;

  const btnOpen = root.querySelector('#btnDocRepoOpen');
  if (!btnOpen) {
    console.warn('[docRepo] No existe #btnDocRepoOpen en el DOM.');
    return false;
  }

  injectDocRepoStylesOnce(root);
  ensureOverlayExists(root);

  const overlay = root.querySelector('#docRepoOverlay');
  const btnClose = overlay.querySelector('#docRepoClose');
  const folderList = overlay.querySelector('#docRepoFolders');
  const fileList = overlay.querySelector('#docRepoFiles');
  const viewer = overlay.querySelector('#docRepoViewer');
  const searchInput = overlay.querySelector('#docRepoSearch');
  const layerFilter = overlay.querySelector('#docRepoLayerFilter');
  const recentList = overlay.querySelector('#docRepoRecents');

  // Manifiesto estático (generado de predios_data.js / patrimonio_data.js) — sin backend, sin token.
  const MANIFEST_URL = 'data/doc-manifest.json';
  const LS_RECENTS_KEY = 'docRepo_recents_v1';
  const MAX_RECENTS = 15;

  let manifest = [];
  let currentFolderKey = null;

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  function openOverlay() { overlay.classList.add('open'); }
  function closeOverlay() { overlay.classList.remove('open'); }

  function getRecents() {
    try {
      const raw = localStorage.getItem(LS_RECENTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  function pushRecent(item) {
    const recents = getRecents();
    const now = new Date().toISOString();
    const next = [
      { ...item, viewedAt: now },
      ...recents.filter(r => r?.id !== item?.id)
    ].slice(0, MAX_RECENTS);
    localStorage.setItem(LS_RECENTS_KEY, JSON.stringify(next));
    renderRecents();
  }

  function renderRecents() {
    const recents = getRecents();
    if (!recentList) return;

    if (!recents.length) {
      recentList.innerHTML = `<div class="docrepo-empty">Sin documentos recientes.</div>`;
      return;
    }

    recentList.innerHTML = recents.map(r => `
      <button class="docrepo-recent" type="button" data-id="${esc(r.id)}">
        <div class="docrepo-recent-title">${esc(r.title || 'Documento')}</div>
        <div class="docrepo-recent-meta">${esc((r.type || '').toUpperCase())} · ${esc(r.viewedAt || '')}</div>
      </button>
    `).join('');

    recentList.querySelectorAll('button[data-id]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const hit = findFileById(id);
        if (hit) {
          currentFolderKey = hit.folder.key;
          renderFolders();
          renderFiles();
          openFile(hit.file, hit.folder);
        }
      });
    });
  }

  function findFileById(id) {
    for (const folder of manifest) {
      for (const f of (folder.files || [])) {
        if (f?.id === id) return { folder, file: f };
      }
    }
    return null;
  }

  function getAllLayerIdsFromManifest() {
    const s = new Set();
    manifest.forEach(folder => (folder.layers || []).forEach(lid => s.add(lid)));
    return Array.from(s).sort();
  }

  function renderLayerFilter() {
    if (!layerFilter) return;
    const layerIds = getAllLayerIdsFromManifest();
    layerFilter.innerHTML = `
      <option value="">Todas las capas</option>
      ${layerIds.map(id => `<option value="${esc(id)}">${esc(id)}</option>`).join('')}
    `;
  }

  function renderFolders() {
    if (!folderList) return;
    if (!currentFolderKey && manifest.length) currentFolderKey = manifest[0].key;

    folderList.innerHTML = manifest.map(folder => {
      const active = folder.key === currentFolderKey ? 'active' : '';
      const layers = (folder.layers || []).length ? `${folder.layers.length} capa(s)` : 'Sin capa';
      const count = (folder.files || []).length;
      return `
        <button class="docrepo-folder ${active}" type="button" data-key="${esc(folder.key)}">
          <div class="docrepo-folder-name">${esc(folder.name || folder.key)}</div>
          <div class="docrepo-folder-meta">${esc(layers)} · ${esc(count)} archivo(s)</div>
        </button>
      `;
    }).join('');

    folderList.querySelectorAll('button[data-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFolderKey = btn.getAttribute('data-key');
        renderFolders();
        renderFiles();
      });
    });
  }

  function getFilteredFiles() {
    const folder = manifest.find(f => f.key === currentFolderKey);
    if (!folder) return [];

    const q = (searchInput?.value || '').trim().toLowerCase();
    const layer = (layerFilter?.value || '').trim();

    // si se filtra por capa y esta carpeta no la contiene, no muestra nada
    if (layer && !(folder.layers || []).includes(layer)) return [];

    let files = (folder.files || []).map(f => ({ folder, file: f }));

    if (q) {
      files = files.filter(x => {
        const t = (x.file?.title || '').toLowerCase();
        const id = (x.file?.id || '').toLowerCase();
        const name = (x.file?.file || '').toLowerCase();
        return t.includes(q) || id.includes(q) || name.includes(q);
      });
    }

    return files;
  }

  function renderFiles() {
    if (!fileList) return;

    const items = getFilteredFiles();
    if (!items.length) {
      fileList.innerHTML = `<div class="docrepo-empty">No hay documentos para los filtros actuales.</div>`;
      return;
    }

    fileList.innerHTML = items.map(({ folder, file }) => {
      const type = (file.type || guessType(file.file)).toUpperCase();
      const chips = (folder.layers || []).slice(0, 3).map(l => `<span class="docrepo-chip">${esc(l)}</span>`).join('');
      const more = (folder.layers || []).length > 3 ? `<span class="docrepo-chip">+${(folder.layers || []).length - 3}</span>` : '';

      return `
        <button class="docrepo-file" type="button" data-id="${esc(file.id)}">
          <div class="docrepo-file-title">${esc(file.title || 'Documento')}</div>
          <div class="docrepo-file-meta">
            <span class="docrepo-badge">${esc(type)}</span>
            <span class="docrepo-path">${esc(file.file || '')}</span>
          </div>
          <div class="docrepo-chips">${chips}${more}</div>
        </button>
      `;
    }).join('');

    fileList.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const hit = findFileById(id);
        if (hit) openFile(hit.file, hit.folder);
      });
    });
  }

  function guessType(path) {
    const p = String(path || '').toLowerCase();
    if (p.endsWith('.pdf')) return 'pdf';
    if (p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.webp')) return 'image';
    return 'file';
  }

  function openFile(file, folder) {
    if (!viewer) return;

    const type = file.type || guessType(file.file);
    const url = String(file.file || '').replace(/^\/+/, ''); // ruta pública relativa (public/data/…)

    const header = `
      <div class="docrepo-viewer-head">
        <div>
          <div class="docrepo-viewer-title">${esc(file.title || 'Documento')}</div>
          <div class="docrepo-viewer-sub">
            <span class="docrepo-badge">${esc(String(type).toUpperCase())}</span>
            <span class="docrepo-viewer-path">${esc(file.file || '')}</span>
          </div>
          <div class="docrepo-viewer-layers">
            ${(folder.layers || []).map(l => `<span class="docrepo-chip">${esc(l)}</span>`).join('')}
          </div>
        </div>
        <div class="docrepo-viewer-actions">
          <a class="docrepo-link" href="${url}" target="_blank" rel="noreferrer">Abrir en pestaña</a>
        </div>
      </div>
    `;

    let body = '';
    if (type === 'pdf') {
      body = `<iframe class="docrepo-iframe" src="${url}"></iframe>`;
    } else if (type === 'image') {
      body = `<div class="docrepo-image-wrap"><img class="docrepo-image" src="${url}" alt="${esc(file.title)}"></div>`;
    } else {
      body = `
        <div class="docrepo-generic">
          <p>No hay previsualización para este tipo.</p>
          <a class="docrepo-link" href="${url}" target="_blank" rel="noreferrer">Descargar / abrir</a>
        </div>
      `;
    }

    viewer.innerHTML = header + `<div class="docrepo-viewer-body">${body}</div>`;

    console.log('[docRepo] open', {
      id: file.id, title: file.title, type, file: file.file,
      folder: folder?.key, layers: folder?.layers || []
    });

    pushRecent({ id: file.id, title: file.title, type, file: file.file, folderKey: folder?.key || '' });
  }

  async function loadManifest() {
    try {
      const resp = await fetch(MANIFEST_URL, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const json = await resp.json();
      if (!Array.isArray(json)) throw new Error('Respuesta no es un array');
      manifest = json;
    } catch (e) {
      console.error('[docRepo] Error cargando manifiesto:', e);
      manifest = [];
    }
  }

  async function refreshUI() {
    await loadManifest();
    renderLayerFilter();
    renderFolders();
    renderFiles();
    renderRecents();
  }

  // ---------- eventos ----------
  btnOpen.addEventListener('click', async () => {
    openOverlay();
    await refreshUI();
  });

  btnClose?.addEventListener('click', () => closeOverlay());

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) closeOverlay();
  });

  searchInput?.addEventListener('input', () => renderFiles());
  layerFilter?.addEventListener('change', () => renderFiles());

  // Inicializar recientes sin abrir
  renderRecents();

  console.log('[docRepo] listo.');
  return true;
}

// ---------- overlay + css (inyectados) ----------

function ensureOverlayExists(root) {
  if (root.getElementById('docRepoOverlay')) return;

  const div = root.createElement('div');
  div.id = 'docRepoOverlay';
  div.className = 'docrepo-overlay';
  div.setAttribute('aria-hidden', 'true');

  div.innerHTML = `
    <div class="docrepo-window" role="dialog" aria-modal="true">
      <div class="docrepo-topbar">
        <div class="docrepo-title">Repositorio documental vinculado a capas</div>

        <div class="docrepo-controls">
          <select id="docRepoLayerFilter" class="docrepo-select" title="Filtrar por capa">
            <option value="">Todas las capas</option>
          </select>

          <input id="docRepoSearch" class="docrepo-search" type="search"
                 placeholder="Buscar por título, id o ruta...">

          <button id="docRepoClose" class="docrepo-close" type="button" title="Cerrar">Cerrar</button>
        </div>
      </div>

      <div class="docrepo-body">
        <aside class="docrepo-left">
          <div class="docrepo-section-title">Carpetas</div>
          <div id="docRepoFolders" class="docrepo-folders"></div>

          <div class="docrepo-section-title" style="margin-top:16px;">Recientes (local)</div>
          <div id="docRepoRecents" class="docrepo-recents"></div>
        </aside>

        <main class="docrepo-center">
          <div class="docrepo-section-title">Documentos</div>
          <div id="docRepoFiles" class="docrepo-files"></div>
        </main>

        <section class="docrepo-right">
          <div class="docrepo-section-title">Visor</div>
          <div id="docRepoViewer" class="docrepo-viewer">
            <div class="docrepo-empty">Seleccione un documento para previsualizar.</div>
          </div>
        </section>
      </div>
    </div>
  `;

  root.body.appendChild(div);
}

function injectDocRepoStylesOnce(root) {
  if (root.getElementById('docRepoStylesV1')) return;

  const st = root.createElement('style');
  st.id = 'docRepoStylesV1';
  st.textContent = `
    .docrepo-overlay{
      position: fixed; inset: 0;
      background: rgba(0,0,0,.45);
      display: none;
      z-index: 9999;
    }
    .docrepo-overlay.open{ display:block; }

    .docrepo-window{
      position: absolute;
      inset: 18px;
      background: #fff;
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,.25);
      border: 1px solid #e5e7eb;
    }

    .docrepo-topbar{
      padding: 12px 14px;
      border-bottom: 1px solid #e9e9e9;
      display:flex;
      gap: 12px;
      align-items:center;
      justify-content: space-between;
    }
    .docrepo-title{ font-weight: 800; color:#111827; }
    .docrepo-controls{ display:flex; gap: 10px; align-items:center; }

    .docrepo-select, .docrepo-search{
      height: 34px;
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 0 10px;
      outline: none;
    }
    .docrepo-search{ width: 340px; }

    .docrepo-close{
      height: 34px;
      border: 1px solid #ddd;
      border-radius: 10px;
      background: #f7f7f7;
      padding: 0 12px;
      cursor: pointer;
    }

    .docrepo-body{
      flex: 1;
      display: grid;
      grid-template-columns: 320px 380px 1fr;
      min-height: 0;
    }

    .docrepo-left, .docrepo-center, .docrepo-right{
      min-height: 0;
      padding: 12px;
    }
    .docrepo-left{ border-right: 1px solid #eee; }
    .docrepo-center{ border-right: 1px solid #eee; }

    /* ===== FIX SCROLL REAL EN "DOCUMENTOS" ===== */
    .docrepo-center{
      display: flex;
      flex-direction: column;
      min-height: 0;  /* clave para que el hijo pueda scrollear dentro */
    }

    .docrepo-center .docrepo-files{
      flex: 1;
      min-height: 0;  /* clave */
      overflow: auto; /* scroll real */
    }

    /* (Opcional) si también quiere que "Carpetas" y "Recientes" sean scrollables dentro del alto */
    .docrepo-left{
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .docrepo-left .docrepo-folders{
      flex: 1;
      min-height: 0;
      overflow: auto;
    }

    .docrepo-left .docrepo-recents{
      flex: 1;
      min-height: 0;
      overflow: auto;
    }


    .docrepo-section-title{
      font-size: 12px;
      font-weight: 800;
      color: #444;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: .4px;
    }

    .docrepo-folders, .docrepo-files, .docrepo-recents{
      display:flex;
      flex-direction: column;
      gap: 8px;
      overflow: auto;
      padding-right: 6px;
    }

    .docrepo-folder, .docrepo-file, .docrepo-recent{
      text-align: left;
      border: 1px solid #eee;
      border-radius: 12px;
      background: #fff;
      padding: 10px 10px;
      cursor: pointer;
    }
    .docrepo-folder.active{
      border-color: #cfd8ff;
      background: #f6f7ff;
    }
    .docrepo-folder-name{ font-weight: 800; }
    .docrepo-folder-meta, .docrepo-file-meta, .docrepo-recent-meta{
      font-size: 12px;
      color: #666;
      margin-top: 3px;
    }
    .docrepo-file-title, .docrepo-recent-title{ font-weight: 800; }

    .docrepo-badge{
      display:inline-block;
      font-size: 11px;
      border: 1px solid #ddd;
      border-radius: 999px;
      padding: 1px 8px;
      margin-right: 6px;
      background:#fafafa;
    }
    .docrepo-path{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

    .docrepo-chips{ margin-top: 8px; display:flex; gap: 6px; flex-wrap: wrap; }
    .docrepo-chip{
      font-size: 11px;
      border: 1px solid #e6e6e6;
      border-radius: 999px;
      padding: 2px 8px;
      background:#f8f8f8;
      color:#333;
    }

    .docrepo-viewer{
      height: 100%;
      border: 1px solid #eee;
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      display:flex;
      flex-direction: column;
    }
    .docrepo-viewer-head{
      padding: 10px 12px;
      border-bottom: 1px solid #eee;
      display:flex;
      justify-content: space-between;
      gap: 10px;
    }
    .docrepo-viewer-title{ font-weight: 900; }
    .docrepo-viewer-sub{ font-size: 12px; color:#666; margin-top: 3px; }
    .docrepo-viewer-layers{ margin-top: 8px; display:flex; gap: 6px; flex-wrap: wrap; }

    .docrepo-viewer-body{ flex:1; min-height: 0; padding: 0; }
    .docrepo-iframe{ width: 100%; height: 100%; border: 0; }
    .docrepo-image-wrap{ height:100%; overflow:auto; padding: 10px; }
    .docrepo-image{
      max-width:100%;
      height:auto;
      display:block;
      border-radius: 10px;
      border: 1px solid #eee;
    }

    .docrepo-link{
      display:inline-block;
      text-decoration: none;
      border: 1px solid #ddd;
      background: #f7f7f7;
      border-radius: 10px;
      padding: 6px 10px;
      color:#111;
      white-space: nowrap;
    }

    .docrepo-empty{
      padding: 14px;
      color: #666;
      font-size: 13px;
    }
    
    /* Forzar barras de scroll visibles en paneles */
    .docrepo-folders, .docrepo-files, .docrepo-recents, .docrepo-image-wrap{
      overflow-y: scroll;           /* fuerza barra aunque no se vea por defecto */
      scrollbar-gutter: stable;     /* reserva espacio para que no “salte” el layout */
    }

    /* Scrollbar visible (Chrome/Edge/Safari) */
    .docrepo-folders::-webkit-scrollbar,
    .docrepo-files::-webkit-scrollbar,
    .docrepo-recents::-webkit-scrollbar,
    .docrepo-image-wrap::-webkit-scrollbar{
      width: 10px;
    }

    .docrepo-folders::-webkit-scrollbar-track,
    .docrepo-files::-webkit-scrollbar-track,
    .docrepo-recents::-webkit-scrollbar-track,
    .docrepo-image-wrap::-webkit-scrollbar-track{
      background: #f3f4f6;
      border-radius: 999px;
    }

    .docrepo-folders::-webkit-scrollbar-thumb,
    .docrepo-files::-webkit-scrollbar-thumb,
    .docrepo-recents::-webkit-scrollbar-thumb,
    .docrepo-image-wrap::-webkit-scrollbar-thumb{
      background: #cbd5e1;
      border-radius: 999px;
      border: 2px solid #f3f4f6;
    }

    /* Firefox */
    .docrepo-folders, .docrepo-files, .docrepo-recents, .docrepo-image-wrap{
      scrollbar-width: thin;
      scrollbar-color: #cbd5e1 #f3f4f6;
    }


    @media (max-width: 1100px){
      .docrepo-body{ grid-template-columns: 280px 320px 1fr; }
      .docrepo-search{ width: 240px; }
    }
  `;
  root.head.appendChild(st);
}
