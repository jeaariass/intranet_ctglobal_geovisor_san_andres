// backend/src/middleware/auth.js
// Verifica el JWT emitido por la intranet CTGlobal.
// El JWT_SECRET debe ser IDÉNTICO al de la intranet.

const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    // Verificar con el mismo secret que la intranet
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.log('[auth] Error verificando token:', err.name, '| Secret usado:', process.env.JWT_SECRET?.substring(0,8) + '...');
    const msg = err.name === 'TokenExpiredError'
      ? 'Token expirado'
      : 'Token inválido';
    
    return res.status(401).json({ error: msg, expired: err.name === 'TokenExpiredError' });
  }
};
