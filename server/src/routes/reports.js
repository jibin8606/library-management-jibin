const express = require('express');
const { Loan } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { mostBorrowedPipeline, overdueMembersPipeline } = require('../services/reports');

const router = express.Router();
router.use(authenticate, requireRole('librarian'));

// Q1
router.get(
  '/most-borrowed',
  asyncHandler(async (req, res) => {
    res.json({ data: await Loan.aggregate(mostBorrowedPipeline({ days: 30, limit: 5 })) });
  })
);

// Q2
router.get(
  '/overdue-members',
  asyncHandler(async (req, res) => {
    res.json({ data: await Loan.aggregate(overdueMembersPipeline()) });
  })
);

module.exports = router;
