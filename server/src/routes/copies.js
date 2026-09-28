const express = require('express');
const { z } = require('zod');
const { Copy, Loan } = require('../models');
const { CONDITIONS } = require('../models/Copy');
const { AppError } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');
const { parseId } = require('../utils/ids');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('librarian'));

const updateSchema = z
  .object({ condition: z.enum(CONDITIONS), copyCode: z.string().trim().min(1).max(64) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide condition and/or copyCode');

const present = (c) => ({ id: c._id, book: c.book, copyCode: c.copyCode, condition: c.condition, onLoan: c.onLoan });

// A copy that is out on loan is changed only via the return flow.
router.patch(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'copy id');
    const updated = await Copy.findOneAndUpdate({ _id: id, onLoan: false }, { $set: req.body }, { new: true, runValidators: true }).lean();
    if (updated) return res.json(present(updated));
    if (await Copy.exists({ _id: id })) {
      throw new AppError(409, 'COPY_ON_LOAN', 'This copy is on loan. Process the return to update its condition.');
    }
    throw new AppError(404, 'COPY_NOT_FOUND', 'Copy not found');
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'copy id');
    const copy = await Copy.findById(id).select('_id').lean();
    if (!copy) throw new AppError(404, 'COPY_NOT_FOUND', 'Copy not found');
    if (await Loan.exists({ copy: id })) {
      throw new AppError(409, 'COPY_HAS_LOAN_HISTORY', 'This copy has been lent before and cannot be deleted');
    }
    await Copy.deleteOne({ _id: id });
    res.status(204).end();
  })
);

module.exports = router;
