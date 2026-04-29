'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const Budget = require('../models/Budget');
const Category = require('../models/Category');
const { asyncCatch, AppError } = require('../middleware/errorHandler');

router.use(requireAuth);

router.get('/', asyncCatch(async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);

  const [budgets, categories] = await Promise.all([
    Budget.find({ user: req.user._id, year, month }).populate('category', 'name icon color').lean(),
    Category.find({ $or: [{ user: req.user._id }, { user: null }], isActive: true, type: { $in: ['expense', 'both'] } }).sort('order').lean(),
  ]);

  res.render('budgets/index', { title: 'Ngân Sách', budgets, categories, selectedYear: year, selectedMonth: month });
}));

router.post('/', asyncCatch(async (req, res) => {
  const { category, amount, alertThreshold, period } = req.body;
  const now = new Date();
  await Budget.findOneAndUpdate(
    { user: req.user._id, category: category || null, year: now.getFullYear(), month: now.getMonth() + 1 },
    { amount: parseFloat(amount), alertThreshold: parseInt(alertThreshold) || 80, period, isActive: true, alertSent: false },
    { upsert: true, new: true, runValidators: true }
  );
  req.flash('success', 'Đã lưu ngân sách!');
  res.redirect('/budgets');
}));

router.delete('/:id', asyncCatch(async (req, res) => {
  await Budget.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  req.flash('success', 'Đã xóa ngân sách!');
  res.redirect('/budgets');
}));

module.exports = router;
