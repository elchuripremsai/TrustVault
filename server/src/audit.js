const crypto = require('crypto');
const prisma = require('./db');

const GENESIS = '0'.repeat(64);

// JSON.stringify with sorted keys, so the same data always gives the same text.
// (PostgreSQL JSONB may reorder keys, so we cannot rely on insertion order.)
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
}

// hash = SHA-256( previousHash + the event's own data )
function computeHash(previousHash, e) {
  const payload = stable({
    userId: e.userId ?? null,
    documentId: e.documentId ?? null,
    action: e.action,
    result: e.result,
    ipAddress: e.ipAddress ?? null,
    metadata: e.metadata ?? {},
    createdAt: new Date(e.createdAt).toISOString(),
  });
  return crypto.createHash('sha256').update(previousHash + '|' + payload).digest('hex');
}

/**
 * Append one event to the audit chain.
 * Pass `tx` to write inside an existing transaction (so the business change and its
 * audit record succeed or fail together).
 */
async function logAudit(entry, tx) {
  const run = async (c) => {
    // Only one audit write at a time, otherwise two events could share the same "previous hash".
    await c.$executeRaw`SELECT pg_advisory_xact_lock(727001)`;
    const last = await c.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { currentHash: true } });
    const previousHash = last ? last.currentHash : GENESIS;
    const data = {
      userId: entry.userId || null,
      documentId: entry.documentId || null,
      action: entry.action,
      result: entry.result || 'SUCCESS',
      ipAddress: entry.ip || null,
      metadata: JSON.parse(JSON.stringify(entry.metadata || {})),
      createdAt: new Date(),
    };
    const currentHash = computeHash(previousHash, data);
    return c.auditLog.create({ data: { ...data, previousHash, currentHash } });
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

// Walk the whole chain and recompute every hash.
async function verifyChain() {
  let previous = GENESIS;
  let checked = 0;
  let cursor = 0;
  for (;;) {
    const rows = await prisma.auditLog.findMany({ where: { id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 1000 });
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.previousHash !== previous) {
        return { valid: false, checked, brokenAtId: r.id, reason: 'An event is missing or out of order.' };
      }
      if (computeHash(previous, r) !== r.currentHash) {
        return { valid: false, checked, brokenAtId: r.id, reason: 'The content of an event was changed.' };
      }
      previous = r.currentHash;
      checked += 1;
      cursor = r.id;
    }
  }
  return { valid: true, checked, latestHash: previous };
}

// Adds user names and document titles to raw audit rows for the UI.
async function attachNames(items) {
  const uids = [...new Set(items.map((i) => i.userId).filter(Boolean))];
  const dids = [...new Set(items.map((i) => i.documentId).filter(Boolean))];
  const [users, docs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, name: true, email: true } }),
    prisma.document.findMany({ where: { id: { in: dids } }, select: { id: true, title: true } }),
  ]);
  const um = new Map(users.map((u) => [u.id, u]));
  const dm = new Map(docs.map((d) => [d.id, d.title]));
  return items.map((i) => ({
    id: i.id,
    action: i.action,
    result: i.result,
    createdAt: i.createdAt,
    ipAddress: i.ipAddress,
    metadata: i.metadata,
    userId: i.userId,
    userName: um.get(i.userId)?.name || null,
    userEmail: um.get(i.userId)?.email || null,
    documentId: i.documentId,
    documentTitle: dm.get(i.documentId) || i.metadata?.title || null,
    previousHash: i.previousHash,
    currentHash: i.currentHash,
  }));
}

module.exports = { logAudit, verifyChain, attachNames, computeHash, GENESIS };
