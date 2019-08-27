const moment = require('moment');
const _ = require('lodash');
const Surcharge = require('../models/Surcharge');
const Customer = require('../models/Customer');
const UtilsHelper = require('../helpers/utils');

exports.populateServices = async (service) => {
  const currentVersion = [...service.versions]
    .filter(version => moment(version.startDate).isSameOrBefore(new Date(), 'days'))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const surcharge = await Surcharge.findOne({ _id: currentVersion.surcharge });

  return {
    _id: service._id,
    name: currentVersion.name,
    nature: service.nature,
    type: service.type,
    defaultUnitAmount: currentVersion.defaultUnitAmount,
    vat: currentVersion.vat,
    surcharge,
  };
};

exports.populateSubscriptionsServices = async (customer) => {
  if (!customer.subscriptions || customer.subscriptions.length === 0) return customer;
  const subscriptions = [];
  for (let i = 0, l = customer.subscriptions.length; i < l; i++) {
    subscriptions.push({
      ...customer.subscriptions[i],
      service: await exports.populateServices(customer.subscriptions[i].service),
    });
  }
  return { ...customer, subscriptions };
};

exports.subscriptionsAccepted = (customer) => {
  if (customer.subscriptions && customer.subscriptions.length > 0) {
    if (customer.subscriptionsHistory && customer.subscriptionsHistory.length > 0) {
      const subscriptions = _.map(customer.subscriptions, (subscription) => {
        const { service } = subscription;
        const lastVersion = [...subscription.versions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        const { createdAt, _id, ...version } = lastVersion;
        delete version.startDate;

        return _.pickBy({ service: service.name, ...version });
      });

      const lastSubscriptionHistory = [...customer.subscriptionsHistory].sort((a, b) => new Date(b.approvalDate) - new Date(a.approvalDate))[0];
      const lastSubscriptions = lastSubscriptionHistory.subscriptions.map(sub => _.pickBy(_.omit(sub, ['_id', 'startDate'])));
      customer.subscriptionsAccepted = _.isEqual(subscriptions, lastSubscriptions);
    } else {
      customer.subscriptionsAccepted = false;
    }
  }
  return customer;
};

const subscriptionExportHeader = [
  'Titre',
  'Nom',
  'Prénom',
  'Service',
  'Prix unitaire TTC',
  'Volume hebdomadaire estimatif',
  'Dont soirées',
  'Dont dimanches',
];

exports.exportSubscriptions = async () => {
  const customers = await Customer.find({ subscriptions: { $exists: true, $not: { $size: 0 } } }).populate('subscriptions.service');
  const data = [subscriptionExportHeader];

  for (const cus of customers) {
    for (const sub of cus.subscriptions) {
      const subInfo = [];
      if (cus.identity) {
        subInfo.push(
          _.get(cus, 'identity.title', ''),
          _.get(cus, 'identity.lastname', '').toUpperCase(),
          _.get(cus, 'identity.firstname', '')
        );
      } else subInfo.push('', '', '');

      const lastServiceVersion = UtilsHelper.getLastVersion(sub.service.versions, 'startDate');
      if (lastServiceVersion) subInfo.push(lastServiceVersion.name);
      else subInfo.push('');

      const lastVersion = UtilsHelper.getLastVersion(sub.versions, 'createdAt');
      if (lastVersion) {
        subInfo.push(
          UtilsHelper.formatFloatForExport(lastVersion.unitTTCRate),
          UtilsHelper.formatFloatForExport(lastVersion.estimatedWeeklyVolume),
          lastVersion.evenings || '',
          lastVersion.sundays || ''
        );
      } else subInfo.push('', '', '', '');

      data.push(subInfo);
    }
  }

  return data;
};
