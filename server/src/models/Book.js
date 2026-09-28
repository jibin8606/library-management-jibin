const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema(
  {
    isbn: { type: String, required: true, unique: true, trim: true }, // R1 (normalised, no hyphens)
    title: { type: String, required: true, trim: true, maxlength: 200 },
    author: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    publishedYear: { type: Number },
  },
  { timestamps: true }
);

// Word search over title/author (scales to 50k+ books); title index for sorted paging.
bookSchema.index({ title: 'text', author: 'text' });
bookSchema.index({ title: 1, _id: 1 });

module.exports = mongoose.model('Book', bookSchema);
