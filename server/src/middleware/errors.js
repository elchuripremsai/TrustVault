const { ZodError } = require('zod');
const multer = require('multer');
const { isTest } = require('../config');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Some of the information you entered is not valid.',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'The file is too large.' });
    return res.status(400).json({ error: 'Upload problem: ' + err.code });
  }
  if (err && err.code === 'P2002') return res.status(409).json({ error: 'That record already exists.' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
  if (!isTest) console.error(err);
  // Never send internal error details to the browser.
  res.status(500).json({ error: 'Something went wrong on the server.' });
};
