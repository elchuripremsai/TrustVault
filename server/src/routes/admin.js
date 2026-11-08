const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAudit, verifyChain, attachNames } = require('../audit');
const { wrap } = require('../utils');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

// There is intentionally NO route here that updates or deletes audit records.

router.get('/stats', wrap(async (req, res) => {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 864e5);
  const dayAgo = new Date(now - 864e5);
  const hourAgo = new Date(now - 36e5);
  const [users, documents, downloads, permissionChanges, failedAttempts, failed24h, recentUploads, recentEvents, weekEvents, deniedHour] = await Promise.all([
    prisma.user.count(),
    prisma.document.count(),
    prisma.auditLog.count({ where: { action: 'DOWNLOAD', result: 'SUCCESS' } }),
    prisma.auditLog.count({ where: { action: { in: ['PERMISSION_GRANTED', 'PERMISSION_REVOKED'] } } }),
    prisma.auditLog.count({ where: { result: 'DENIED' } }),
    prisma.auditLog.count({ where: { result: 'DENIED', createdAt: { gte: dayAgo } } }),
    prisma.document.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { owner: { select: { name: true } } } }),
    prisma.auditLog.findMany({ orderBy: { id: 'desc' }, take: 10 }),
    prisma.auditLog.findMany({ where: { createdAt: { gte: weekAgo } }, select: { createdAt: true, result: true } }),
    prisma.auditLog.findMany({ where: { result: 'DENIED', createdAt: { gte: hourAgo } }, select: { userId: true, ipAddress: true, action: true } }),
  ]);

  // events per day for the chart (last 7 days, UTC)
  const days = {};
  for (let i = 6; i >= 0; i -= 1) days[new Date(now - i * 864e5).toISOString().slice(0, 10)] = { day: '', events: 0, denied: 0 };
  weekEvents.forEach((e) => {
    const k = e.createdAt.toISOString().slice(0, 10);
    if (days[k]) {
      days[k].events += 1;
      if (e.result === 'DENIED') days[k].denied += 1;
    }
  });
  const chart = Object.entries(days).map(([k, v]) => ({ ...v, day: k.slice(5) }));

  // suspicious activity: 5 or more denied events from one user / failed logins from one IP in the last hour
  const byUser = {};
  const byIp = {};
  deniedHour.forEach((d) => {
    if (d.action === 'LOGIN_FAILED') {
      if (d.ipAddress) byIp[d.ipAddress] = (byIp[d.ipAddress] || 0) + 1;
    } else if (d.userId) {
      byUser[d.userId] = (byUser[d.userId] || 0) + 1;
    }
  });
  const userIds = Object.keys(byUser).filter((k) => byUser[k] >= 5);
  const names = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
  const suspicious = [
    ...names.map((u) => ({ kind: 'Repeated denied access', who: `${u.name} (${u.email})`, count: byUser[u.id] })),
    ...Object.keys(byIp).filter((ip) => byIp[ip] >= 5).map((ip) => ({ kind: 'Possible password guessing', who: ip, count: byIp[ip] })),
  ];

  res.json({
    totals: { users, documents, downloads, permissionChanges, failedAttempts, failed24h },
    recentUploads: recentUploads.map((d) => ({ id: d.id, title: d.title, ownerName: d.owner.name, createdAt: d.createdAt })),
    recentEvents: await attachNames(recentEvents),
    chart,
    suspicious,
  });
}));

router.get('/users', wrap(async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true } });
  res.json({ users });
}));

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(10).max(100),
  role: z.enum(['ADMIN', 'OWNER', 'VIEWER']),
});

router.post('/users', wrap(async (req, res) => {
  const data = createUserSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: data.email, name: data.name, role: data.role, passwordHash, emailVerified: true } });
    await logAudit({ userId: req.user.id, action: 'USER_CREATED', ip: req.ip, metadata: { targetUserId: u.id, email: u.email, role: u.role } }, tx);
    return u;
  });
  res.status(201).json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive } });
}));

const patchUserSchema = z.object({ role: z.enum(['ADMIN', 'OWNER', 'VIEWER']).optional(), isActive: z.boolean().optional() });

router.patch('/users/:id', wrap(async (req, res) => {
  const data = patchUserSchema.parse(req.body);
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role or status.' });
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'User not found.' });
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data });
    await logAudit({ userId: req.user.id, action: 'USER_UPDATED', ip: req.ip, metadata: { targetUserId: target.id, email: target.email, changes: data } }, tx);
  });
  res.json({ ok: true });
}));

// Metadata only. File contents and storage names are never returned here.
router.get('/documents', wrap(async (req, res) => {
  const docs = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    include: { owner: { select: { name: true, email: true } }, versions: { orderBy: { versionNumber: 'desc' }, take: 1 }, _count: { select: { permissions: { where: { revoked: false } } } } },
  });
  res.json({
    documents: docs.map((d) => ({
      id: d.id, title: d.title, category: d.category, ownerName: d.owner.name, ownerEmail: d.owner.email,
      currentVersion: d.currentVersion, sizeBytes: d.versions[0] ? d.versions[0].sizeBytes : null,
      sharedCount: d._count.permissions, createdAt: d.createdAt, updatedAt: d.updatedAt,
    })),
  });
}));

router.get('/audit/verify', wrap(async (req, res) => {
  res.json(await verifyChain());
}));

router.get('/audit', wrap(async (req, res) => {
  const q = req.query;
  const where = {};
  if (q.userId) where.userId = String(q.userId);
  if (q.documentId) where.documentId = String(q.documentId);
  if (q.action) where.action = String(q.action);
  if (q.result === 'SUCCESS' || q.result === 'DENIED') where.result = q.result;
  const range = {};
  if (q.from && !Number.isNaN(Date.parse(q.from))) range.gte = new Date(q.from);
  if (q.to && !Number.isNaN(Date.parse(q.to))) range.lte = new Date(new Date(q.to).getTime() + 864e5 - 1);
  if (Object.keys(range).length) where.createdAt = range;
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take: limit, skip: (page - 1) * limit }),
  ]);
  res.json({ total, page, limit, items: await attachNames(rows) });
}));

module.exports = router;
