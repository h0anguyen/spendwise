'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const reportController = require('../controllers/reportController');

router.use(requireAuth);
router.get('/monthly', reportController.getMonthlyReport);
router.get('/yearly', reportController.getYearlyReport);
router.get('/export', reportController.exportCSV);

module.exports = router;
