'use strict';

const socketIO = require('socket.io');
const logger = require('../config/logger');

let io;

const initSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.APP_URL,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Join user-specific room for private events
    socket.on('join:user', (userId) => {
      socket.join(`user:${userId}`);
      logger.info(`Socket ${socket.id} joined room user:${userId}`);
    });

    // Real-time expense stats refresh request
    socket.on('request:stats', (data) => {
      socket.emit('stats:refreshing', { timestamp: new Date() });
    });

    // Disconnect
    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} - ${reason}`);
    });

    // Error handling
    socket.on('error', (err) => {
      logger.error(`Socket error [${socket.id}]:`, err);
    });
  });

  logger.info('✅ Socket.IO initialized');
  return io;
};

const getIO = () => io;

module.exports = { initSocket, getIO };
