const Boom = require('@hapi/boom');
const Surcharge = require('../../models/Surcharge');
const translate = require('../../helpers/translate');

const { language } = translate;

exports.authorizeSurchargesUpdate = async (req) => {
  if (!req.auth.credentials.company || !req.auth.credentials.company._id) throw Boom.forbidden();
  const companyId = req.auth.credentials.company._id;
  const surcharge = await Surcharge.findOne({ _id: req.params._id }).lean();

  if (!surcharge) throw Boom.notFound(translate[language].surchargesNotFound);
  if (surcharge.company.toHexString() === companyId.toHexString()) return null;

  throw Boom.forbidden();
};
