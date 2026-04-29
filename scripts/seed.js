'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const User = require('../src/models/User');
  const Category = require('../src/models/Category');
  const Expense = require('../src/models/Expense');

  // Demo user
  let user = await User.findOne({ email: 'demo@spendwise.vn' });
  if (!user) {
    user = await User.create({ name: 'Người Dùng Demo', email: 'demo@spendwise.vn', password: 'password123', role: 'user' });
    console.log('✅ Demo user created: demo@spendwise.vn / password123');
  }

  // Default categories
  const catCount = await Category.countDocuments({ user: user._id });
  if (catCount === 0) {
    const cats = [
      { name: 'Ăn uống', icon: '🍜', color: '#f97316', type: 'expense', order: 0 },
      { name: 'Di chuyển', icon: '🚗', color: '#3b82f6', type: 'expense', order: 1 },
      { name: 'Mua sắm', icon: '🛍️', color: '#ec4899', type: 'expense', order: 2 },
      { name: 'Hóa đơn', icon: '💡', color: '#f59e0b', type: 'expense', order: 3 },
      { name: 'Giải trí', icon: '🎮', color: '#8b5cf6', type: 'expense', order: 4 },
      { name: 'Sức khỏe', icon: '💊', color: '#10b981', type: 'expense', order: 5 },
      { name: 'Lương', icon: '💼', color: '#22c55e', type: 'income', order: 6 },
      { name: 'Thưởng', icon: '🎁', color: '#a855f7', type: 'income', order: 7 },
      { name: 'Khác', icon: '📌', color: '#6b7280', type: 'both', order: 8 },
    ];
    const created = await Category.insertMany(cats.map(c => ({ ...c, user: user._id })));
    console.log('✅ Categories created');

    // Sample expenses for current month
    const now = new Date();
    const foodCat = created[0]._id;
    const transCat = created[1]._id;
    const salaryCat = created[6]._id;

    const expenses = [
      { user: user._id, title: 'Lương tháng này', amount: 15000000, type: 'income', category: salaryCat, date: new Date(now.getFullYear(), now.getMonth(), 1), paymentMethod: 'transfer' },
      { user: user._id, title: 'Cơm trưa', amount: 45000, type: 'expense', category: foodCat, date: new Date(now.getFullYear(), now.getMonth(), 2), paymentMethod: 'cash' },
      { user: user._id, title: 'Grab đi làm', amount: 35000, type: 'expense', category: transCat, date: new Date(now.getFullYear(), now.getMonth(), 3), paymentMethod: 'ewallet' },
      { user: user._id, title: 'Ăn sáng', amount: 25000, type: 'expense', category: foodCat, date: new Date(now.getFullYear(), now.getMonth(), 4), paymentMethod: 'cash' },
    ];
    await Expense.insertMany(expenses);
    console.log('✅ Sample expenses created');
  }

  await mongoose.disconnect();
  console.log('🎉 Seed completed!');
}

seed().catch(console.error);
