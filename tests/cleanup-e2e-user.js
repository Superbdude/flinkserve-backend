/**
 * One-off cleanup: removes accounts created by the automated e2e signup test.
 * Usage: node tests/cleanup-e2e-user.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const sanitize = (v) => (v || '').trim().replace(/^["']|["']$/g, '');

(async () => {
  const uri = sanitize(process.env.MONGODB_URI);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const result = await User.deleteMany({ email: /^e2etest\d+@flinkserve\.test$/ });
  console.log(`🧹 Removed ${result.deletedCount} e2e test user(s) from "${mongoose.connection.name}"`);

  await mongoose.connection.close();
  process.exit(0);
})().catch((err) => {
  console.error('❌ Cleanup failed:', err.message);
  process.exit(1);
});
