const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const prisma = require('../src/db');

const PASSWORD = 'Test@12345678';
const SECRET = 'TOP-SECRET-CONTENT-12345';
const pdf = (text = SECRET) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);

// supertest helper: read a response body as raw bytes
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function makeUser(role, name) {
  return prisma.user.create({
    data: { email: `${name}@test.local`, name, role, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
}

// Logs in and returns a small client that automatically sends cookie + CSRF token.
async function session(user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  expect(res.status).toBe(200);
  const csrf = res.body.csrf;
  return {
    user,
    get: (u) => agent.get(u),
    post: (u) => agent.post(u).set('x-csrf-token', csrf),
    put: (u) => agent.put(u).set('x-csrf-token', csrf),
    patch: (u) => agent.patch(u).set('x-csrf-token', csrf),
    del: (u) => agent.delete(u).set('x-csrf-token', csrf),
    rawPost: (u) => agent.post(u), // no CSRF header
  };
}

async function uploadDoc(s, title = 'Contract', content = pdf(), filename = 'contract.pdf') {
  const res = await s.post('/api/documents').field('title', title).field('category', 'Legal').attach('file', content, { filename, contentType: 'application/pdf' });
  expect(res.status).toBe(201);
  return res.body.id;
}

const download = (s, id) => s.get(`/api/documents/${id}/download`).buffer(true).parse(binary);

async function grant(owner, docId, email, type = 'READ') {
  const res = await owner.post(`/api/documents/${docId}/permissions`).send({ email, type });
  expect(res.status).toBe(201);
  return res.body.permission.id;
}

let admin, owner, owner2, viewer, outsider, docId;

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "AuditLog","DocumentPermission","DocumentVersion","Document","User" RESTART IDENTITY CASCADE');
  const [a, o, o2, v, x] = await Promise.all([
    makeUser('ADMIN', 'admin'), makeUser('OWNER', 'owner'), makeUser('OWNER', 'owner2'), makeUser('VIEWER', 'viewer'), makeUser('VIEWER', 'outsider'),
  ]);
  admin = await session(a);
  owner = await session(o);
  owner2 = await session(o2);
  viewer = await session(v);
  outsider = await session(x);
  docId = await uploadDoc(owner);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Document access (read/download)', () => {
  test('1. owner can access their own document', async () => {
    const meta = await owner.get(`/api/documents/${docId}`);
    expect(meta.status).toBe(200);
    expect(meta.body.document.access).toBe('OWNER');
    const file = await download(owner, docId);
    expect(file.status).toBe(200);
    expect(file.body.toString()).toContain(SECRET);
  });

  test('2. viewer with a READ grant can view and download', async () => {
    await grant(owner, docId, 'viewer@test.local', 'READ');
    expect((await viewer.get(`/api/documents/${docId}`)).status).toBe(200);
    const file = await download(viewer, docId);
    expect(file.status).toBe(200);
    expect(file.body.toString()).toContain(SECRET);
  });

  test('3. unauthorised user cannot view a document, and the attempt is audited as DENIED', async () => {
    const res = await outsider.get(`/api/documents/${docId}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Contract');
    const denied = await prisma.auditLog.findFirst({ where: { userId: outsider.user.id, documentId: docId, action: 'ACCESS_DENIED', result: 'DENIED' } });
    expect(denied).not.toBeNull();
  });

  test('4. unauthorised user cannot download a document', async () => {
    const res = await download(outsider, docId);
    expect(res.status).toBe(404);
    expect(res.body.toString()).not.toContain(SECRET);
  });
});

describe('Editing, deleting and sharing rules', () => {
  test('5. viewer with READ cannot edit (details or new version)', async () => {
    await grant(owner, docId, 'viewer@test.local', 'READ');
    const put = await viewer.put(`/api/documents/${docId}`).send({ title: 'Hacked' });
    expect(put.status).toBe(403);
    const ver = await viewer.post(`/api/documents/${docId}/versions`).attach('file', pdf('new'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(ver.status).toBe(403);
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    expect(doc.title).toBe('Contract');
    expect(doc.currentVersion).toBe(1);
  });

  test('5b. viewer with EDIT can edit details', async () => {
    await grant(owner, docId, 'viewer@test.local', 'EDIT');
    const put = await viewer.put(`/api/documents/${docId}`).send({ title: 'Renamed by editor' });
    expect(put.status).toBe(200);
    expect((await prisma.document.findUnique({ where: { id: docId } })).title).toBe('Renamed by editor');
  });

  test('6. viewer cannot delete (READ or EDIT); document and file survive', async () => {
    await grant(owner, docId, 'viewer@test.local', 'EDIT');
    expect((await viewer.del(`/api/documents/${docId}`)).status).toBe(403);
    expect((await outsider.del(`/api/documents/${docId}`)).status).toBe(404);
    expect(await prisma.document.findUnique({ where: { id: docId } })).not.toBeNull();
    expect((await download(owner, docId)).status).toBe(200);
  });

  test('11. viewer cannot grant permissions (READ, EDIT or no access)', async () => {
    await grant(owner, docId, 'viewer@test.local', 'EDIT');
    const a = await viewer.post(`/api/documents/${docId}/permissions`).send({ email: 'outsider@test.local', type: 'READ' });
    expect(a.status).toBe(403);
    const b = await outsider.post(`/api/documents/${docId}/permissions`).send({ email: 'outsider@test.local', type: 'READ' });
    expect(b.status).toBe(404);
    const rows = await prisma.documentPermission.findMany({ where: { userId: outsider.user.id } });
    expect(rows).toHaveLength(0);
  });
});

describe('Revocation', () => {
  test('7. owner can revoke a permission', async () => {
    const permId = await grant(owner, docId, 'viewer@test.local');
    const res = await owner.del(`/api/documents/${docId}/permissions/${permId}`);
    expect(res.status).toBe(200);
    const row = await prisma.documentPermission.findUnique({ where: { id: permId } });
    expect(row.revoked).toBe(true);
    expect(row.revokedAt).not.toBeNull();
  });

  test('8. revoked viewer loses access on the very next request', async () => {
    const permId = await grant(owner, docId, 'viewer@test.local');
    expect((await viewer.get(`/api/documents/${docId}`)).status).toBe(200);
    expect((await download(viewer, docId)).status).toBe(200);
    await owner.del(`/api/documents/${docId}/permissions/${permId}`);
    expect((await viewer.get(`/api/documents/${docId}`)).status).toBe(404);
    const after = await download(viewer, docId);
    expect(after.status).toBe(404);
    expect(after.body.toString()).not.toContain(SECRET);
    const list = await viewer.get('/api/documents');
    expect(list.body.documents.find((d) => d.id === docId)).toBeUndefined();
  });
});

describe('IDOR and authentication', () => {
  test('9. changing the document ID does not give access to other documents', async () => {
    const otherDoc = await uploadDoc(owner2, 'Other company secret', pdf('OTHER-SECRET'));
    await grant(owner, docId, 'viewer@test.local');
    expect((await viewer.get(`/api/documents/${docId}`)).status).toBe(200); // my document
    expect((await viewer.get(`/api/documents/${otherDoc}`)).status).toBe(404); // not mine
    expect((await download(viewer, otherDoc)).status).toBe(404);
    expect((await viewer.get('/api/documents/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await viewer.get('/api/documents/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);
    const list = await viewer.get('/api/documents');
    expect(list.body.documents.map((d) => d.id)).toEqual([docId]);
  });

  test('10. unauthenticated users cannot reach documents', async () => {
    expect((await request(app).get('/api/documents')).status).toBe(401);
    expect((await request(app).get(`/api/documents/${docId}`)).status).toBe(401);
    expect((await request(app).get(`/api/documents/${docId}/download`)).status).toBe(401);
    expect((await request(app).post('/api/documents').field('title', 'x')).status).toBe(401);
    expect((await request(app).get('/api/admin/stats')).status).toBe(401);
  });

  test('state-changing requests without the CSRF token are rejected', async () => {
    const res = await owner.rawPost(`/api/documents/${docId}/permissions`).send({ email: 'viewer@test.local', type: 'READ' });
    expect(res.status).toBe(403);
    expect(await prisma.documentPermission.count()).toBe(0);
  });

  test('wrong password is rejected and audited', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'owner@test.local', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN_FAILED', result: 'DENIED' } })).toBe(1);
  });
});

describe('Audit log protection', () => {
  test('12a. the API offers no way to edit or delete audit records', async () => {
    const row = await prisma.auditLog.findFirst();
    for (const method of ['put', 'patch', 'delete']) {
      const res = await admin[method === 'delete' ? 'del' : method](`/api/admin/audit/${row.id}`).send({ action: 'X' });
      expect(res.status).toBe(404);
    }
    expect((await viewer.get('/api/admin/audit')).status).toBe(403);
    expect((await owner.get('/api/admin/audit')).status).toBe(403);
  });

  test('12b. the database refuses UPDATE and DELETE on audit rows', async () => {
    const row = await prisma.auditLog.findFirst();
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'TAMPERED' } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    expect((await prisma.auditLog.findUnique({ where: { id: row.id } })).action).toBe(row.action);
  });

  test('12c. the hash chain is valid normally and breaks if someone tampers with the table', async () => {
    const ok = await admin.get('/api/admin/audit/verify');
    expect(ok.body.valid).toBe(true);
    expect(ok.body.checked).toBeGreaterThan(5);

    // Simulate an attacker with full database rights who turns the trigger off.
    await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_update_delete');
    try {
      await prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "action" = 'TAMPERED' WHERE "id" = (SELECT MIN("id") FROM "AuditLog")`);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_no_update_delete');
    }
    const bad = await admin.get('/api/admin/audit/verify');
    expect(bad.body.valid).toBe(false);
  });

  test('audit events are written for upload, grant, view, download and revoke', async () => {
    const permId = await grant(owner, docId, 'viewer@test.local');
    await viewer.get(`/api/documents/${docId}`);
    await download(viewer, docId);
    await owner.del(`/api/documents/${docId}/permissions/${permId}`);
    const actions = (await prisma.auditLog.findMany({ where: { documentId: docId } })).map((r) => r.action);
    ['UPLOAD', 'PERMISSION_GRANTED', 'VIEW', 'DOWNLOAD', 'PERMISSION_REVOKED'].forEach((a) => expect(actions).toContain(a));
  });
});

