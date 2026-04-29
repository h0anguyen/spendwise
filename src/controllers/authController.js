'use strict';

const passport = require('passport');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Category = require('../models/Category');
const logger = require('../config/logger');
const { asyncCatch } = require('../middleware/errorHandler');

// GET /auth/login
exports.getLogin = (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Đăng Nhập' });
};

// POST /auth/login
exports.postLogin = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array()[0].msg);
    return res.redirect('/auth/login');
  }

  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash('error', info.message || 'Đăng nhập thất bại.');
      return res.redirect('/auth/login');
    }

    req.logIn(user, (err) => {
      if (err) return next(err);
      const returnTo = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;
      res.redirect(returnTo);
    });
  })(req, res, next);
};

// GET /auth/register
exports.getRegister = (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('auth/register', { title: 'Đăng Ký' });
};

// POST /auth/register
exports.postRegister = asyncCatch(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array()[0].msg);
    return res.redirect('/auth/register');
  }

  const { name, email, password } = req.body;

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    req.flash('error', 'Email này đã được đăng ký.');
    return res.redirect('/auth/register');
  }

  const user = await User.create({ name, email, password });

  // Create default categories for new user
  await createDefaultCategories(user._id);

  req.logIn(user, (err) => {
    if (err) throw err;
    req.flash('success', `Chào mừng ${user.name}! Tài khoản đã được tạo thành công.`);
    res.redirect('/dashboard');
  });
});

// GET /auth/logout
exports.logout = (req, res) => {
  req.logout((err) => {
    if (err) logger.error('Logout error:', err);
    req.session.destroy();
    res.redirect('/auth/login');
  });
};

// POST /api/v1/auth/token - generate JWT for API
exports.generateToken = asyncCatch(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ success: false, message: 'Thông tin đăng nhập không hợp lệ.' });
  }

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  res.json({ success: true, token, user: user.toSafeObject() });
});

// Helper: create default categories
async function createDefaultCategories(userId) {
  const defaults = [
    { name: 'Ăn uống', icon: '🍜', color: '#f97316', type: 'expense' },
    { name: 'Di chuyển', icon: '🚗', color: '#3b82f6', type: 'expense' },
    { name: 'Mua sắm', icon: '🛍️', color: '#ec4899', type: 'expense' },
    { name: 'Hóa đơn', icon: '💡', color: '#f59e0b', type: 'expense' },
    { name: 'Giải trí', icon: '🎮', color: '#8b5cf6', type: 'expense' },
    { name: 'Sức khỏe', icon: '💊', color: '#10b981', type: 'expense' },
    { name: 'Giáo dục', icon: '📚', color: '#06b6d4', type: 'expense' },
    { name: 'Khác', icon: '📌', color: '#6b7280', type: 'both' },
    { name: 'Lương', icon: '💼', color: '#22c55e', type: 'income' },
    { name: 'Thưởng', icon: '🎁', color: '#a855f7', type: 'income' },
    { name: 'Đầu tư', icon: '📈', color: '#14b8a6', type: 'income' },
    { name: 'Khác (Thu nhập)', icon: '💵', color: '#84cc16', type: 'income' },
  ];

  const categories = defaults.map((cat, i) => ({ ...cat, user: userId, order: i }));
  await Category.insertMany(categories, { ordered: false });
}
