'use strict';

const logger = require('../config/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const notFound = (req, res, next) => {
  const err = new AppError(`Không tìm thấy trang: ${req.originalUrl}`, 404);
  next(err);
};

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;

  logger.error(`[${err.statusCode}] ${err.message}`, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // API errors → JSON
  if (req.path.startsWith('/api/')) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Web errors → render page
  if (err.statusCode === 401 && !req.isAuthenticated()) {
    req.flash('error', err.message);
    return res.redirect('/auth/login');
  }

  res.status(err.statusCode).render('error', {
    title: `Lỗi ${err.statusCode}`,
    code: err.statusCode,
    message: err.isOperational ? err.message : 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại sau.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

const asyncCatch = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { AppError, notFound, globalErrorHandler, asyncCatch };
