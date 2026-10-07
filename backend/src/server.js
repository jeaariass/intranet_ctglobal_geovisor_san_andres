// backend/src/server.js
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3003;

const allowedOrigins = [
  process.env.PUBLIC_URL,
  'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176',
  'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5176',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null, true) : cb(new Error(`CORS bloqueado: ${origin}`)),
  credentials: true,
}));

app.use(express.json());

// Archivos estáticos: PDFs y documentos
app.use('/pdf',  express.static(path.join(__dirname, '../public/pdf')));
app.use('/docs', express.static(path.join(__dirname, '../public/docs')));

// Rutas API
app.use('/api/verify', require('./routes/verify'));
app.use('/api/layers', require('./routes/layers'));
app.use('/api/files',  require('./routes/files'));
app.use('/api/docs',   require('./routes/docs'));

app.get('/health', (_, res) => res.json({ ok: true, geovisor: 'carmen_apicala', uptime: process.uptime() }));
app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.originalUrl}` }));

app.listen(PORT, () => {
  console.log(`\n🗺  Geovisor Backend [carmen_apicala] → http://localhost:${PORT}`);
  console.log(`   Intranet URL : ${process.env.INTRANET_URL || '⚠ no definida (ver .env)'}`);
  console.log(`   GeoServer    : ${process.env.GEOSERVER_URL || '⚠ no definida'}/${process.env.GEOSERVER_WORKSPACE || ''}`);
  console.log(`   CORS origins : ${allowedOrigins.join(', ')}\n`);
});
