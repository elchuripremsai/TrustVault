// Runs before every test file. Sets a safe test environment.
const path = require('path');
const os = require('os');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });
process.env.NODE_ENV = 'test';

const dbName = (process.env.DATABASE_URL || '').split('?')[0].split('/').pop();
if (!/test/i.test(dbName)) {
  throw new Error('Refusing to run: DATABASE_URL must point to a database whose name contains "test" (these tests wipe every table). Create server/.env.test first.');
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-123456';
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trustvault-test-'));
process.env.MAX_FILE_BYTES = String(1024 * 1024); // 1 MB limit in tests
