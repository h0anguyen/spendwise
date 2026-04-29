// ─── src/routes/auth.js ──────────────────────────────────────────────────────
'use strict';
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authRateLimiter } = require('../middleware/auth');

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
  body('password').notEmpty().withMessage('Mật khẩu là bắt buộc'),
];
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Tên là bắt buộc').isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
  body('password').isLength({ min: 8 }).withMessage('Mật khẩu phải ít nhất 8 ký tự'),
];

router.get('/login', authController.getLogin);
router.post('/login', authRateLimiter, loginValidation, authController.postLogin);
router.get('/register', authController.getRegister);
router.post('/register', authRateLimiter, registerValidation, authController.postRegister);
router.get('/logout', authController.logout);

module.exports = router;
