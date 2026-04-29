'use strict';

const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null, // null = overall budget
  },
  amount: {
    type: Number,
    required: [true, 'Số tiền ngân sách là bắt buộc'],
    min: [0, 'Ngân sách phải lớn hơn 0'],
  },
  period: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly',
  },
  month: { type: Number, min: 1, max: 12 },
  year: { type: Number },
  alertThreshold: { type: Number, default: 80, min: 1, max: 100 }, // % to trigger alert
  alertSent: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

budgetSchema.index({ user: 1, year: 1, month: 1 });
budgetSchema.index({ user: 1, category: 1, year: 1, month: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Budget', budgetSchema);
