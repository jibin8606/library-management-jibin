const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    copy: { type: mongoose.Schema.Types.ObjectId, ref: 'Copy', required: true },
    borrowedAt: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    // `active` === (returnedAt is null). Kept as a boolean because partial
    // unique indexes can't filter on null but can filter on `active: true`.
    active: { type: Boolean, default: true, required: true },
    returnedAt: { type: Date, default: null },
    fine: { type: Number, default: 0, min: 0 },
    returnCondition: { type: String, enum: ['good', 'damaged', 'lost'] },
  },
  { timestamps: true }
);

// R5: a member can have only one ACTIVE loan per book (DB-level guarantee).
loanSchema.index({ member: 1, book: 1 }, { unique: true, partialFilterExpression: { active: true } });
// Safety net: one copy can only be on one active loan.
loanSchema.index({ copy: 1 }, { unique: true, partialFilterExpression: { active: true } });
loanSchema.index({ member: 1, active: 1, dueDate: 1 });
loanSchema.index({ active: 1, dueDate: 1 });
loanSchema.index({ book: 1, borrowedAt: -1 });
loanSchema.index({ borrowedAt: -1 });

module.exports = mongoose.model('Loan', loanSchema);
