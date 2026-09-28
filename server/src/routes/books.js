const express = require('express');
const { z } = require('zod');
const { Book, Copy, Loan } = require('../models');
const { CONDITIONS } = require('../models/Copy');
const { AppError } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');
const { parseId } = require('../utils/ids');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const librarian = requireRole('librarian');

const normalizeIsbn = (s) => s.replace(/[\s-]/g, '').toUpperCase();
const ISBN_RE = /^(\d{9}[\dX]|\d{13})$/;

const isbnField = z
  .string()
  .transform(normalizeIsbn)
  .refine((v) => ISBN_RE.test(v), 'ISBN must be 10 or 13 characters (digits, last char of ISBN-10 may be X)');

const bookFields = {
  isbn: isbnField,
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  publishedYear: z.number().int().min(0).max(new Date().getFullYear() + 1).optional(),
};
const createBookSchema = z.object({ ...bookFields, initialCopies: z.number().int().min(0).max(100).default(0) });
const updateBookSchema = z
  .object(bookFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createCopySchema = z.object({
  copyCode: z.string().trim().min(1).max(64),
  condition: z.enum(CONDITIONS).default('good'),
});

// ---- helpers -------------------------------------------------------------
async function copyCountsFor(bookIds) {
  const rows = await Copy.aggregate([
    { $match: { book: { $in: bookIds } } },
    {
      $group: {
        _id: '$book',
        total: { $sum: 1 },
        available: {
          $sum: { $cond: [{ $and: [{ $eq: ['$condition', 'good'] }, { $eq: ['$onLoan', false] }] }, 1, 0] },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

const presentBook = (b, counts) => {
  const c = counts.get(String(b._id));
  return {
    id: b._id,
    isbn: b.isbn,
    title: b.title,
    author: b.author,
    description: b.description,
    publishedYear: b.publishedYear,
    totalCopies: c ? c.total : 0,
    availableCopies: c ? c.available : 0,
  };
};

// ---- routes --------------------------------------------------------------

// Search + paginate the catalogue (any logged-in user).
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { q, page, limit } = req.query;
    let filter = {};
    if (q) {
      // Looks like an ISBN -> exact indexed lookup; otherwise word search on the text index.
      filter = /^[\dXx-]{10,17}$/.test(q) ? { isbn: normalizeIsbn(q) } : { $text: { $search: q } };
    }
    const [books, total] = await Promise.all([
      Book.find(filter)
        .sort({ title: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Book.countDocuments(filter),
    ]);
    const counts = await copyCountsFor(books.map((b) => b._id));
    res.json({
      data: books.map((b) => presentBook(b, counts)),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const book = await Book.findById(parseId(req.params.id, 'book id')).lean();
    if (!book) throw new AppError(404, 'BOOK_NOT_FOUND', 'Book not found');
    res.json(presentBook(book, await copyCountsFor([book._id])));
  })
);

router.post(
  '/',
  librarian,
  validate(createBookSchema),
  asyncHandler(async (req, res) => {
    const { initialCopies, ...fields } = req.body;
    const book = await Book.create(fields); // duplicate ISBN -> 409 via error handler (R1)
    if (initialCopies > 0) {
      try {
        await Copy.insertMany(
          Array.from({ length: initialCopies }, (_, i) => ({ book: book._id, copyCode: `${book.isbn}-${i + 1}` }))
        );
      } catch (err) {
        await Copy.deleteMany({ book: book._id });
        await Book.deleteOne({ _id: book._id });
        throw err; // duplicate copy code -> 409
      }
    }
    res.status(201).json(presentBook(book.toObject(), await copyCountsFor([book._id])));
  })
);

router.patch(
  '/:id',
  librarian,
  validate(updateBookSchema),
  asyncHandler(async (req, res) => {
    const book = await Book.findByIdAndUpdate(parseId(req.params.id, 'book id'), { $set: req.body }, { new: true, runValidators: true }).lean();
    if (!book) throw new AppError(404, 'BOOK_NOT_FOUND', 'Book not found');
    res.json(presentBook(book, await copyCountsFor([book._id])));
  })
);

// R8 - a book that has ever been lent can never be deleted.
router.delete(
  '/:id',
  librarian,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'book id');
    const book = await Book.findById(id).select('_id').lean();
    if (!book) throw new AppError(404, 'BOOK_NOT_FOUND', 'Book not found');
    if (await Loan.exists({ book: id })) {
      throw new AppError(409, 'BOOK_HAS_LOAN_HISTORY', 'This book has been lent before and cannot be deleted');
    }
    await Book.deleteOne({ _id: id });
    await Copy.deleteMany({ book: id });
    res.status(204).end();
  })
);

// ---- copies of a book (librarian) -----------------------------------------
router.get(
  '/:id/copies',
  librarian,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'book id');
    if (!(await Book.exists({ _id: id }))) throw new AppError(404, 'BOOK_NOT_FOUND', 'Book not found');
    const copies = await Copy.find({ book: id }).sort({ copyCode: 1 }).lean();
    res.json({
      data: copies.map((c) => ({ id: c._id, copyCode: c.copyCode, condition: c.condition, onLoan: c.onLoan })),
    });
  })
);

router.post(
  '/:id/copies',
  librarian,
  validate(createCopySchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'book id');
    if (!(await Book.exists({ _id: id }))) throw new AppError(404, 'BOOK_NOT_FOUND', 'Book not found');
    const copy = await Copy.create({ book: id, ...req.body }); // duplicate copyCode -> 409 (R1)
    res.status(201).json({ id: copy._id, copyCode: copy.copyCode, condition: copy.condition, onLoan: copy.onLoan });
  })
);

module.exports = router;