describe('Upload validation', () => {
  const countDocs = () => prisma.document.count();

  test('13. dangerous or fake files are rejected', async () => {
    const before = await countDocs();
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
    const tries = [
      ['malware.exe', exe],
      ['report.pdf.exe', exe],
      ['fake.pdf', exe], // pretends to be a PDF
      ['page.html', Buffer.from('<script>alert(1)</script>')],
      ['noextension', pdf()],
      ['empty.pdf', Buffer.alloc(0)],
    ];
    for (const [filename, content] of tries) {
      const res = await owner.post('/api/documents').field('title', 'Bad').attach('file', content, { filename });
      expect(res.status).toBe(400);
    }
    expect(await countDocs()).toBe(before);
  });

  test('13b. files over the size limit are rejected', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1.5 * 1024 * 1024, 65)]);
    const res = await owner.post('/api/documents').field('title', 'Big').attach('file', big, { filename: 'big.pdf' });
    expect([413, 400]).toContain(res.status);
  });

  test('13c. a viewer cannot upload at all', async () => {
    const res = await viewer.post('/api/documents').field('title', 'Nope').attach('file', pdf(), { filename: 'a.pdf' });
    expect(res.status).toBe(403);
  });
});

describe('Admin limits', () => {
  test('14. admin cannot read document contents without a grant, but can see metadata', async () => {
    expect((await admin.get(`/api/documents/${docId}`)).status).toBe(404);
    const file = await download(admin, docId);
    expect(file.status).toBe(404);
    expect(file.body.toString()).not.toContain(SECRET);

    const meta = await admin.get('/api/admin/documents');
    expect(meta.status).toBe(200);
    expect(meta.body.documents[0].title).toBe('Contract');
    expect(JSON.stringify(meta.body)).not.toMatch(/storageName|\.bin/);

    // After an explicit grant the admin can read like anyone else.
    await grant(owner, docId, 'admin@test.local', 'READ');
    const allowed = await download(admin, docId);
    expect(allowed.status).toBe(200);
    expect(allowed.body.toString()).toContain(SECRET);
  });

  test('non-admins cannot use admin endpoints', async () => {
    for (const s of [owner, viewer]) {
      expect((await s.get('/api/admin/stats')).status).toBe(403);
      expect((await s.get('/api/admin/users')).status).toBe(403);
      expect((await s.post('/api/admin/users').send({ email: 'a@b.co', name: 'A', password: 'longenough123', role: 'ADMIN' })).status).toBe(403);
    }
  });
});
