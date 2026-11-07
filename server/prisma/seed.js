require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/db');
const storage = require('../src/storage');
const { logAudit } = require('../src/audit');

// SAFE DEMO PASSWORD ONLY. Never use this in a real system.
const DEMO_PASSWORD = 'TrustVault#Demo26';

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const people = [
    { email: 'admin@trustvault.demo', name: 'Asha Admin', role: 'ADMIN' },
    { email: 'owner@trustvault.demo', name: 'Omar Owner', role: 'OWNER' },
    { email: 'viewer@trustvault.demo', name: 'Vera Viewer', role: 'VIEWER' },
  ];
  const users = {};
  for (const p of people) {
    users[p.role] = await prisma.user.upsert({ where: { email: p.email }, update: {}, create: { ...p, passwordHash } });
  }

  const title = 'Welcome to TrustVault (sample)';
  const exists = await prisma.document.findFirst({ where: { title, ownerId: users.OWNER.id } });
  if (!exists && process.env.SEED_SAMPLE !== 'false') {
    const content = Buffer.from('This is a sample confidential document.\nOnly people with an active permission can read it.\n');
    const storageName = storage.saveFile(content);
    await prisma.$transaction(async (tx) => {
      const d = await tx.document.create({ data: { title, description: 'Sample file created by the seed script.', category: 'General', ownerId: users.OWNER.id } });
      await tx.documentVersion.create({
        data: { documentId: d.id, versionNumber: 1, storageName, originalName: 'welcome.txt', mimeType: 'text/plain; charset=utf-8', sizeBytes: content.length, sha256: storage.sha256(content), uploadedById: users.OWNER.id },
      });
      await tx.documentPermission.create({ data: { documentId: d.id, userId: users.VIEWER.id, type: 'READ', grantedById: users.OWNER.id } });
      await logAudit({ userId: users.OWNER.id, documentId: d.id, action: 'UPLOAD', metadata: { title, fileName: 'welcome.txt', version: 1, seed: true } }, tx);
      await logAudit({ userId: users.OWNER.id, documentId: d.id, action: 'PERMISSION_GRANTED', metadata: { targetUserId: users.VIEWER.id, targetEmail: users.VIEWER.email, type: 'READ', title, seed: true } }, tx);
    });
  }
  console.log('Seed finished. Demo accounts (password: ' + DEMO_PASSWORD + '):');
  people.forEach((p) => console.log(`  ${p.role.padEnd(6)} ${p.email}`));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
