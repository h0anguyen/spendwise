'use strict';

const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: [true, 'Tiêu đề là bắt buộc'],
    trim: true,
    maxlength: [200, 'Tiêu đề không được quá 200 ký tự'],
  },
  amount: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Số tiền là bắt buộc'],
  },
  type: {
    type: String,
    enum: ['expense', 'income'],
    default: 'expense',
    index: true,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Danh mục là bắt buộc'],
  },
  date: {
    type: Date,
    required: [true, 'Ngày là bắt buộc'],
    index: true,
  },
  note: {
    type: String,
    trim: true,
    maxlength: [500, 'Ghi chú không được quá 500 ký tự'],
  },
  tags: [{ type: String, trim: true, lowercase: true }],
  receipt: { type: String, default: null },
  isRecurring: { type: Boolean, default: false },
  recurringFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', null],
    default: null,
  },
  recurringEndDate: { type: Date, default: null },
  location: {
    name: String,
    lat: Number,
    lng: Number,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'transfer', 'ewallet', 'other'],
    default: 'cash',
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Compound indexes for efficient queries
expenseSchema.index({ user: 1, date: -1 });
expenseSchema.index({ user: 1, type: 1, date: -1 });
expenseSchema.index({ user: 1, category: 1, date: -1 });

// Virtual for formatted date
expenseSchema.virtual('dateFormatted').get(function () {
  return this.date ? this.date.toLocaleDateString('vi-VN') : '';
});

// Static: get monthly summary
expenseSchema.statics.getMonthlySummary = async function (userId, year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  return this.aggregate([
    { $match: { user: userId, date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        avg: { $avg: '$amount' },
      },
    },
  ]);
};

// Static: get category breakdown
expenseSchema.statics.getCategoryBreakdown = async function (userId, startDate, endDate, type = 'expense') {
  return this.aggregate([
    {
      $match: {
        user: userId,
        type,
        date: { $gte: new Date(startDate), $lte: new Date(endDate) },
      },
    },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'categoryInfo',
      },
    },
    { $unwind: '$categoryInfo' },
    { $sort: { total: -1 } },
  ]);
};

// Static: get daily trend
expenseSchema.statics.getDailyTrend = async function (userId, year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  return this.aggregate([
    { $match: { user: userId, date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: {
          day: { $dayOfMonth: '$date' },
          type: '$type',
        },
        total: { $sum: '$amount' },
      },
    },
    { $sort: { '_id.day': 1 } },
  ]);
};

module.exports = mongoose.model('Expense', expenseSchema);
