'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../config/logger');

// Require login (session-based)
exports.requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  req.flash('error', 'Bạn cần đăng nhập để tiếp tục.');
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/login');
};

// Require admin role
exports.requireAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.role === 'admin') return next();
  res.status(403).render('error', { code: 403, message: 'Bạn không có quyền truy cập trang này.' });
};

// API JWT middleware
exports.requireApiAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token xác thực không hợp lệ.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Tài khoản không hợp lệ.' });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.warn('Invalid JWT token:', err.message);
    res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
};

// Optional auth (for mixed routes)
exports.optionalAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  next();
};

// Rate limiter for auth routes
const rateLimit = require('express-rate-limit');
exports.authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});

exports.apiRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
  standardHeaders: true,
  legacyHeaders: false,
});
