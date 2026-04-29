'use strict';
const express = require('express');
const router = express.Router();
const { requireApiAuth, requireAuth, apiRateLimiter } = require('../middleware/auth');
const Expense = require('../models/Expense');
const Category = require('../models/Category');
const { asyncCatch } = require('../middleware/errorHandler');
const { encryptExpenseFields, decryptExpenseArray, decryptExpenseFields } = require('../utils/encryption');
const authController = require('../controllers/authController');

router.use(apiRateLimiter);

// Token endpoint
router.post('/auth/token', authController.generateToken);

// All subsequent API routes require auth (session or JWT)
const apiAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  return requireApiAuth(req, res, next);
};
router.use(apiAuth);

// Quick stats for dashboard
router.get('/stats/quick', asyncCatch(async (req, res) => {
  const userId = req.user._id;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const stats = await Expense.aggregate([
    { $match: { user: userId, date: { $gte: startOfMonth, $lte: endOfMonth } } },
    { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  res.json({
    success: true,
    data: {
      monthlyExpense: stats.find(s => s._id === 'expense')?.total || 0,
      monthlyIncome: stats.find(s => s._id === 'income')?.total || 0,
      expenseCount: stats.find(s => s._id === 'expense')?.count || 0,
    },
  });
}));

// Get expenses (paginated JSON)
router.get('/expenses', asyncCatch(async (req, res) => {
  const { page = 1, limit = 20, type, startDate, endDate } = req.query;
  const filter = { user: req.user._id };
  if (type) filter.type = type;
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate + 'T23:59:59');
  }

  const [expenses, total] = await Promise.all([
    Expense.find(filter).populate('category', 'name icon color')
      .sort({ date: -1 }).skip((page - 1) * limit).limit(parseInt(limit)).lean(),
    Expense.countDocuments(filter),
  ]);

  // Decrypt for API response
  const decryptedExpenses = decryptExpenseArray(expenses, req.user);

  res.json({ success: true, data: decryptedExpenses, meta: { page: parseInt(page), limit: parseInt(limit), total } });
}));

// Quick add expense (for future mobile)
router.post('/expenses', asyncCatch(async (req, res) => {
  const { title, amount, type, category, date, note, paymentMethod } = req.body;
  
  let expenseData = {
    user: req.user._id, title, amount: parseFloat(amount),
    type: type || 'expense', category, date: date ? new Date(date) : new Date(),
    note, paymentMethod: paymentMethod || 'cash',
  };

  // Encrypt fields if enabled
  expenseData = encryptExpenseFields(expenseData, req.user);

  const expense = await Expense.create(expenseData);
  await expense.populate('category', 'name icon color');
  
  // Decrypt for API response
  const decrypted = decryptExpenseFields(expense.toObject(), req.user);
  res.status(201).json({ success: true, data: decrypted });
}));

// Categories
router.get('/categories', asyncCatch(async (req, res) => {
  const categories = await Category.find({
    $or: [{ user: req.user._id }, { user: null }], isActive: true,
  }).sort('order').lean();
  res.json({ success: true, data: categories });
}));

// Monthly summary
router.get('/reports/monthly', asyncCatch(async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);
  const summary = await Expense.getMonthlySummary(req.user._id, year, month);
  res.json({ success: true, data: summary, meta: { year, month } });
}));

module.exports = router;
