const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const config = require('../config');
const { User } = require('../models');
const { AppError } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate');
const { authenticate, signToken } = require('../middleware/auth');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// Public registration always creates a MEMBER. Librarians only come from the seed script.
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    if (await User.exists({ email })) throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const user = await User.create({ name, email, passwordHash, role: 'member' });
    res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    // Same error for unknown email and wrong password (no account enumeration).
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    res.json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

router.get('/me', authenticate, (req, res) => res.json({ user: req.user.toSafeJSON() }));

module.exports = router;
