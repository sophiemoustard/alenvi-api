const { ObjectID } = require('mongodb');
const moment = require('moment');
const Payment = require('../../../models/Payment');
const Customer = require('../../../models/Customer');
const ThirdPartyPayer = require('../../../models/ThirdPartyPayer');
const PaymentNumber = require('../../../models/PaymentNumber');
const { PAYMENT, REFUND } = require('../../../helpers/constants');
const { populateDBForAuthentification } = require('./authentificationSeed');

const paymentTppList = [
  {
    _id: new ObjectID(),
    name: 'Toto',
  },
  {
    _id: new ObjectID(),
    name: 'Tata',
  },
];

const paymentCustomerList = [
  {
    _id: new ObjectID(),
    email: 'tito@ty.com',
    identity: {
      title: 'M',
      firstname: 'Egan',
      lastname: 'Bernal',
    },
    contact: {
      address: {
        fullAddress: '37 rue de ponthieu 75008 Paris',
        zipCode: '75008',
        city: 'Paris',
      },
      phone: '0612345678',
    },
    payment: {
      bankAccountOwner: 'Lance Amstrong',
      iban: 'FR3514508000505917721779B12',
      bic: 'BNMDHISOBD',
      mandates: [
        { rum: 'R09876543456765432', _id: new ObjectID(), signedAt: moment().toDate() },
      ],
    },
    subscriptions: [
      {
        _id: new ObjectID(),
        service: new ObjectID(),
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
          startDate: '2018-01-01T10:00:00.000+01:00',
        }],
      },
    ],
  },
  {
    _id: new ObjectID(),
    email: 'fake@test.com',
    identity: {
      title: 'M',
      firstname: 'Romain',
      lastname: 'Bardet',
    },
    subscriptions: [
      {
        _id: new ObjectID(),
        service: new ObjectID(),
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
          startDate: '2018-01-01T10:00:00.000+01:00',
        }],
      },
    ],
    payment: {
      bankAccountOwner: 'David gaudu',
      iban: '',
      bic: '',
      mandates: [
        { rum: 'R012345678903456789', _id: new ObjectID() },
      ],
    },
  },
];

const paymentsList = [
  {
    _id: new ObjectID(),
    number: 'REG-1903201',
    date: '2019-05-26T15:47:42',
    customer: paymentCustomerList[0]._id,
    client: paymentTppList[0]._id,
    netInclTaxes: 190,
    nature: PAYMENT,
    type: 'direct_debit',
  },
  {
    _id: new ObjectID(),
    number: 'REG-1903202',
    date: '2019-05-24T15:47:42',
    customer: paymentCustomerList[0]._id,
    netInclTaxes: 390,
    nature: PAYMENT,
    type: 'check',
  },
  {
    _id: new ObjectID(),
    number: 'REG-1903203',
    date: '2019-05-27T12:10:20',
    customer: paymentCustomerList[1]._id,
    client: paymentTppList[1]._id,
    netInclTaxes: 220,
    nature: REFUND,
    type: 'direct_debit',
  },
];

const populateDB = async () => {
  await PaymentNumber.deleteMany({});
  await Payment.deleteMany({});
  await ThirdPartyPayer.deleteMany({});
  await Customer.deleteMany({});

  await populateDBForAuthentification();
  await Customer.insertMany(paymentCustomerList);
  await ThirdPartyPayer.insertMany(paymentTppList);
  await Payment.insertMany(paymentsList);
};

module.exports = { paymentsList, populateDB, paymentCustomerList };
