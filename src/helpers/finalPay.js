const get = require('lodash/get');
const FinalPay = require('../models/FinalPay');
const { formatPay } = require('./pay');

exports.createFinalPayList = async (finalPayToCreate, credentials) => {
  const companyId = get(credentials, 'company._id');
  const finalPayList = [];
  for (const finalPay of finalPayToCreate) {
    finalPayList.push(new FinalPay(formatPay(finalPay, companyId)));
  }

  await FinalPay.insertMany(finalPayList);
};
