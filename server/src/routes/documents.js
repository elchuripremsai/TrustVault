const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireDocAccess } = require('../access');
const { logAudit, attachNames } = require('../audit');
const storage = require('../storage');
const { maxFileBytes } = require('../config');
const { wrap } = require('../utils');

const router = express.Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxFileBytes, files: 1 } });

const metaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().min(1).max(50).default('General'),
});

const include = {
  owner: { select: { name: true } },
  versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
  _count: { select: { permissions: { where: { revoked: false } } } },
};

function shape(doc, access, sharedAt) {
  const v = doc.versions && doc.versions[0];
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    category: doc.category,
    ownerId: doc.ownerId,
    ownerName: doc.owner ? doc.owner.name : undefined,
    access,
    sharedAt: sharedAt || null,
    currentVersion: doc.currentVersion,
    fileName: v ? v.originalName : null,
    mimeType: v ? v.mimeType : null,
    sizeBytes: v ? v.sizeBytes : null,
    sharedCount: doc._count ? doc._count.permissions : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function filters(q, category) {
  const w = {};
  if (category) w.category = String(category);
  if (q) w.OR = [{ title: { contains: String(q), mode: 'insensitive' } }, { description: { contains: String(q), mode: 'insensitive' } }];
  return w;
}

// List = documents I own + documents with an ACTIVE permission for me. Nothing else, ever.
router.get('/', wrap(async (req, res) => {
  const f = filters(req.query.q, req.query.category);
  const owned = await prisma.document.findMany({ where: { ownerId: req.user.id, ...f }, include, orderBy: { updatedAt: 'desc' } });
  const shared = await prisma.documentPermission.findMany({
    where: { userId: req.user.id, revoked: false, document: f },
    include: { document: { include } },
    orderBy: { grantedAt: 'desc' },
  });
  res.json({ documents: [...owned.map((d) => shape(d, 'OWNER')), ...shared.map((p) => shape(p.document, p.type, p.grantedAt))] });
}));

// Recent activity on documents I own (must be declared before '/:id')
router.get('/activity', wrap(async (req, res) => {
  const ids = (await prisma.document.findMany({ where: { ownerId: req.user.id }, select: { id: true } })).map((d) => d.id);
  const items = await prisma.auditLog.findMany({ where: { documentId: { in: ids } }, orderBy: { id: 'desc' }, take: 10 });
  res.json({ items: await attachNames(items) });
}));

async function storeNewFile(req, res, meta) {
  if (!req.file) {
    res.status(400).json({ error: 'Please choose a file.' });
    return null;
  }
  const check = storage.validateUpload(req.file);
  if (!check.ok) {
    await logAudit({ userId: req.user.id, documentId: req.doc ? req.doc.id : null, action: 'UPLOAD', result: 'DENIED', ip: req.ip, metadata: { reason: check.error, fileName: String(req.file.originalname).slice(0, 100) } });
    res.status(400).json({ error: check.error });
    return null;
  }
  return { check, storageName: storage.saveFile(req.file.buffer), sha: storage.sha256(req.file.buffer), meta };
}

router.post('/', requireRole('OWNER'), upload.single('file'), wrap(async (req, res) => {
  const meta = metaSchema.parse(req.body);
  const stored = await storeNewFile(req, res, meta);
  if (!stored) return;
  try {
    const doc = await prisma.$transaction(async (tx) => {
      const d = await tx.document.create({ data: { ...meta, ownerId: req.user.id } });
      await tx.documentVersion.create({
        data: {
          documentId: d.id, versionNumber: 1, storageName: stored.storageName, originalName: stored.check.name,
          mimeType: stored.check.mime, sizeBytes: req.file.size, sha256: stored.sha, uploadedById: req.user.id,
        },
      });
      await logAudit({ userId: req.user.id, documentId: d.id, action: 'UPLOAD', ip: req.ip, metadata: { title: d.title, fileName: stored.check.name, sizeBytes: req.file.size, version: 1 } }, tx);
      return d;
    });
    res.status(201).json({ id: doc.id });
  } catch (e) {
    storage.deleteFile(stored.storageName);
    throw e;
  }
}));

router.get('/:id', requireDocAccess('READ', 'view'), wrap(async (req, res) => {
  const [versions, owner] = await Promise.all([
    prisma.documentVersion.findMany({
      where: { documentId: req.doc.id },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
    }),
    prisma.user.findUnique({ where: { id: req.doc.ownerId }, select: { name: true } }),
  ]);
  await logAudit({ userId: req.user.id, documentId: req.doc.id, action: 'VIEW', ip: req.ip, metadata: { kind: 'details' } });
  res.json({
    document: {
      id: req.doc.id, title: req.doc.title, description: req.doc.description, category: req.doc.category,
      ownerName: owner ? owner.name : null, access: req.level, currentVersion: req.doc.currentVersion,
      createdAt: req.doc.createdAt, updatedAt: req.doc.updatedAt,
    },
    versions,
  });
}));

// The file is streamed through the backend ONLY after the permission check above passed.
router.get('/:id/download', requireDocAccess('READ', 'download'), wrap(async (req, res) => {
  const vn = req.query.version ? parseInt(req.query.version, 10) : req.doc.currentVersion;
  if (!Number.isInteger(vn)) return res.status(400).json({ error: 'Invalid version.' });
  const v = await prisma.documentVersion.findUnique({ where: { documentId_versionNumber: { documentId: req.doc.id, versionNumber: vn } } });
  if (!v) return res.status(404).json({ error: 'Version not found.' });
  const preview = req.query.preview === '1';
  await logAudit({
    userId: req.user.id, documentId: req.doc.id, action: preview ? 'VIEW' : 'DOWNLOAD', ip: req.ip,
    metadata: { version: vn, fileName: v.originalName, preview },
  });
  res.setHeader('Content-Type', v.mimeType);
  res.setHeader('Content-Length', String(v.sizeBytes));
  res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(v.originalName));
  res.setHeader('Cache-Control', 'no-store');
  const stream = storage.openStream(v.storageName);
  stream.on('error', () => (res.headersSent ? res.destroy() : res.status(500).end()));
  stream.pipe(res);
}));

