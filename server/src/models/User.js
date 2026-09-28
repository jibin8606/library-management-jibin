const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['member', 'librarian'], required: true, default: 'member' },
    // Number of books currently on loan. Updated atomically ($inc with a guard)
    // and used to enforce R3 under concurrency.
    activeLoans: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function () {
  return { id: this._id, name: this.name, email: this.email, role: this.role };
};

module.exports = mongoose.model('User', userSchema);
