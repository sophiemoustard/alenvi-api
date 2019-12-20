const moment = require('moment');
const User = require('../models/User');
const { ABSENCE, COMPANY_CONTRACT } = require('../helpers/constants');

exports.getContractsAndAbsencesBySector = async (month, sectors, companyId) => {
  const minDate = moment(month, 'MMYYYY').startOf('month').toDate();
  const maxDate = moment(month, 'MMYYYY').endOf('month').toDate();

  return User.aggregate([
    { $match: { sector: { $in: sectors } } },
    { $project: { _id: 1, sector: 1 } },
    {
      $lookup: {
        from: 'contracts',
        as: 'contracts',
        let: { auxiliaryId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $eq: ['$user', '$$auxiliaryId'] }] },
              startDate: { $lte: maxDate },
              status: COMPANY_CONTRACT,
              $or: [{ endDate: { $exists: false } }, { endDate: { $gte: minDate } }],
            },
          },
        ],
      },
    },
    { $unwind: { path: '$contracts' } },
    {
      $lookup: {
        from: 'events',
        as: 'contracts.absences',
        let: { auxiliaryId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $eq: ['$auxiliary', '$$auxiliaryId'] }] },
              startDate: { $lte: maxDate },
              endDate: { $gte: minDate },
              type: ABSENCE,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        'contracts.absences': {
          $filter: {
            input: '$contracts.absences',
            as: 'absence',
            cond: {
              $and: [
                { $gte: ['$$absence.startDate', '$contracts.startDate'] },
                {
                  $or: [
                    { $eq: [{ $type: '$contracts.endDate' }, 'missing'] },
                    { $lte: ['$$absence.endDate', '$contracts.endDate'] },
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$sector',
        contracts: { $push: '$contracts' },
      },
    },
  ]).option({ company: companyId });
};
