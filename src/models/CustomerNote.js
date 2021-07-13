const mongoose = require('mongoose');
const { validateQuery, validateUpdateOne } = require('./preHooks/validate');

const CustomerNoteSchema = mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, immutable: true, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, immutable: true, required: true },
}, { timestamps: true });

CustomerNoteSchema.virtual(
  'histories',
  {
    ref: 'CustomerNoteHistory',
    localField: '_id',
    foreignField: 'customerNote',
    options: { sort: { createdAt: -1 } },
  }
);

CustomerNoteSchema.pre('findOne', validateQuery);
CustomerNoteSchema.pre('updateOne', validateUpdateOne);

module.exports = mongoose.model('CustomerNote', CustomerNoteSchema);
