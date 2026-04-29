'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên là bắt buộc'],
    trim: true,
    maxlength: [100, 'Tên không được quá 100 ký tự'],
  },
  email: {
    type: String,
    required: [true, 'Email là bắt buộc'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ'],
  },
  password: {
    type: String,
    required: [true, 'Mật khẩu là bắt buộc'],
    minlength: [8, 'Mật khẩu phải ít nhất 8 ký tự'],
    select: false,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  isActive: { type: Boolean, default: true },
  avatar: { type: String, default: null },
  currency: { type: String, default: 'VND' },
  monthlyBudget: { type: Number, default: 0 },
  timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
  notificationsEnabled: { type: Boolean, default: true },
  lastLogin: { type: Date },
  passwordChangedAt: { type: Date },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  encryption: {
    enabled: { type: Boolean, default: false },
    fields: {
      title: { type: Boolean, default: true },
      note: { type: Boolean, default: true },
      amount: { type: Boolean, default: false },
    },
    salt: { type: String, default: null },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  this.password = await bcrypt.hash(this.password, rounds);
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

// Virtual for total expenses
userSchema.virtual('expenses', {
  ref: 'Expense',
  localField: '_id',
  foreignField: 'user',
  justOne: false,
});

module.exports = mongoose.model('User', userSchema);
