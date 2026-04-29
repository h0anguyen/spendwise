'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const Expense = require('../models/Expense');
const { asyncCatch } = require('../middleware/errorHandler');
const { generateSalt, encrypt, decrypt, isEncrypted } = require('../utils/encryption');

router.use(requireAuth);

router.get('/settings', (req, res) => {
  res.render('user/settings', { title: 'Cài Đặt Tài Khoản' });
});

router.put('/settings', asyncCatch(async (req, res) => {
  const { name, currency, monthlyBudget, timezone, notificationsEnabled } = req.body;
  await User.findByIdAndUpdate(req.user._id, {
    name, currency, monthlyBudget: parseFloat(monthlyBudget) || 0,
    timezone, notificationsEnabled: notificationsEnabled === 'on',
  });
  req.flash('success', 'Đã cập nhật cài đặt!');
  res.redirect('/user/settings');
}));

router.put('/change-password', asyncCatch(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (newPassword !== confirmPassword) {
    req.flash('error', 'Mật khẩu mới không khớp.');
    return res.redirect('/user/settings');
  }
  const user = await User.findById(req.user._id).select('+password');
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    req.flash('error', 'Mật khẩu hiện tại không đúng.');
    return res.redirect('/user/settings');
  }
  user.password = newPassword;
  await user.save();
  req.flash('success', 'Đã đổi mật khẩu thành công!');
  res.redirect('/user/settings');
}));

router.put('/encryption', asyncCatch(async (req, res) => {
  const { enabled, field_title, field_note, field_amount } = req.body;
  const user = await User.findById(req.user._id);
  
  const wasEnabled = user.encryption?.enabled || false;
  const isEnabled = enabled === 'on';
  const newFields = {
    title: field_title === 'on',
    note: field_note === 'on',
    amount: field_amount === 'on'
  };

  // If status changed or encryption is on, we might need to migrate data
  if (wasEnabled !== isEnabled || isEnabled) {
    // Generate salt if enabling for the first time
    if (isEnabled && !user.encryption?.salt) {
      user.encryption.salt = generateSalt();
    }
    
    const salt = user.encryption.salt;
    const expenses = await Expense.find({ user: user._id });
    
    // Batch update expenses
    const bulkOps = expenses.map(exp => {
      const update = {};
      
      // Handle Title
      if (isEnabled && newFields.title) {
        if (!isEncrypted(exp.title)) update.title = encrypt(exp.title, salt);
      } else if (isEncrypted(exp.title)) {
        update.title = decrypt(exp.title, salt);
      }

      // Handle Note
      if (exp.note) {
        if (isEnabled && newFields.note) {
          if (!isEncrypted(exp.note)) update.note = encrypt(exp.note, salt);
        } else if (isEncrypted(exp.note)) {
          update.note = decrypt(exp.note, salt);
        }
      }

      // Handle Amount
      if (isEnabled && newFields.amount) {
        if (!isEncrypted(exp.amount)) update.amount = encrypt(String(exp.amount), salt);
      } else if (isEncrypted(exp.amount)) {
        const decrypted = decrypt(exp.amount, salt);
        update.amount = parseFloat(decrypted) || 0;
      }

      if (Object.keys(update).length > 0) {
        return {
          updateOne: {
            filter: { _id: exp._id },
            update: { $set: update }
          }
        };
      }
      return null;
    }).filter(Boolean);

    if (bulkOps.length > 0) {
      await Expense.bulkWrite(bulkOps);
    }

    // Clear salt if disabling (optional, maybe keep it for safety?)
    // if (!isEnabled) user.encryption.salt = null;
  }

  user.encryption.enabled = isEnabled;
  user.encryption.fields = newFields;
  await user.save();

  req.flash('success', isEnabled ? 'Đã bật mã hóa dữ liệu và bảo mật giao dịch!' : 'Đã tắt mã hóa dữ liệu.');
  res.redirect('/user/settings');
}));

module.exports = router;
