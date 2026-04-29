'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

async function checkEncryption() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  
  const Expense = mongoose.model('Expense', new mongoose.Schema({}, { strict: false }));
  
  const latest = await Expense.findOne({}).sort({ createdAt: -1 }).lean();
  console.log('Latest Expense Raw Data:');
  console.log(JSON.stringify(latest, null, 2));
  
  await mongoose.disconnect();
}

checkEncryption().catch(console.error);
