const mongoose = require('mongoose');
const { validateQuery, validateAggregation } = require('./preHooks/validate');

const HelperSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  referent: { type: Boolean, required: true },
}, { timestamps: true });

HelperSchema.pre('find', validateQuery);
HelperSchema.pre('aggregate', validateAggregation);

module.exports = mongoose.model('Helper', HelperSchema);
