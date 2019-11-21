const { ObjectID } = require('mongodb');
const Customer = require('../models/Customer');
const { HOURLY, MONTHLY, INVOICED_AND_PAID, INVOICED_AND_NOT_PAID } = require('../helpers/constants');

exports.getEventsGroupedByFundings = async (customerId, fundingsDate, eventsDate) => {
  const matchAndPopulateFundings = [
    {
      $match:
      {
        _id: new ObjectID(customerId),
        fundings: {
          $elemMatch: {
            frequency: MONTHLY,
            nature: HOURLY,
            versions: {
              $elemMatch: {
                startDate: { $lte: fundingsDate.maxStartDate },
                $or: [
                  { endDate: { $exists: false } },
                  { endDate: { $gte: fundingsDate.minEndDate } },
                ],
              },
            },
          },
        },
      },
    },
    { $unwind: { path: '$fundings' } },
    { $match: { 'fundings.frequency': MONTHLY, 'fundings.nature': HOURLY } },
    {
      $lookup: {
        from: 'thirdpartypayers',
        localField: 'fundings.thirdPartyPayer',
        foreignField: '_id',
        as: 'fundings.thirdPartyPayer',
      },
    },
    { $unwind: { path: '$fundings.thirdPartyPayer' } },
    { $unwind: { path: '$subscriptions' } },
    {
      $project: {
        _id: 1,
        subscriptions: { _id: 1 },
        fundings: {
          thirdPartyPayer: { name: 1 },
          versions: 1,
        },
      },
    },
  ];

  const matchAndPopulateEvents = [
    {
      $lookup: {
        from: 'events',
        as: 'events',
        let: {
          subscriptionId: '$subscriptions._id',
          customerId: '$_id',
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$customer', '$$customerId'] },
                  { $eq: ['$subscription', '$$subscriptionId'] },
                  { $eq: ['$type', 'intervention'] },
                  {
                    $gt: ['$startDate', eventsDate.minStartDate],
                  },
                  { $lte: ['$startDate', eventsDate.maxStartDate] },
                  {
                    $or: [
                      ['$isCancelled', false],
                      ['$isCancelled', ['$exists', false]],
                      ['$cancel.condition', INVOICED_AND_PAID],
                      ['$cancel.condition', INVOICED_AND_NOT_PAID],
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    },
    { $unwind: { path: '$events', preserveNullAndEmptyArrays: true } },
  ];

  const group = [
    {
      $group: {
        _id: {
          month: { $dateToString: { format: '%Y-%m', date: '$events.startDate' } },
          funding: '$fundings',
        },
        events: { $push: '$events' },
      },
    },
    {
      $group: {
        _id: '$_id.funding',
        eventsByMonth: {
          $push: {
            date: '$_id.month',
            events: '$events',
          },
        },
      },
    },
  ];

  return Customer.aggregate([
    ...matchAndPopulateFundings,
    ...matchAndPopulateEvents,
    ...group,
  ]);
};
