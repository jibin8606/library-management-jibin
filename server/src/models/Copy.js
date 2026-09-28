const mongoose = require('mongoose');

const CONDITIONS = ['good', 'damaged', 'lost'];

const copySchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    copyCode: { type: String, required: true, unique: true, trim: true }, // R1
    condition: { type: String, enum: CONDITIONS, default: 'good', required: true },
    // Claimed atomically at borrow time (findOneAndUpdate) - this is what makes R6 safe.
    onLoan: { type: Boolean, default: false, required: true },
  },
  { timestamps: true }
);

// Fast "find an available copy of book X".
copySchema.index({ book: 1, condition: 1, onLoan: 1 });

module.exports = mongoose.model('Copy', copySchema);
module.exports.CONDITIONS = CONDITIONS;
