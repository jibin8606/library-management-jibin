const { AppError } = require('../utils/errors');

// Every error leaves the API in this shape:
//   { "error": { "code": "SOME_CODE", "message": "Human readable", "details": [...]? } }
const body = (code, message, details) => ({ error: { code, message, ...(details ? { details } : {}) } });

function notFound(req, res) {
  res.status(404).json(body('NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json(body(err.code, err.message, err.details));
  }
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return res.status(409).json(body('DUPLICATE_VALUE', `A record with this ${field} already exists`));
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json(body('INVALID_JSON', 'Request body is not valid JSON'));
  }
  if (err && err.name === 'ValidationError') {
    return res.status(400).json(
      body('VALIDATION_ERROR', 'Request validation failed',
        Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })))
    );
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json(body('INVALID_ID', 'Invalid identifier'));
  }
  console.error(err); // eslint-disable-line no-console
  return res.status(500).json(body('INTERNAL_ERROR', 'Something went wrong'));
}

module.exports = { notFound, errorHandler };
