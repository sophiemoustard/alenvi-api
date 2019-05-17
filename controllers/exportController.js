const Boom = require('boom');
const { SERVICE, AUXILIARY_EXPORT_TYPE, HELPER_EXPORT_TYPE, CUSTOMER_EXPORT_TYPE, FUNDING, SUBSCRIPTION } = require('../helpers/constants');
const { exportServices } = require('../helpers/services');
const { exportCustomers } = require('../helpers/customers');
const { exportSubscriptions } = require('../helpers/subscriptions');
const { exportFundings } = require('../helpers/fundings');
const { exportAuxiliaries, exportHelpers } = require('../helpers/users');
const { exportToCsv } = require('../helpers/file');

const exportData = async (req, h) => {
  try {
    const { type } = req.params;

    let data;
    switch (type) {
      case AUXILIARY_EXPORT_TYPE:
        data = await exportAuxiliaries();
        break;
      case HELPER_EXPORT_TYPE:
        data = await exportHelpers();
        break;
      case FUNDING:
        data = await exportFundings();
        break;
      case CUSTOMER_EXPORT_TYPE:
        data = await exportCustomers();
        break;
      case SUBSCRIPTION:
        data = await exportSubscriptions();
        break;
      case SERVICE:
        data = await exportServices();
        break;
    }

    const csv = await exportToCsv(data);

    return h.file(csv, { confine: false });
  } catch (e) {
    req.log('error', e);
    return Boom.badImplementation(e);
  }
};

module.exports = {
  exportData,
};
