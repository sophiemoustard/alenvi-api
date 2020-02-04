const mongoose = require('mongoose');

const { validateQuery, validatePayload, validateAggregation } = require('./preHooks/validate');
const driveResourceSchemaDefinition = require('./schemaDefinitions/driveResource');

const AdministrativeDocumentSchema = mongoose.Schema({
  name: { type: String, required: true },
  file: driveResourceSchemaDefinition,
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
}, { timestamps: true });

AdministrativeDocumentSchema.pre('find', validateQuery);
AdministrativeDocumentSchema.pre('validate', validatePayload);
AdministrativeDocumentSchema.pre('aggregate', validateAggregation);

module.exports = mongoose.model('AdministrativeDocument', AdministrativeDocumentSchema);
