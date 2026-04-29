'use strict';

const Expense = require('../models/Expense');
const Category = require('../models/Category');
const Budget = require('../models/Budget');
const { asyncCatch, AppError } = require('../middleware/errorHandler');
const { getIO } = require('../socket');
const { encryptExpenseFields, decryptExpenseFields, decryptExpenseArray } = require('../utils/encryption');

// GET /expenses
exports.getExpenses = asyncCatch(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20, type, category, startDate, endDate, search, sort = '-date' } = req.query;

  const filter = { user: userId };
  if (type) filter.type = type;
  if (category) filter.category = category;
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate + 'T23:59:59');
  }
  if (search) filter.title = { $regex: search, $options: 'i' };

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [expenses, total, categories] = await Promise.all([
    Expense.find(filter).populate('category', 'name icon color').sort(sort).skip(skip).limit(parseInt(limit)).lean(),
    Expense.countDocuments(filter),
    Category.find({ $or: [{ user: userId }, { user: null }], isActive: true }).sort('order').lean(),
  ]);

  const totalPages = Math.ceil(total / parseInt(limit));

  // Decrypt expense fields if encryption is enabled
  const decryptedExpenses = decryptExpenseArray(expenses, req.user);

  res.render('expenses/index', {
    title: 'Chi Tiêu',
    expenses: decryptedExpenses,
    categories,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages },
    filters: { type, category, startDate, endDate, search },
  });
});

// GET /expenses/new
exports.getNewExpense = asyncCatch(async (req, res) => {
  const categories = await Category.find({
    $or: [{ user: req.user._id }, { user: null }],
    isActive: true,
  }).sort('order').lean();
  res.render('expenses/new', { title: 'Thêm Chi Tiêu', categories });
});

// POST /expenses
exports.createExpense = asyncCatch(async (req, res) => {
  const { title, amount, type, category, date, note, tags, paymentMethod, isRecurring, recurringFrequency, recurringEndDate } = req.body;

  // Prepare data
  let expenseData = {
    user: req.user._id,
    title,
    amount: parseFloat(amount),
    type: type || 'expense',
    category,
    date: new Date(date),
    note,
    tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    paymentMethod: paymentMethod || 'cash',
    isRecurring: isRecurring === 'on',
    recurringFrequency: isRecurring === 'on' ? recurringFrequency : null,
    recurringEndDate: recurringEndDate ? new Date(recurringEndDate) : null,
    receipt: req.file ? `/uploads/${req.file.filename}` : null,
  };

  // Encrypt fields if encryption is enabled
  expenseData = encryptExpenseFields(expenseData, req.user);

  const expense = await Expense.create(expenseData);
  await expense.populate('category', 'name icon color');

  // Emit real-time update via socket (with decrypted data for display)
  const io = getIO();
  if (io) {
    const expenseObj = decryptExpenseFields(expense.toObject(), req.user);
    io.to(`user:${req.user._id}`).emit('expense:created', {
      expense: expenseObj,
      userId: req.user._id,
    });
  }

  // Check budget alerts (use original amount for budget calculation)
  await checkBudgetAlert(req.user._id, { ...expense.toObject(), amount: parseFloat(amount), type: type || 'expense', date: new Date(date) });

  if (req.headers['content-type']?.includes('application/json')) {
    const decrypted = decryptExpenseFields(expense.toObject(), req.user);
    return res.json({ success: true, expense: decrypted });
  }

  req.flash('success', 'Đã thêm giao dịch thành công!');
  res.redirect('/expenses');
});

// GET /expenses/:id/edit
exports.getEditExpense = asyncCatch(async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.id, user: req.user._id });
  if (!expense) throw new AppError('Không tìm thấy giao dịch.', 404);

  const categories = await Category.find({
    $or: [{ user: req.user._id }, { user: null }],
    isActive: true,
  }).sort('order').lean();

  // Decrypt for edit form
  const decryptedExpense = decryptExpenseFields(expense.toObject(), req.user);

  res.render('expenses/edit', { title: 'Sửa Chi Tiêu', expense: decryptedExpense, categories });
});

// PUT /expenses/:id
exports.updateExpense = asyncCatch(async (req, res) => {
  const { title, amount, type, category, date, note, tags, paymentMethod } = req.body;

  // Prepare update data with encryption
  let updateData = {
    title, amount: parseFloat(amount), type, category,
    date: new Date(date), note, paymentMethod,
    tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
  };

  // Encrypt fields if encryption is enabled
  updateData = encryptExpenseFields(updateData, req.user);

  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    updateData,
    { new: true, runValidators: true }
  ).populate('category', 'name icon color');

  if (!expense) throw new AppError('Không tìm thấy giao dịch.', 404);

  const io = getIO();
  if (io) {
    const decrypted = decryptExpenseFields(expense.toObject(), req.user);
    io.to(`user:${req.user._id}`).emit('expense:updated', { expense: decrypted });
  }

  if (req.headers['content-type']?.includes('application/json')) {
    const decrypted = decryptExpenseFields(expense.toObject(), req.user);
    return res.json({ success: true, expense: decrypted });
  }

  req.flash('success', 'Đã cập nhật giao dịch!');
  res.redirect('/expenses');
});

// DELETE /expenses/:id
exports.deleteExpense = asyncCatch(async (req, res) => {
  const expense = await Expense.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!expense) throw new AppError('Không tìm thấy giao dịch.', 404);

  const io = getIO();
  if (io) io.to(`user:${req.user._id}`).emit('expense:deleted', { id: req.params.id });

  if (req.headers['x-requested-with'] === 'XMLHttpRequest' && !req.headers['hx-request']) {
    return res.json({ success: true });
  }

  req.flash('success', 'Đã xóa giao dịch!');
  res.redirect('/expenses');
});

// Helper: Check budget and send alert
async function checkBudgetAlert(userId, expense) {
  if (expense.type !== 'expense') return;
  const now = expense.date || new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  const budgets = await Budget.find({ user: userId, year, month, isActive: true, alertSent: false });

  for (const budget of budgets) {
    const matchFilter = {
      user: userId, type: 'expense',
      date: { $gte: startOfMonth, $lte: endOfMonth },
      ...(budget.category && { category: budget.category }),
    };

    const spent = await Expense.aggregate([
      { $match: matchFilter },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const spentAmount = spent[0]?.total || 0;
    const percentage = budget.amount > 0 ? (spentAmount / budget.amount) * 100 : 0;

    if (percentage >= budget.alertThreshold) {
      const io = getIO();
      if (io) {
        io.to(`user:${userId}`).emit('budget:alert', {
          budget: budget.toObject(),
          spentAmount,
          percentage: Math.round(percentage),
        });
      }
      await Budget.findByIdAndUpdate(budget._id, { alertSent: true });
    }
  }
}
