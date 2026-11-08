const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('../db');
const { logAudit } = require('../audit');
const { requireAuth, issueSession, clearSession } = require('../middleware/auth');
const { wrap } = require('../utils');
const { clientOrigin, isTest } = require('../config');
const { sendVerificationEmail, EmailDeliveryError } = require('../email');

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

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: 'Too many registration attempts. Please wait and try again.' },
});

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: 'Too many verification attempts. Please wait and try again.' },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

const registrationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(100),
});

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });
const tokenSchema = z.object({ token: z.string().length(64).regex(/^[a-f0-9]+$/i) });
const GENERIC_VERIFICATION_RESPONSE = {
  message: 'If this address can be registered, verification instructions will be sent to it.',
};

async function issueVerification(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  try {
    await sendVerificationEmail({ email: user.email, name: user.name, token });
  } catch (error) {
    console.error('Verification email delivery failed:', error.message);
    await logAudit({
      userId: user.id,
      action: 'EMAIL_VERIFICATION_FAILED',
      result: 'DENIED',
      metadata: { email: user.email },
    });
    throw new EmailDeliveryError();
  }

  await logAudit({
    userId: user.id,
    action: 'EMAIL_VERIFICATION_SENT',
    metadata: { email: user.email },
  });
}

router.post('/register', registrationLimiter, wrap(async (req, res) => {
  const data = registrationSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    if (!existing.emailVerified && existing.isActive) {
      try {
        await issueVerification(existing);
      } catch (error) {
        if (!(error instanceof EmailDeliveryError)) throw error;
        return res.status(503).json({ error: 'Verification email could not be sent. Please try again later.' });
      }
    }
    return res.status(202).json(GENERIC_VERIFICATION_RESPONSE);
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: data.email, name: data.name, passwordHash, role: 'OWNER' },
      });
      await logAudit({
        userId: created.id,
        action: 'USER_REGISTERED',
        ip: req.ip,
        metadata: { email: created.email, role: created.role },
      }, tx);
      return created;
    });
  } catch (error) {
    if (error.code === 'P2002') return res.status(202).json(GENERIC_VERIFICATION_RESPONSE);
    throw error;
  }

  try {
    await issueVerification(user);
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) throw error;
    return res.status(503).json({ error: 'Your account was created, but verification email could not be sent. Please try again later.' });
  }

  res.status(202).json(GENERIC_VERIFICATION_RESPONSE);
}));

router.post('/resend-verification', verificationLimiter, wrap(async (req, res) => {
  const { email } = emailSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerified && user.isActive) {
    try {
      await issueVerification(user);
    } catch (error) {
      if (!(error instanceof EmailDeliveryError)) throw error;
      return res.status(503).json({ error: 'Verification email could not be sent. Please try again later.' });
    }
  }
  res.json(GENERIC_VERIFICATION_RESPONSE);
}));

router.post('/verify-email', verificationLimiter, wrap(async (req, res) => {
  const { token } = tokenSchema.parse(req.body);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await prisma.user.findUnique({ where: { emailVerificationTokenHash: tokenHash } });
  if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt <= new Date() || !user.isActive) {
    return res.status(400).json({ error: 'This verification link is invalid or expired. Request a new one and try again.' });
  }

  const verified = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: {
        id: user.id,
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { gt: new Date() },
        emailVerified: false,
        isActive: true,
      },
      data: {
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });
    if (result.count !== 1) return false;
    await logAudit({
      userId: user.id,
      action: 'EMAIL_VERIFIED',
      ip: req.ip,
      metadata: { email: user.email },
    }, tx);
    return true;
  });

  if (!verified) return res.status(400).json({ error: 'This verification link is invalid or expired. Request a new one and try again.' });
  res.json({ message: 'Email verified. You can now log in.' });
}));

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !user.isActive || !ok) {
    await logAudit({ userId: user ? user.id : null, action: 'LOGIN_FAILED', result: 'DENIED', ip: req.ip, metadata: { email } });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (!user.emailVerified) {
    await logAudit({ userId: user.id, action: 'LOGIN_UNVERIFIED', result: 'DENIED', ip: req.ip });
    return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', error: 'Verify your email address before logging in.' });
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
