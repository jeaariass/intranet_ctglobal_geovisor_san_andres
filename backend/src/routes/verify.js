// backend/src/routes/verify.js
// Proxy seguro a la intranet para verificar token.
// El frontend NO llama directamente a la intranet — siempre pasa por aquí.

const router = require('express').Router();
const fetch  = require('node-fetch');
const auth   = require('../middleware/auth');

// GET /api/verify  — verifica que el token sigue válido
// Primero verifica localmente (rápido) y luego confirma con la intranet
router.get('/', auth, async (req, res) => {
  try {
    const response = await fetch(`${process.env.INTRANET_URL}/api/geoauth/verify`, {
      headers: { Authorization: `Bearer ${req.headers.authorization?.split(' ')[1]}` },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    // Si la intranet no responde, confiar en la verificación local
    res.json({ valid: true, user: { nombre: req.user.nombre, rol: req.user.rol } });
  }
});

module.exports = router;
