const Boom = require('boom');
const get = require('lodash/get');
const Customer = require('../../models/Customer');
const Sector = require('../../models/Sector');
const translate = require('../../helpers/translate');

const { language } = translate;

exports.authorizeGetStats = async (req) => {
  const companyId = get(req, 'auth.credentials.company._id', null);
  if (req.query.customer) {
    const customer = await Customer.findById(req.query.customer).lean();

    if (!customer) throw Boom.notFound(translate[language].customerNotFound);
    if (customer.company.toHexString() !== companyId.toHexString()) throw Boom.forbidden();
  }

  if (req.query.sector) {
    const sectors = Array.isArray(req.query.sector) ? req.query.sector : [req.query.sector];
    const sectorsCount = await Sector.countDocuments({ _id: { $in: sectors }, company: companyId });
    if (sectors.length !== sectorsCount) throw Boom.forbidden();
  }

  return null;
};
