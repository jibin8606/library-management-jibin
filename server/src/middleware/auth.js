const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const { AppError } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header');
  }
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token');
  }
  // Load the user so role changes / deleted accounts take effect immediately.
  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token');
  req.user = user;
  next();
});

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError(403, 'FORBIDDEN', `This action requires role: ${roles.join(' or ')}`));
  }
  next();
};

const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });

module.exports = { authenticate, requireRole, signToken };
