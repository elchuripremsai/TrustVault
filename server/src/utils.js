// Express 4 does not catch errors from async handlers by itself. This wrapper does.
exports.wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