router.put('/:id', requireDocAccess('EDIT', 'update details'), wrap(async (req, res) => {
  const parsed = metaSchema.partial().parse(req.body);
  const fields = Object.keys(parsed).filter((k) => parsed[k] !== undefined);
  if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  const data = {};
  fields.forEach((k) => { data[k] = parsed[k]; });
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: req.doc.id }, data });
    await logAudit({ userId: req.user.id, documentId: req.doc.id, action: 'UPDATE', ip: req.ip, metadata: { fields, title: data.title || req.doc.title } }, tx);
  });
  res.json({ ok: true });
}));

router.post('/:id/versions', requireDocAccess('EDIT', 'upload new version'), upload.single('file'), wrap(async (req, res) => {
  const stored = await storeNewFile(req, res, null);
  if (!stored) return;
  try {
    const next = await prisma.$transaction(async (tx) => {
      const fresh = await tx.document.findUnique({ where: { id: req.doc.id } });
      const n = fresh.currentVersion + 1;
      await tx.documentVersion.create({
        data: {
          documentId: fresh.id, versionNumber: n, storageName: stored.storageName, originalName: stored.check.name,
          mimeType: stored.check.mime, sizeBytes: req.file.size, sha256: stored.sha, uploadedById: req.user.id,
        },
      });
      await tx.document.update({ where: { id: fresh.id }, data: { currentVersion: n } });
      await logAudit({ userId: req.user.id, documentId: fresh.id, action: 'UPDATE', ip: req.ip, metadata: { newVersion: n, fileName: stored.check.name, title: fresh.title } }, tx);
      return n;
    });
    res.status(201).json({ version: next });
  } catch (e) {
    storage.deleteFile(stored.storageName);
    throw e;
  }
}));

