const Boom = require('@hapi/boom');
const get = require('lodash/get');
const { ObjectID } = require('mongodb');

module.exports = {
  validateQuery(next) {
    const query = this.getQuery();
    const isPopulate = get(query, '_id.$in', null);
    const hasCompany = (query.$and && query.$and.some(q => !!get(q, 'company', null))) || query.company;
    const { isVendorUser } = this.getOptions();

    if (!hasCompany && !isPopulate && !isVendorUser) next(Boom.badRequest());
    next();
  },
  validatePayload(next) {
    if (!this.company) next(Boom.badRequest());
    next();
  },
  validateAggregation(next) {
    if (get(this, 'options.allCompanies', null)) return next();
    const companyId = get(this, 'options.company', null);
    if (!companyId) next(Boom.badRequest());
    this.pipeline().unshift({ $match: { company: new ObjectID(companyId) } });
    next();
  },
  validateUpdateOne(next) {
    const query = this.getQuery();
    if (!query.company) next(Boom.badRequest());
    next();
  },
};
