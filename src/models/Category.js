'use strict';

const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // null = system default category
  },
  name: {
    type: String,
    required: [true, 'Tên danh mục là bắt buộc'],
    trim: true,
    maxlength: [100, 'Tên không được quá 100 ký tự'],
  },
  icon: { type: String, default: '💰' },
  color: { type: String, default: '#6366f1' },
  type: {
    type: String,
    enum: ['expense', 'income', 'both'],
    default: 'expense',
  },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

categorySchema.index({ user: 1, isActive: 1 });

// Virtual for expense count
categorySchema.virtual('expenseCount', {
  ref: 'Expense',
  localField: '_id',
  foreignField: 'category',
  count: true,
});

module.exports = mongoose.model('Category', categorySchema);
