'use strict';

const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
    });

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
    mongoose.connection.on('error', (err) => logger.error('MongoDB error:', err));
  } catch (err) {
    logger.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

const disconnectDB = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
};

module.exports = { connectDB, disconnectDB };
