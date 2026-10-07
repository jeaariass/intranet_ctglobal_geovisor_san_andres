// frontend/src/js/docUpload.js
// Panel de carga de documentos al backend (Normativa, Diagnósticos, Cartografía)
// Se abre desde el mismo botón de repositorio documental (#btnDocRepoOpen)
// o desde un botón dedicado de carga.

import { getToken } from '../utils/token.js';

const GV_API = import.meta.env.VITE_API_URL || '/api/gv/san-andres';

export function initDocUpload(ctx) {
  const root = ctx?.root || document;

  // Inyectar estilos y overlay
  injectStyles(root);
  ensureUploadPanel(root);

  const btnOpen = root.getElementById('btnDocUploadOpen');
  if (!btnOpen) return;

  const overlay  = root.getElementById('docUploadOverlay');
  const btnClose = root.getElementById('docUploadClose');
  const form     = root.getElementById('docUploadForm');
  const catSel   = root.getElementById('docUploadCategoria');
  const dropzone = root.getElementById('docUploadDropzone');
  const fileInput= root.getElementById('docUploadInput');
  const fileList = root.getElementById('docUploadFileList');
  const progress = root.getElementById('docUploadProgress');
  const result   = root.getElementById('docUploadResult');

  let pendingFiles = [];

  // ── Abrir / cerrar ─────────────────────────────────────────
  btnOpen.addEventListener('click', () => {
    overlay.classList.add('open');
    loadCategorias();
  });
  btnClose.addEventListener('click', closePanel);
  overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

  function closePanel() { overlay.classList.remove('open'); resetForm(); }
  function resetForm()  { pendingFiles = []; fileInput.value = ''; renderFileList(); result.innerHTML = ''; }

  // ── Cargar categorías desde el backend ──────────────────────
  async function loadCategorias() {
    try {
      const res  = await fetch(`${GV_API}/docs/categorias`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      catSel.innerHTML = data.map(c =>
        `<option value="${c.key}">${c.nombre}</option>`
      ).join('');
    } catch (e) {
      catSel.innerHTML = `
        <option value="normativa">Normativa</option>
        <option value="diagnosticos">Diagnósticos</option>
        <option value="cartografia">Cartografía</option>`;
    }
  }

  // ── Drag & Drop ─────────────────────────────────────────────
  dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault(); dropzone.classList.remove('drag-over');
    addFiles(Array.from(e.dataTransfer.files));
  });
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => addFiles(Array.from(fileInput.files)));

  function addFiles(files) {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.xlsx', '.docx'];
    files.forEach(f => {
      const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
      if (!allowed.includes(ext)) {
        showResult(`❌ Tipo no permitido: ${f.name}`, 'error');
        return;
      }
      if (!pendingFiles.find(p => p.name === f.name && p.size === f.size)) {
        pendingFiles.push(f);
      }
    });
    renderFileList();
  }

  function renderFileList() {
    if (!pendingFiles.length) {
      fileList.innerHTML = '<div class="du-empty">Sin archivos seleccionados</div>';
      return;
    }
    fileList.innerHTML = pendingFiles.map((f, i) => `
      <div class="du-file-row">
        <span class="du-file-icon">${fileIcon(f.name)}</span>
        <span class="du-file-name">${esc(f.name)}</span>
        <span class="du-file-size">${fmtSize(f.size)}</span>
        <button class="du-remove" data-idx="${i}" title="Quitar">✕</button>
      </div>`).join('');

    fileList.querySelectorAll('.du-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingFiles.splice(Number(btn.dataset.idx), 1);
        renderFileList();
      });
    });
  }

  // ── Subir ───────────────────────────────────────────────────
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!pendingFiles.length) return showResult('Selecciona al menos un archivo.', 'error');

    const cat      = catSel.value;
    const formData = new FormData();
    formData.append('categoria', cat);
    pendingFiles.forEach(f => formData.append('files', f));

    progress.style.display = 'block';
    progress.querySelector('.du-bar-fill').style.width = '0%';

    try {
      // fetch con XMLHttpRequest para barra de progreso real
      const pct = await uploadWithProgress(formData, pv => {
        progress.querySelector('.du-bar-fill').style.width = pv + '%';
        progress.querySelector('.du-bar-label').textContent = pv + '%';
      });

      showResult(
        `✅ ${pendingFiles.length} archivo(s) subido(s) correctamente a <strong>${catSel.options[catSel.selectedIndex].text}</strong>.<br>
         Ya están disponibles en el Repositorio documental.`,
        'success'
      );
      resetForm();
    } catch (err) {
      showResult(`❌ Error: ${err.message}`, 'error');
    } finally {
      setTimeout(() => { progress.style.display = 'none'; }, 1200);
    }
  });

  function uploadWithProgress(formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${GV_API}/docs/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);

      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve(JSON.parse(xhr.responseText));
        } else {
          const err = JSON.parse(xhr.responseText || '{}');
          reject(new Error(err.error || `HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Error de red'));
      xhr.send(formData);
    });
  }

  function showResult(html, type) {
    result.innerHTML = `<div class="du-result du-result--${type}">${html}</div>`;
  }

  console.log('[docUpload] listo.');
}

// ── Helpers ────────────────────────────────────────────────────
function fileIcon(name) {
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
  if (ext === '.pdf')  return '📄';
  if (['.jpg','.jpeg','.png','.webp'].includes(ext)) return '🖼️';
  if (['.xlsx','.docx'].includes(ext)) return '📊';
  return '📎';
}
function fmtSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Overlay HTML ────────────────────────────────────────────────
function ensureUploadPanel(root) {
  if (root.getElementById('docUploadOverlay')) return;
  const div = root.createElement('div');
  div.id = 'docUploadOverlay';
  div.className = 'du-overlay';
  div.innerHTML = `
    <div class="du-window">
      <div class="du-header">
        <div class="du-header-title">
          <i class="fas fa-cloud-upload-alt"></i>
          Cargar documentos al repositorio
        </div>
        <button id="docUploadClose" class="du-close" title="Cerrar">✕</button>
      </div>

      <div class="du-body">
        <form id="docUploadForm">

          <!-- Selección de categoría -->
          <div class="du-section">
            <label class="du-label">
              <i class="fas fa-folder"></i> Categoría destino
            </label>
            <select id="docUploadCategoria" class="du-select">
              <option value="normativa">Normativa</option>
              <option value="diagnosticos">Diagnósticos</option>
              <option value="cartografia">Cartografía</option>
            </select>
            <p class="du-hint">
              El archivo quedará disponible automáticamente en el Repositorio documental bajo esta carpeta.
            </p>
          </div>

          <!-- Dropzone -->
          <div class="du-section">
            <label class="du-label">
              <i class="fas fa-file-upload"></i> Archivos
            </label>
            <div id="docUploadDropzone" class="du-dropzone">
              <i class="fas fa-cloud-upload-alt du-drop-icon"></i>
              <p class="du-drop-text">Arrastra archivos aquí o haz clic para seleccionar</p>
              <p class="du-drop-hint">PDF, JPG, PNG, WEBP, XLSX, DOCX · Máx. 50 MB por archivo</p>
              <input id="docUploadInput" type="file" multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx" hidden />
            </div>
          </div>

          <!-- Lista de archivos pendientes -->
          <div class="du-section">
            <div id="docUploadFileList" class="du-file-list">
              <div class="du-empty">Sin archivos seleccionados</div>
            </div>
          </div>

          <!-- Barra de progreso -->
          <div id="docUploadProgress" class="du-progress" style="display:none">
            <div class="du-bar">
              <div class="du-bar-fill"></div>
            </div>
            <span class="du-bar-label">0%</span>
          </div>

          <!-- Resultado -->
          <div id="docUploadResult"></div>

          <!-- Botones -->
          <div class="du-actions">
            <button type="button" id="docUploadClose2" class="du-btn du-btn-ghost">Cancelar</button>
            <button type="submit" class="du-btn du-btn-primary">
              <i class="fas fa-cloud-upload-alt"></i> Subir archivos
            </button>
          </div>
        </form>
      </div>
    </div>`;

  root.body.appendChild(div);
  // Botón cancelar extra
  root.getElementById('docUploadClose2')?.addEventListener('click', () => {
    root.getElementById('docUploadOverlay')?.classList.remove('open');
  });
}

// ── Estilos ─────────────────────────────────────────────────────
function injectStyles(root) {
  if (root.getElementById('docUploadStyles')) return;
  const st = root.createElement('style');
  st.id = 'docUploadStyles';
  st.textContent = `
    .du-overlay{
      position:fixed;inset:0;background:rgba(0,0,0,.48);
      z-index:10000;display:none;align-items:center;justify-content:center;padding:1rem;
    }
    .du-overlay.open{display:flex;}
    .du-window{
      background:#fff;border-radius:14px;
      width:min(640px,100%);max-height:90vh;overflow:auto;
      box-shadow:0 24px 64px rgba(0,0,0,.28);
      display:flex;flex-direction:column;
    }
    .du-header{
      display:flex;justify-content:space-between;align-items:center;
      padding:1rem 1.25rem;border-bottom:1px solid #e5e7eb;flex-shrink:0;
      background:#f9fafb;border-radius:14px 14px 0 0;
    }
    .du-header-title{font-weight:800;font-size:.95rem;color:#111827;display:flex;align-items:center;gap:.5rem;}
    .du-header-title i{color:#2563eb;}
    .du-close{background:none;border:none;font-size:1.1rem;cursor:pointer;color:#6b7280;padding:.2rem .4rem;border-radius:6px;}
    .du-close:hover{background:#f3f4f6;color:#111827;}
    .du-body{padding:1.25rem;overflow:auto;}
    .du-section{margin-bottom:1.1rem;}
    .du-label{display:flex;align-items:center;gap:.4rem;font-size:.83rem;font-weight:700;color:#374151;margin-bottom:.4rem;}
    .du-label i{color:#2563eb;}
    .du-select{
      width:100%;padding:.48rem .7rem;border:1.5px solid #d1d5db;
      border-radius:8px;font-size:.85rem;color:#111827;background:#fff;
      outline:none;transition:border-color .2s;
    }
    .du-select:focus{border-color:#2563eb;}
    .du-hint{font-size:.77rem;color:#6b7280;margin-top:.3rem;line-height:1.4;}
    .du-dropzone{
      border:2px dashed #d1d5db;border-radius:10px;
      padding:1.75rem 1rem;text-align:center;cursor:pointer;
      transition:border-color .2s,background .2s;
      background:#fafafa;
    }
    .du-dropzone:hover,.du-dropzone.drag-over{border-color:#2563eb;background:#eff6ff;}
    .du-drop-icon{font-size:2rem;color:#9ca3af;margin-bottom:.5rem;display:block;}
    .du-dropzone:hover .du-drop-icon,.du-dropzone.drag-over .du-drop-icon{color:#2563eb;}
    .du-drop-text{font-size:.88rem;font-weight:600;color:#374151;margin-bottom:.25rem;}
    .du-drop-hint{font-size:.76rem;color:#9ca3af;}
    .du-file-list{display:flex;flex-direction:column;gap:.35rem;max-height:180px;overflow:auto;}
    .du-empty{color:#9ca3af;font-size:.82rem;padding:.4rem 0;}
    .du-file-row{
      display:grid;grid-template-columns:auto 1fr auto auto;
      align-items:center;gap:.5rem;
      padding:.4rem .55rem;border:1px solid #e5e7eb;border-radius:7px;background:#fff;font-size:.82rem;
    }
    .du-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#111827;}
    .du-file-size{color:#6b7280;white-space:nowrap;font-size:.76rem;}
    .du-remove{background:none;border:none;cursor:pointer;color:#9ca3af;font-size:.85rem;padding:.1rem .3rem;border-radius:4px;}
    .du-remove:hover{color:#dc2626;background:#fee2e2;}
    .du-progress{display:flex;align-items:center;gap:.75rem;margin:.75rem 0;}
    .du-bar{flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;}
    .du-bar-fill{height:100%;background:#2563eb;border-radius:4px;transition:width .3s ease;width:0%;}
    .du-bar-label{font-size:.78rem;font-weight:700;color:#2563eb;min-width:32px;text-align:right;}
    .du-result{padding:.6rem .85rem;border-radius:8px;font-size:.84rem;line-height:1.5;margin:.5rem 0;}
    .du-result--success{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;}
    .du-result--error  {background:#fef2f2;border:1px solid #fca5a5;color:#b91c1c;}
    .du-actions{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem;padding-top:.9rem;border-top:1px solid #e5e7eb;}
    .du-btn{
      display:inline-flex;align-items:center;gap:.35rem;
      padding:.45rem .95rem;border-radius:8px;border:none;
      font-size:.85rem;font-weight:700;cursor:pointer;transition:all .15s;
    }
    .du-btn-primary{background:#2563eb;color:#fff;}
    .du-btn-primary:hover{background:#1d4ed8;}
    .du-btn-ghost{background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;}
    .du-btn-ghost:hover{background:#e5e7eb;}
  `;
  root.head.appendChild(st);
}
