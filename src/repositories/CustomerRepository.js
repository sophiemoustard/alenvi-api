const moment = require('moment');
const Customer = require('../models/Customer');

exports.getCustomerFundings = async companyId => Customer.aggregate([
  { $match: { fundings: { $exists: true, $not: { $size: 0 } }, company: companyId } },
  { $unwind: '$fundings' },
  {
    $addFields: {
      'fundings.subscription': {
        $filter: { input: '$subscriptions', as: 'sub', cond: { $eq: ['$$sub._id', '$fundings.subscription'] } },
      },
    },
  },
  { $unwind: '$fundings.subscription' },
  {
    $lookup: {
      from: 'services',
      localField: 'fundings.subscription.service',
      foreignField: '_id',
      as: 'fundings.subscription.service',
    },
  },
  { $unwind: { path: '$fundings.subscription.service' } },
  {
    $lookup: {
      from: 'thirdpartypayers',
      localField: 'fundings.thirdPartyPayer',
      foreignField: '_id',
      as: 'fundings.thirdPartyPayer',
    },
  },
  { $unwind: { path: '$fundings.thirdPartyPayer' } },
  {
    $project: { funding: '$fundings', identity: 1 },
  },
]);

exports.getCustomersWithSubscriptions = async query => Customer.aggregate([
  { $match: query },
  { $unwind: { path: '$subscriptions', preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: 'services',
      localField: 'subscriptions.service',
      foreignField: '_id',
      as: 'subscriptions.service',
    },
  },
  { $unwind: { path: '$subscriptions.service', preserveNullAndEmptyArrays: true } },
  { $unwind: { path: '$subscriptions.service.versions', preserveNullAndEmptyArrays: true } },
  {
    $match: { 'subscriptions.service.versions.startDate': { $lte: moment().startOf('d').toDate() } },
  },
  { $sort: { 'subscriptions.service.versions.startDate': -1 } },
  {
    $group: {
      _id: { _id: '$_id', subscription: 'subscriptions._id' },
      customer: { $first: '$$ROOT' },
      serviceVersions: { $first: '$subscriptions.service.versions' },
    },
  },
  {
    $addFields: {
      'customer.subscriptions.service': {
        $mergeObjects: ['$serviceVersions', '$customer.subscriptions.service'],
      },
    },
  },
  { $replaceRoot: { newRoot: '$customer' } },
  {
    $group: { _id: '$_id', customer: { $first: '$$ROOT' }, subscriptions: { $push: '$subscriptions' } },
  },
  { $addFields: { 'customer.subscriptions': '$subscriptions' } },
  { $replaceRoot: { newRoot: '$customer' } },
]);

exports.getCustomersList = async query => Customer.aggregate([
  { $match: query },
  { $unwind: { path: '$subscriptions', preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: 'services',
      localField: 'subscriptions.service',
      foreignField: '_id',
      as: 'subscriptions.service',
    },
  },
  { $unwind: { path: '$subscriptions.service', preserveNullAndEmptyArrays: true } },
  { $unwind: { path: '$subscriptions.service.versions', preserveNullAndEmptyArrays: true } },
  { $sort: { 'subscriptions.service.versions.startDate': -1 } },
  {
    $group: {
      _id: { _id: '$_id', subscription: 'subscriptions._id' },
      customer: { $first: '$$ROOT' },
      serviceVersions: { $first: '$subscriptions.service.versions' },
    },
  },
  {
    $addFields: {
      'customer.subscriptions.service': {
        $mergeObjects: ['$serviceVersions', '$customer.subscriptions.service'],
      },
    },
  },
  { $replaceRoot: { newRoot: '$customer' } },
  {
    $group: { _id: '$_id', customer: { $first: '$$ROOT' }, subscriptions: { $push: '$subscriptions' } },
  },
  { $addFields: { 'customer.subscriptions': '$subscriptions' } },
  { $replaceRoot: { newRoot: '$customer' } },
  {
    $project: {
      identity: 1,
      contact: 1,
      payment: 1,
      subscriptions: 1,
      subscriptionsHistory: 1,
      quotes: 1,
      createdAt: 1,
      company: 1,
    },
  },
]);
