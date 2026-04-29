'use strict';

const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const Category = require('../models/Category');
const { asyncCatch } = require('../middleware/errorHandler');
const { decryptExpenseArray } = require('../utils/encryption');

exports.getDashboard = asyncCatch(async (req, res) => {
  const userId = req.user._id;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  // Run all queries in parallel
  const [
    monthlyExpenses,
    todayExpenses,
    recentExpenses,
    categoryBreakdown,
    dailyTrend,
    budgets,
  ] = await Promise.all([
    // Monthly total (income vs expense)
    Expense.aggregate([
      { $match: { user: userId, date: { $gte: startOfMonth, $lte: endOfMonth } } },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    // Today's total
    Expense.aggregate([
      { $match: { user: userId, date: { $gte: startOfDay, $lte: endOfDay } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]),
    // Recent 10 expenses
    Expense.find({ user: userId })
      .populate('category', 'name icon color')
      .sort({ date: -1 })
      .limit(10)
      .lean(),
    // Category breakdown this month
    Expense.getCategoryBreakdown(userId, startOfMonth, endOfMonth, 'expense'),
    // Daily trend this month
    Expense.getDailyTrend(userId, year, month),
    // Active budgets
    Budget.find({ user: userId, year, month, isActive: true }).populate('category', 'name icon color').lean(),
  ]);

  // Process stats
  const stats = {
    monthlyExpense: monthlyExpenses.find(e => e._id === 'expense')?.total || 0,
    monthlyIncome: monthlyExpenses.find(e => e._id === 'income')?.total || 0,
    todayExpense: todayExpenses.find(e => e._id === 'expense')?.total || 0,
    todayIncome: todayExpenses.find(e => e._id === 'income')?.total || 0,
  };
  stats.monthlyBalance = stats.monthlyIncome - stats.monthlyExpense;

  // Process daily trend data for chart
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyData = { expense: Array(daysInMonth).fill(0), income: Array(daysInMonth).fill(0) };
  dailyTrend.forEach(({ _id, total }) => {
    if (_id.day >= 1 && _id.day <= daysInMonth) {
      dailyData[_id.type][_id.day - 1] = total;
    }
  });

  // Budget progress
  const budgetProgress = await Promise.all(budgets.map(async (budget) => {
    const spent = await Expense.aggregate([
      {
        $match: {
          user: userId,
          type: 'expense',
          date: { $gte: startOfMonth, $lte: endOfMonth },
          ...(budget.category && { category: budget.category._id }),
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const spentAmount = spent[0]?.total || 0;
    const percentage = budget.amount > 0 ? Math.round((spentAmount / budget.amount) * 100) : 0;
    return { ...budget, spentAmount, percentage };
  }));

  // Decrypt recent expenses for display
  const decryptedRecent = decryptExpenseArray(recentExpenses, req.user);

  res.render('dashboard/index', {
    title: 'Dashboard',
    stats,
    recentExpenses: decryptedRecent,
    categoryBreakdown,
    dailyData,
    budgetProgress,
    currentMonth: month,
    currentYear: year,
  });
});
