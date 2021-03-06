const mongoose = require('mongoose');
const { validateQuery, validateAggregation, validateUpdateOne } = require('./preHooks/validate');

const BillSlipNumberSchema = mongoose.Schema({
  prefix: { type: String, required: true },
  seq: { type: Number, default: 1 },
  company: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true });

BillSlipNumberSchema.pre('find', validateQuery);
BillSlipNumberSchema.pre('aggregate', validateAggregation);
BillSlipNumberSchema.pre('updateOne', validateUpdateOne);

module.exports = mongoose.model('BillSlipNumber', BillSlipNumberSchema);
