const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { storageDir } = require('./config');

fs.mkdirSync(storageDir, { recursive: true });

// Extensions that are never accepted, even in the middle of a name like "report.exe.pdf"
const BLOCKED = new Set([
  'exe', 'dll', 'bat', 'cmd', 'com', 'msi', 'sh', 'bash', 'js', 'mjs', 'jar', 'php', 'py', 'pl', 'rb',
  'ps1', 'vbs', 'scr', 'apk', 'app', 'html', 'htm', 'svg', 'swf', 'docm', 'xlsm', 'lnk', 'reg',
]);

const ALLOWED = {
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  png: { kind: 'png', mime: 'image/png' },
  jpg: { kind: 'jpg', mime: 'image/jpeg' },
  jpeg: { kind: 'jpg', mime: 'image/jpeg' },
  txt: { kind: 'txt', mime: 'text/plain; charset=utf-8' },
  docx: { kind: 'zip', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { kind: 'zip', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};

// Look at the first bytes of the file ("magic bytes") to learn what it really is.
function detect(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'zip';
  if (!buf.subarray(0, 8000).includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return 'txt';
    } catch (e) {
      return null;
    }
  }
  return null;
}

function cleanName(n) {
  return path.basename(String(n || 'file')).replace(/[\u0000-\u001f\u007f<>:"|?*\\/]/g, '_').slice(0, 200);
}

function validateUpload(file) {
  const name = cleanName(file.originalname);
  const parts = name.toLowerCase().split('.');
  if (parts.length < 2) return { ok: false, error: 'The file needs an extension such as .pdf' };
  if (parts.slice(1).some((p) => BLOCKED.has(p))) return { ok: false, error: 'This file type is not allowed.' };
  const ext = parts[parts.length - 1];
  const rule = ALLOWED[ext];
  if (!rule) return { ok: false, error: `.${ext} files are not allowed. Allowed: pdf, png, jpg, jpeg, txt, docx, xlsx.` };
  if (!file.buffer || file.size === 0) return { ok: false, error: 'The file is empty.' };
  if (detect(file.buffer) !== rule.kind) return { ok: false, error: 'The file content does not match its extension.' };
  return { ok: true, name, mime: rule.mime };
}

const NAME_RE = /^[0-9a-f-]{36}\.bin$/;
function pathFor(storageName) {
  if (!NAME_RE.test(storageName)) throw new Error('Invalid storage name'); // blocks path traversal
  return path.join(storageDir, storageName);
}

function saveFile(buffer) {
  const storageName = crypto.randomUUID() + '.bin'; // random name, never the user's filename
  fs.writeFileSync(pathFor(storageName), buffer, { flag: 'wx', mode: 0o600 });
  return storageName;
}
const openStream = (storageName) => fs.createReadStream(pathFor(storageName));
function deleteFile(storageName) {
  try { fs.unlinkSync(pathFor(storageName)); } catch (e) { /* already gone */ }
}
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

module.exports = { validateUpload, saveFile, openStream, deleteFile, sha256 };
