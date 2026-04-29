'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const expenseController = require('../controllers/expenseController');

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

router.use(requireAuth);
router.get('/', expenseController.getExpenses);
router.get('/new', expenseController.getNewExpense);
router.post('/', upload.single('receipt'), expenseController.createExpense);
router.get('/:id/edit', expenseController.getEditExpense);
router.put('/:id', upload.single('receipt'), expenseController.updateExpense);
router.delete('/:id', expenseController.deleteExpense);

module.exports = router;
