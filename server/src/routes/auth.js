const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('../db');
const { logAudit } = require('../audit');
const { requireAuth, issueSession, clearSession } = require('../middleware/auth');
const { wrap } = require('../utils');
const { isTest } = require('../config');

const router = express.Router();

// Compared when the email does not exist, so response time does not reveal which emails are real.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => isTest,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !user.isActive || !ok) {
    await logAudit({ userId: user ? user.id : null, action: 'LOGIN_FAILED', result: 'DENIED', ip: req.ip, metadata: { email } });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const csrf = issueSession(res, user);
  await logAudit({ userId: user.id, action: 'LOGIN', result: 'SUCCESS', ip: req.ip });
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, csrf });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, csrf: req.csrf });
});

router.post('/logout', requireAuth, wrap(async (req, res) => {
  await logAudit({ userId: req.user.id, action: 'LOGOUT', result: 'SUCCESS', ip: req.ip });
  clearSession(res);
  res.json({ ok: true });
}));

module.exports = router;
