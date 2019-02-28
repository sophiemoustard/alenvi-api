const { ObjectID } = require('mongodb');
const Company = require('../../../models/Company');

const companiesList = [
  {
    _id: new ObjectID(),
    name: 'Test',
    customersConfig: {
      services: [
        {
          _id: new ObjectID(),
          versions: [{
            defaultUnitAmount: 12,
            eveningSurcharge: '',
            holidaySurcharge: '',
            name: 'Service 1',
            startDate: '2019-01-16 17:58:15.519',
            vat: 12,
          }],
          nature: 'Service 1',
        },
      ],
      thirdPartyPayers: [
        {
          _id: new ObjectID(),
          name: 'Toto'
        }
      ]
    },
    rhConfig: {
      internalHours: [
        { name: 'Formation', default: true, _id: new ObjectID() },
        { name: 'Code', default: false, _id: new ObjectID() },
        { name: 'Gouter', default: false, _id: new ObjectID() },
      ],
    }
  },
];

const populateCompanies = async () => {
  await Company.remove({});
  await Company.insertMany(companiesList);
};

module.exports = { companiesList, populateCompanies };