router.delete('/:id', requireDocAccess('OWNER', 'delete'), wrap(async (req, res) => {
  const versions = await prisma.documentVersion.findMany({ where: { documentId: req.doc.id }, select: { storageName: true } });
  await prisma.$transaction(async (tx) => {
    await logAudit({ userId: req.user.id, documentId: req.doc.id, action: 'DELETE', ip: req.ip, metadata: { title: req.doc.title } }, tx);
    await tx.document.delete({ where: { id: req.doc.id } });
  });
  versions.forEach((v) => storage.deleteFile(v.storageName));
  res.json({ ok: true });
}));

// ---------- Permissions (owner only) ----------
const grantSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  type: z.enum(['READ', 'EDIT']),
});

router.get('/:id/permissions', requireDocAccess('OWNER', 'list permissions'), wrap(async (req, res) => {
  const perms = await prisma.documentPermission.findMany({
    where: { documentId: req.doc.id },
    orderBy: { grantedAt: 'desc' },
    include: { user: { select: { name: true, email: true } }, grantedBy: { select: { name: true } } },
  });
  res.json({
    permissions: perms.map((p) => ({
      id: p.id, userName: p.user.name, userEmail: p.user.email, type: p.type, grantedBy: p.grantedBy.name,
      grantedAt: p.grantedAt, revoked: p.revoked, revokedAt: p.revokedAt,
    })),
  });
}));

router.post('/:id/permissions', requireDocAccess('OWNER', 'grant permission'), wrap(async (req, res) => {
  const { email, type } = grantSchema.parse(req.body);
  const target = await prisma.user.findUnique({ where: { email } });
  if (!target || !target.isActive) return res.status(404).json({ error: 'No active user has that email.' });
  if (target.id === req.doc.ownerId) return res.status(400).json({ error: 'You already own this document.' });
  const perm = await prisma.$transaction(async (tx) => {
    const existing = await tx.documentPermission.findFirst({ where: { documentId: req.doc.id, userId: target.id, revoked: false } });
    let p;
    if (existing) {
      if (existing.type === type) return existing;
      p = await tx.documentPermission.update({ where: { id: existing.id }, data: { type } });
    } else {
      p = await tx.documentPermission.create({ data: { documentId: req.doc.id, userId: target.id, type, grantedById: req.user.id } });
    }
    await logAudit({
      userId: req.user.id, documentId: req.doc.id, action: 'PERMISSION_GRANTED', ip: req.ip,
      metadata: { targetUserId: target.id, targetEmail: target.email, type, title: req.doc.title },
    }, tx);
    return p;
  });
  res.status(201).json({ permission: { id: perm.id, type: perm.type } });
}));

router.delete('/:id/permissions/:permId', requireDocAccess('OWNER', 'revoke permission'), wrap(async (req, res) => {
  const done = await prisma.$transaction(async (tx) => {
    const perm = await tx.documentPermission.findFirst({ where: { id: req.params.permId, documentId: req.doc.id, revoked: false } });
    if (!perm) return null;
    await tx.documentPermission.update({ where: { id: perm.id }, data: { revoked: true, revokedAt: new Date() } });
    await logAudit({
      userId: req.user.id, documentId: req.doc.id, action: 'PERMISSION_REVOKED', ip: req.ip,
      metadata: { targetUserId: perm.userId, type: perm.type, title: req.doc.title },
    }, tx);
    return perm;
  });
  if (!done) return res.status(404).json({ error: 'Active permission not found.' });
  res.json({ ok: true });
}));

router.get('/:id/audit', requireDocAccess('OWNER', 'view audit history'), wrap(async (req, res) => {
  const items = await prisma.auditLog.findMany({ where: { documentId: req.doc.id }, orderBy: { id: 'desc' }, take: 200 });
  res.json({ items: await attachNames(items) });
}));

module.exports = router;
