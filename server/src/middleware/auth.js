const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../db');
const { logAudit } = require('../audit');
const { jwtSecret, cookieName, sessionMs, isProd } = require('../config');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Creates the login cookie (httpOnly, so JavaScript cannot steal it) and a CSRF token.
function issueSession(res, user) {
  const csrf = crypto.randomBytes(24).toString('hex');
  const token = jwt.sign({ sub: user.id, csrf }, jwtSecret, { expiresIn: Math.floor(sessionMs / 1000) });
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: sessionMs,
    path: '/',
  });
  return csrf;
}

function clearSession(res) {
  res.clearCookie(cookieName, { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', path: '/' });
}

// Runs on every protected route. The user and role are ALWAYS re-read from the database.
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies[cookieName];
    if (!token) return res.status(401).json({ error: 'Please log in.' });
    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch (e) {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Please log in.' });

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const sent = req.get('x-csrf-token');
      if (!sent || !safeEqual(sent, payload.csrf)) {
        await logAudit({
          userId: user.id, action: 'CSRF_REJECTED', result: 'DENIED', ip: req.ip,
          metadata: { method: req.method, path: req.originalUrl.slice(0, 200) },
        });
        return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
      }
    }
    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    req.csrf = payload.csrf;
    next();
  } catch (e) {
    next(e);
  }
}

function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      if (roles.includes(req.user.role)) return next();
      await logAudit({
        userId: req.user.id, action: 'ACCESS_DENIED', result: 'DENIED', ip: req.ip,
        metadata: { reason: 'wrong role', needed: roles, path: req.originalUrl.slice(0, 200) },
      });
      return res.status(403).json({ error: 'You do not have permission to do this.' });
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { requireAuth, requireRole, issueSession, clearSession };
