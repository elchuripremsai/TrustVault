const path = require('path');

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const config = {
  isProd,
  isTest,
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  storageDir: process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage'),
  maxFileBytes: Number(process.env.MAX_FILE_BYTES) || 10 * 1024 * 1024,
  cookieName: 'tv_session',
  sessionMs: 2 * 60 * 60 * 1000, // 2 hours
};

if (!config.jwtSecret || config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET is missing or too short (need at least 32 characters).');
}

module.exports = config;
