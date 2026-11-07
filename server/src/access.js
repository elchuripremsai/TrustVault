const prisma = require('./db');
const { logAudit } = require('./audit');

const RANK = { READ: 1, EDIT: 2, OWNER: 3 };
const UUID_RE = /^[0-9a-f-]{36}$/i;

// The ONE place that decides who may touch a document. Always reads the database.
async function getAccess(userId, documentId) {
  if (!UUID_RE.test(documentId)) return { doc: null, level: null };
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return { doc: null, level: null };
  if (doc.ownerId === userId) return { doc, level: 'OWNER' };
  const perm = await prisma.documentPermission.findFirst({ where: { documentId, userId, revoked: false } });
  return { doc, level: perm ? perm.type : null };
}

// Route guard. minLevel is 'READ', 'EDIT' or 'OWNER'.
//  - No access at all  -> 404 (we do not even confirm the document exists)
//  - Some access, not enough -> 403
// Every refusal is written to the audit log as DENIED.
function requireDocAccess(minLevel, attempted) {
  return async (req, res, next) => {
    try {
      const { doc, level } = await getAccess(req.user.id, req.params.id);
      if (!doc || !level) {
        await logAudit({
          userId: req.user.id,
          documentId: doc ? doc.id : null,
          action: 'ACCESS_DENIED',
          result: 'DENIED',
          ip: req.ip,
          metadata: { attempted, reason: doc ? 'no active permission' : 'document not found', attemptedId: String(req.params.id).slice(0, 64) },
        });
        return res.status(404).json({ error: 'Document not found.' });
      }
      if (RANK[level] < RANK[minLevel]) {
        await logAudit({
          userId: req.user.id, documentId: doc.id, action: 'ACCESS_DENIED', result: 'DENIED', ip: req.ip,
          metadata: { attempted, reason: 'permission level too low', has: level, needs: minLevel },
        });
        return res.status(403).json({ error: 'You do not have permission to do this.' });
      }
      req.doc = doc;
      req.level = level;
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { getAccess, requireDocAccess };
