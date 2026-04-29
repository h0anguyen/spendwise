'use strict';

const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const logger = require('./logger');

module.exports = (passport) => {
  passport.use(new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) return done(null, false, { message: 'Email hoặc mật khẩu không đúng.' });
        if (!user.isActive) return done(null, false, { message: 'Tài khoản đã bị vô hiệu hóa.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return done(null, false, { message: 'Email hoặc mật khẩu không đúng.' });

        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        logger.info(`User logged in: ${user.email}`);
        return done(null, user);
      } catch (err) {
        logger.error('Passport error:', err);
        return done(err);
      }
    }
  ));

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
