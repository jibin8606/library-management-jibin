const express = require('express');
const { z } = require('zod');
const { Loan } = require('../models');
const { CONDITIONS } = require('../models/Copy');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const { parseId } = require('../utils/ids');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { borrowBook, returnLoan, statusFilter, presentLoan } = require('../services/loans');

const router = express.Router();
router.use(authenticate);

const borrowSchema = z.object({ bookId: z.string().min(1, 'bookId is required') });
const returnSchema = z.object({ condition: z.enum(CONDITIONS).default('good') });
const listSchema = z.object({
  status: z.enum(['all', 'active', 'overdue', 'returned']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  memberId: z.string().optional(),
});

const populated = (q) => q.populate('book', 'title author isbn').populate('copy', 'copyCode');

// Member: borrow a book (the system picks the copy).
router.post(
  '/',
  requireRole('member'),
  validate(borrowSchema),
  asyncHandler(async (req, res) => {
    const loan = await borrowBook(req.user._id, parseId(req.body.bookId, 'bookId'));
    const full = await populated(Loan.findById(loan._id)).lean();
    res.status(201).json(presentLoan(full));
  })
);

// Member: my loans (+ summary of what is accruing right now).
router.get(
  '/mine',
  requireRole('member'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query;
    const now = new Date();
    const filter = { member: req.user._id, ...statusFilter(status, now) };
    const [loans, total, open] = await Promise.all([
      populated(Loan.find(filter).sort({ active: -1, dueDate: 1, _id: 1 }).skip((page - 1) * limit).limit(limit)).lean(),
      Loan.countDocuments(filter),
      Loan.find({ member: req.user._id, active: true }).lean(), // at most 3 (R3)
    ]);
    const openPresented = open.map((l) => presentLoan(l, now));
    res.json({
      data: loans.map((l) => presentLoan(l, now)),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      summary: {
        activeLoans: open.length,
        overdueLoans: openPresented.filter((l) => l.overdue).length,
        accruedFine: openPresented.reduce((s, l) => s + l.fine, 0),
      },
    });
  })
);

// Librarian: all loans.
router.get(
  '/',
  requireRole('librarian'),
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { status, page, limit, memberId } = req.query;
    const now = new Date();
    const filter = { ...statusFilter(status, now) };
    if (memberId) filter.member = parseId(memberId, 'memberId');
    const [loans, total] = await Promise.all([
      populated(Loan.find(filter).sort({ borrowedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit))
        .populate('member', 'name email')
        .lean(),
      Loan.countDocuments(filter),
    ]);
    res.json({
      data: loans.map((l) => presentLoan(l, now)),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  })
);

// Librarian: process a return (R7).
router.post(
  '/:id/return',
  requireRole('librarian'),
  validate(returnSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'loan id');
    const updated = await returnLoan(id, req.body.condition);
    const full = await populated(Loan.findById(updated._id)).populate('member', 'name email').lean();
    if (!full) throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan not found');
    res.json(presentLoan(full));
  })
);

module.exports = router;
