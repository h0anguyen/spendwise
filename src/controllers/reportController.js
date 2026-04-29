'use strict';

const Expense = require('../models/Expense');
const { asyncCatch } = require('../middleware/errorHandler');
const { decryptExpenseArray } = require('../utils/encryption');

exports.getMonthlyReport = asyncCatch(async (req, res) => {
  const userId = req.user._id;
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const [summary, categoryBreakdown, dailyTrend, topExpenses, monthlyComparison] = await Promise.all([
    Expense.aggregate([
      { $match: { user: userId, date: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 }, avg: { $avg: '$amount' } } },
    ]),
    Expense.getCategoryBreakdown(userId, startDate, endDate, 'expense'),
    Expense.getDailyTrend(userId, year, month),
    Expense.find({ user: userId, type: 'expense', date: { $gte: startDate, $lte: endDate } })
      .populate('category', 'name icon color')
      .sort({ amount: -1 })
      .limit(5)
      .lean(),
    // Compare with last 6 months
    Expense.aggregate([
      {
        $match: {
          user: userId,
          date: { $gte: new Date(year, month - 7, 1), $lte: endDate },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  // Process data for charts
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyData = { expense: Array(daysInMonth).fill(0), income: Array(daysInMonth).fill(0) };
  dailyTrend.forEach(({ _id, total }) => {
    if (_id.day >= 1 && _id.day <= daysInMonth) {
      dailyData[_id.type][_id.day - 1] = total;
    }
  });

  // Process monthly comparison
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  const comparisonData = months.map(({ year: y, month: m }) => {
    const exp = monthlyComparison.find(e => e._id.year === y && e._id.month === m && e._id.type === 'expense');
    const inc = monthlyComparison.find(e => e._id.year === y && e._id.month === m && e._id.type === 'income');
    return { year: y, month: m, expense: exp?.total || 0, income: inc?.total || 0 };
  });

  const stats = {
    totalExpense: summary.find(s => s._id === 'expense')?.total || 0,
    totalIncome: summary.find(s => s._id === 'income')?.total || 0,
    expenseCount: summary.find(s => s._id === 'expense')?.count || 0,
    incomeCount: summary.find(s => s._id === 'income')?.count || 0,
    avgExpense: summary.find(s => s._id === 'expense')?.avg || 0,
  };
  stats.balance = stats.totalIncome - stats.totalExpense;
  stats.savingsRate = stats.totalIncome > 0 ? Math.round((stats.balance / stats.totalIncome) * 100) : 0;

  // Decrypt top expenses for display
  const decryptedTop = decryptExpenseArray(topExpenses, req.user);

  res.render('reports/monthly', {
    title: `Báo Cáo Tháng ${month}/${year}`,
    stats,
    categoryBreakdown,
    dailyData,
    topExpenses: decryptedTop,
    comparisonData,
    selectedYear: year,
    selectedMonth: month,
  });
});

exports.getYearlyReport = asyncCatch(async (req, res) => {
  const userId = req.user._id;
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);

  const [monthlyData, categoryBreakdown, yearSummary] = await Promise.all([
    Expense.aggregate([
      { $match: { user: userId, date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { month: { $month: '$date' }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]),
    Expense.getCategoryBreakdown(userId, startDate, endDate, 'expense'),
    Expense.aggregate([
      { $match: { user: userId, date: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => {
    const exp = monthlyData.find(d => d._id.month === i + 1 && d._id.type === 'expense');
    const inc = monthlyData.find(d => d._id.month === i + 1 && d._id.type === 'income');
    return { month: i + 1, expense: exp?.total || 0, income: inc?.total || 0 };
  });

  res.render('reports/yearly', {
    title: `Báo Cáo Năm ${year}`,
    months,
    categoryBreakdown,
    totalExpense: yearSummary.find(s => s._id === 'expense')?.total || 0,
    totalIncome: yearSummary.find(s => s._id === 'income')?.total || 0,
    selectedYear: year,
  });
});

// API: Export CSV
exports.exportCSV = asyncCatch(async (req, res) => {
  const userId = req.user._id;
  const { startDate, endDate, type } = req.query;

  const filter = { user: userId };
  if (type) filter.type = type;
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate + 'T23:59:59');
  }

  const expenses = await Expense.find(filter).populate('category', 'name').sort({ date: -1 }).lean();
  
  // Decrypt for CSV export
  const decryptedExpenses = decryptExpenseArray(expenses, req.user);

  const headers = ['Ngày,Tiêu đề,Số tiền,Loại,Danh mục,Ghi chú,Phương thức'];
  const rows = decryptedExpenses.map(e => [
    new Date(e.date).toLocaleDateString('vi-VN'),
    `"${e.title}"`,
    e.amount,
    e.type === 'expense' ? 'Chi tiêu' : 'Thu nhập',
    e.category?.name || '',
    `"${e.note || ''}"`,
    e.paymentMethod || '',
  ].join(','));

  const csv = [...headers, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=bao-cao-${Date.now()}.csv`);
  res.send('\uFEFF' + csv); // BOM for Excel UTF-8
});
