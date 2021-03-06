const flat = require('flat');
const Boom = require('@hapi/boom');
const moment = require('moment');
const path = require('path');
const os = require('os');
const Customer = require('../models/Customer');
const Drive = require('../models/Google/Drive');
const ESign = require('../models/ESign');
const ESignHelper = require('./eSign');
const GDriveStorageHelper = require('./gDriveStorage');
const FileHelper = require('./file');
const translate = require('./translate');

const { language } = translate;

exports.getMandates = async customerId => Customer.findOne(
  { _id: customerId, 'payment.mandates': { $exists: true } },
  { identity: 1, 'payment.mandates': 1 },
  { autopopulate: false }
).lean();

exports.updateMandate = async (customerId, mandateId, payload) => Customer.findOneAndUpdate(
  { _id: customerId, 'payment.mandates._id': mandateId },
  { $set: flat({ 'payment.mandates.$': { ...payload } }) },
  { new: true, select: { identity: 1, 'payment.mandates': 1 }, autopopulate: false }
).lean();

exports.getSignatureRequest = async (customerId, mandateId, payload) => {
  const customer = await Customer
    .findOne({ _id: customerId, 'payment.mandates._id': mandateId }, { payment: 1 })
    .lean();

  const mandate = customer.payment.mandates.find(m => m._id.toHexString() === mandateId);
  const doc = await ESignHelper.generateSignatureRequest({
    templateId: payload.fileId,
    fields: payload.fields,
    title: `MANDAT SEPA ${mandate.rum}`,
    signers: [{ id: '1', name: payload.customer.name, email: payload.customer.email }],
    redirect: payload.redirect,
    redirectDecline: payload.redirectDecline,
  });
  if (doc.data.error) throw Boom.badRequest(`Eversign: ${doc.data.error.type}`);

  await Customer.updateOne(
    { _id: customerId, 'payment.mandates._id': mandateId },
    { $set: flat({ 'payment.mandates.$.everSignId': doc.data.document_hash }) }
  );

  return { embeddedUrl: doc.data.signers[0].embedded_signing_url };
};

exports.saveSignedMandate = async (customerId, mandateId) => {
  const customer = await Customer.findOne({ _id: customerId }).lean();
  const mandate = customer.payment.mandates.find(doc => doc._id.toHexString() === mandateId);

  const everSignDoc = await ESign.getDocument(mandate.everSignId);
  if (everSignDoc.data.error) throw Boom.notFound(translate[language].documentNotFound);
  if (!everSignDoc.data.log.some(type => type.event === 'document_signed')) throw Boom.serverUnavailable();

  const finalPdf = await ESign.downloadFinalDocument(mandate.everSignId);
  const tmpPath = path.join(os.tmpdir(), `signedDoc-${moment().format('DDMMYYYY-HHmm')}.pdf`);
  const file = await FileHelper.createAndReadFile(finalPdf.data, tmpPath);
  const uploadedFile = await GDriveStorageHelper.addFile({
    driveFolderId: customer.driveFolder.driveId,
    name: mandate.rum,
    type: 'application/pdf',
    body: file,
  });

  const driveFileInfo = await Drive.getFileById({ fileId: uploadedFile.id });
  const drive = { driveId: uploadedFile.id, link: driveFileInfo.webViewLink };

  await Customer.findOneAndUpdate(
    { _id: customerId, 'payment.mandates._id': mandateId },
    { $set: flat({ 'payment.mandates.$': { drive, signedAt: moment().toDate() } }) }
  ).lean();
};
