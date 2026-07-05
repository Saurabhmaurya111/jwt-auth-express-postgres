const { verifyAccessToken } = require('../utils/jwt.util');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Missing or malformed Authorization header' });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // { sub, email, iat, exp, iss }
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token';
    return res.status(401).json({ success: false, message });
  }
}

module.exports = { requireAuth };
