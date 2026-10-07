// backend/src/routes/layers.js
// Devuelve la configuración de capas de ESTE geovisor.
// Al centralizar aquí, el frontend no tiene capas hardcodeadas.
// Requiere token válido (auth middleware).

const router = require('express').Router();
const auth   = require('../middleware/auth');

// GET /api/layers
// Retorna las capas WMS disponibles para el mapa
router.get('/', auth, (req, res) => {
  const GS_URL = process.env.GEOSERVER_URL;
  const WS     = process.env.GEOSERVER_WORKSPACE;

  res.json({
    geoserverUrl:      GS_URL,
    geoserverWorkspace: WS,
    center: {
      lon: -74.71861111,   // Carmen de Apicalá
      lat:   4.14777780,
      zoom: 15,
    },
    layers: [
      {
        id:       'division_municipal',
        nombre:   'División Municipal',
        layer:    `${WS}:division_municipal`,
        tipo:     'WMS',
        visible:  true,
        opacidad: 1,
        grupo:    'Límites',
      },
      {
        id:       'division_veredal',
        nombre:   'División Veredal',
        layer:    `${WS}:division_veredal`,
        tipo:     'WMS',
        visible:  false,
        opacidad: 1,
        grupo:    'Límites',
      },
      {
        id:       'barrio',
        nombre:   'Barrios',
        layer:    `${WS}:barrio`,
        tipo:     'WMS',
        visible:  false,
        opacidad: 1,
        grupo:    'Urbano',
      },
      // Agrega más capas aquí según el proyecto
    ],
  });
});

module.exports = router;
