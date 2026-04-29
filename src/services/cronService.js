'use strict';

const cron = require('node-cron');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const User = require('../models/User');
const logger = require('../config/logger');

const setupCronJobs = () => {
  // 1. Daily: Process recurring expenses at midnight
  cron.schedule('0 0 * * *', async () => {
    logger.info('[CRON] Processing recurring expenses...');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const recurringExpenses = await Expense.find({
        isRecurring: true,
        recurringFrequency: { $ne: null },
        $or: [{ recurringEndDate: null }, { recurringEndDate: { $gte: today } }],
      });

      let processed = 0;
      for (const expense of recurringExpenses) {
        const shouldProcess = checkRecurringDue(expense, today);
        if (shouldProcess) {
          await Expense.create({
            user: expense.user,
            title: expense.title,
            amount: expense.amount,
            type: expense.type,
            category: expense.category,
            date: today,
            note: expense.note,
            paymentMethod: expense.paymentMethod,
            tags: expense.tags,
            isRecurring: false, // New instance is not recurring itself
          });
          processed++;
        }
      }
      logger.info(`[CRON] Recurring expenses: ${processed} created`);
    } catch (err) {
      logger.error('[CRON] Recurring expense error:', err);
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  // 2. Daily: Reset budget alerts at start of month
  cron.schedule('0 1 1 * *', async () => {
    logger.info('[CRON] Resetting monthly budget alerts...');
    try {
      const now = new Date();
      await Budget.updateMany(
        { year: now.getFullYear(), month: now.getMonth() + 1 },
        { alertSent: false }
      );
      logger.info('[CRON] Budget alerts reset');
    } catch (err) {
      logger.error('[CRON] Budget reset error:', err);
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  // 3. Weekly: Log summary stats (Mondays at 8am)
  cron.schedule('0 8 * * 1', async () => {
    logger.info('[CRON] Weekly summary...');
    try {
      const userCount = await User.countDocuments({ isActive: true });
      const expenseCount = await Expense.countDocuments();
      logger.info(`[CRON] Stats - Users: ${userCount}, Expenses: ${expenseCount}`);
    } catch (err) {
      logger.error('[CRON] Weekly summary error:', err);
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  logger.info('✅ Cron jobs initialized');
};

function checkRecurringDue(expense, today) {
  const lastDate = new Date(expense.date);
  const { recurringFrequency } = expense;
  if (recurringFrequency === 'daily') return true;
  if (recurringFrequency === 'weekly') return lastDate.getDay() === today.getDay();
  if (recurringFrequency === 'monthly') return lastDate.getDate() === today.getDate();
  if (recurringFrequency === 'yearly') {
    return lastDate.getDate() === today.getDate() && lastDate.getMonth() === today.getMonth();
  }
  return false;
}

module.exports = { setupCronJobs };
