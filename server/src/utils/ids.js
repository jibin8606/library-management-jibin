const { AppError } = require('./errors');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function parseId(value, label = 'id') {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new AppError(400, 'INVALID_ID', `Invalid ${label}`);
  }
  return value;
}
module.exports = { parseId };
