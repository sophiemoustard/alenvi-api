const get = require('lodash/get');
const Helper = require('../models/Helper');

exports.list = async (query, credentials) => {
  const helpers = await Helper.find({ customer: query.customer, company: get(credentials, 'company._id') })
    .populate({ path: 'user', select: 'identity local contact createdAt' })
    .lean();

  return helpers.map(h => ({ ...h.user, helperId: h._id, isReferent: h.referent }));
};

exports.update = async (helperId, payload) => {
  const helper = await Helper.findOneAndUpdate({ _id: helperId }, { $set: payload }).lean();

  await Helper.updateOne(
    { _id: { $ne: helper._id }, customer: helper.customer, referent: true },
    { $set: { referent: false } }
  );
};

exports.create = async (userId, customerId, companyId) => {
  const anotherHelperExist = await Helper.countDocuments({ customer: customerId });
  Helper.create({ user: userId, customer: customerId, company: companyId, referent: !anotherHelperExist });
};

exports.remove = async userId => Helper.deleteMany({ user: userId });
