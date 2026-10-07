// backend/src/routes/docs.js
// Gestión documental con carga automática a carpetas (Normativa, Diagnosticos, Cartografia)
// POST /api/docs/upload   — subir uno o varios archivos
// GET  /api/docs/manifest — devuelve el catálogo completo para docRepo.js
// GET  /api/docs/file/:categoria/:nombre — sirve el archivo (con auth)
// DELETE /api/docs/file/:categoria/:nombre — eliminar archivo (solo EDITOR)

const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const auth    = require('../middleware/auth');

// ── Carpetas permitidas ───────────────────────────────────────
const CATEGORIAS = {
  normativa:     { nombre: 'Normativa',     capas: ['division_municipal', 'division_veredal'] },
  diagnosticos:  { nombre: 'Diagnósticos',  capas: ['clasificaciondelsuelo', 'eventohistoricoderiesgo'] },
  cartografia:   { nombre: 'Cartografía',   capas: ['curvas_nivel', 'division_municipal', 'division_veredal'] },
};

const DOCS_BASE = path.join(__dirname, '../../public/docs');

// Crear carpetas si no existen
Object.keys(CATEGORIAS).forEach(cat => {
  const dir = path.join(DOCS_BASE, cat);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Tipos de archivo permitidos ───────────────────────────────
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.xlsx', '.docx'];
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function guessType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
  if (['.xlsx', '.docx'].includes(ext)) return 'office';
  return 'file';
}

// ── Multer: almacenamiento dinámico según categoría ───────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const cat = (req.body.categoria || req.query.categoria || 'normativa').toLowerCase();
    const dir = path.join(DOCS_BASE, CATEGORIAS[cat] ? cat : 'normativa');
    cb(null, dir);
  },
  filename(req, file, cb) {
    // Mantener nombre original decodificado (sin path traversal)
    const safe = path.basename(
      Buffer.from(file.originalname, 'latin1').toString('utf8')
    ).replace(/[<>:"/\\|?*]/g, '_');
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB por archivo
  fileFilter(req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    if (ALLOWED_EXT.includes(ext) || ALLOWED_MIME.includes(mime)) return cb(null, true);
    cb(new Error(`Tipo de archivo no permitido: ${ext}`));
  },
});

// ── GET /api/docs/manifest ────────────────────────────────────
// Construye el catálogo dinámicamente desde el sistema de archivos
router.get('/manifest', auth, (req, res) => {
  try {
    const manifest = Object.entries(CATEGORIAS).map(([key, meta]) => {
      const dir = path.join(DOCS_BASE, key);
      let files = [];

      if (fs.existsSync(dir)) {
        files = fs.readdirSync(dir)
          .filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ALLOWED_EXT.includes(ext) && !f.startsWith('.');
          })
          .map(f => ({
            id:    `${key}_${f.replace(/\W/g, '_')}`,
            title: path.basename(f, path.extname(f)),
            file:  `docs/${key}/${f}`,
            type:  guessType(f),
          }));
      }

      return {
        key,
        name:   meta.nombre,
        layers: meta.capas,
        files,
      };
    });

    res.json(manifest);
  } catch (e) {
    res.status(500).json({ error: 'Error generando catálogo', detail: e.message });
  }
});

// ── POST /api/docs/upload ─────────────────────────────────────
// Body (form-data): categoria + uno o más archivos en campo "files"
router.post('/upload', auth, upload.array('files', 20), (req, res) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ error: 'No se recibieron archivos' });
    }

    const cat = (req.body.categoria || 'normativa').toLowerCase();
    const catInfo = CATEGORIAS[cat] || CATEGORIAS.normativa;

    const subidos = req.files.map(f => ({
      nombre:    f.filename,
      categoria: cat,
      nombre_categoria: catInfo.nombre,
      tipo:      guessType(f.filename),
      tamaño_kb: Math.round(f.size / 1024),
      ruta:      `docs/${cat}/${f.filename}`,
    }));

    res.json({
      success: true,
      mensaje: `${subidos.length} archivo(s) subido(s) a "${catInfo.nombre}"`,
      archivos: subidos,
    });
  } catch (e) {
    res.status(500).json({ error: 'Error al subir archivos', detail: e.message });
  }
});

// ── GET /api/docs/file/:categoria/:nombre ─────────────────────
// Sirve el archivo con auth (el usuario debe tener token válido)
router.get('/file/:categoria/:nombre', auth, (req, res) => {
  const { categoria, nombre } = req.params;

  // Validar que la categoría existe y que el nombre no es path traversal
  if (!CATEGORIAS[categoria]) return res.status(400).json({ error: 'Categoría inválida' });
  const safeName = path.basename(nombre);
  const filePath = path.join(DOCS_BASE, categoria, safeName);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  res.sendFile(filePath);
});

// ── DELETE /api/docs/file/:categoria/:nombre ──────────────────
router.delete('/file/:categoria/:nombre', auth, (req, res) => {
  // Solo EDITOR puede eliminar
  if (req.user.rol !== 'EDITOR') {
    return res.status(403).json({ error: 'Solo EDITOR puede eliminar archivos' });
  }

  const { categoria, nombre } = req.params;
  if (!CATEGORIAS[categoria]) return res.status(400).json({ error: 'Categoría inválida' });

  const safeName = path.basename(nombre);
  const filePath = path.join(DOCS_BASE, categoria, safeName);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  fs.unlinkSync(filePath);
  res.json({ success: true, mensaje: `"${safeName}" eliminado de ${categoria}` });
});

// ── GET /api/docs/categorias ──────────────────────────────────
// Lista las categorías disponibles con sus capas vinculadas
router.get('/categorias', auth, (req, res) => {
  res.json(
    Object.entries(CATEGORIAS).map(([key, v]) => ({ key, nombre: v.nombre, capas: v.capas }))
  );
});

module.exports = router;
