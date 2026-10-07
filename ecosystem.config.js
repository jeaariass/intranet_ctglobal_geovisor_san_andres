// ecosystem.config.js
// Agregar este bloque al ecosystem.config.js global del servidor CTGlobal

module.exports = {
  apps: [
    // ── Intranet (referencia, ya debería existir) ──────────
    {
      name: 'intranet',
      script: 'src/server.js',
      cwd: '/var/www/intranet/backend',
      env: { PORT: 3001, NODE_ENV: 'production' },
    },

    // ── GeoVisor Carmen de Apicalá ─────────────────────────
    {
      name: 'gv-carmen',
      script: 'src/server.js',
      cwd: '/var/www/geovisores/carmen/backend',
      env: { PORT: 3003, NODE_ENV: 'production' },
      watch: false,
      max_memory_restart: '200M',
    },

    // ── (Plantilla para futuros geovisores) ────────────────
    // {
    //   name: 'gv-fusagasuga',
    //   script: 'src/server.js',
    //   cwd: '/var/www/geovisores/fusagasuga/backend',
    //   env: { PORT: 3004, NODE_ENV: 'production' },
    // },
  ],
};
