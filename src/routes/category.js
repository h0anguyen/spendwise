'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const Category = require('../models/Category');
const { asyncCatch, AppError } = require('../middleware/errorHandler');

router.use(requireAuth);

router.get('/', asyncCatch(async (req, res) => {
  const categories = await Category.find({
    $or: [{ user: req.user._id }, { user: null }], isActive: true,
  }).sort('order').lean();
  res.render('categories/index', { title: 'Danh Mục', categories });
}));

router.post('/', asyncCatch(async (req, res) => {
  const { name, icon, color, type } = req.body;
  await Category.create({ user: req.user._id, name, icon, color, type });
  
  if (req.headers['hx-request']) {
    res.setHeader('HX-Location', '/categories');
    return res.status(200).send();
  }
  
  req.flash('success', 'Đã tạo danh mục mới!');
  res.redirect('/categories');
}));

router.put('/:id', asyncCatch(async (req, res) => {
  const { name, icon, color, type } = req.body;
  const cat = await Category.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { name, icon, color, type },
    { new: true }
  );
  if (!cat) throw new AppError('Không tìm thấy danh mục.', 404);

  if (req.headers['hx-request']) {
    res.setHeader('HX-Location', '/categories');
    return res.status(200).send();
  }

  req.flash('success', 'Đã cập nhật danh mục!');
  res.redirect('/categories');
}));

router.delete('/:id', asyncCatch(async (req, res) => {
  await Category.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { isActive: false });
  
  if (req.headers['hx-request']) {
    // Return 200 with empty body so HTMX swaps the element away
    return res.status(200).send('');
  }
  
  req.flash('success', 'Đã xóa danh mục!');
  res.redirect('/categories');
}));

module.exports = router;
