const { ObjectID } = require('mongodb');
const uuidv4 = require('uuid/v4');
const moment = require('moment');
const Customer = require('../../../src/models/Customer');
const Company = require('../../../src/models/Company');
const Service = require('../../../src/models/Service');
const Event = require('../../../src/models/Event');
const QuoteNumber = require('../../../src/models/QuoteNumber');
const ThirdPartyPayer = require('../../../src/models/ThirdPartyPayer');
const User = require('../../../src/models/User');
const { FIXED, ONCE, COMPANY_CONTRACT, HOURLY, CUSTOMER_CONTRACT } = require('../../../src/helpers/constants');
const { populateDBForAuthentication, rolesList, authCompany } = require('./authenticationSeed');

const subId = new ObjectID();
const otherCompanyId = new ObjectID();
const otherCompanyCustomerId = new ObjectID();

const customerServiceList = [
  {
    _id: new ObjectID(),
    type: COMPANY_CONTRACT,
    company: authCompany._id,
    versions: [{
      defaultUnitAmount: 12,
      name: 'Service 1',
      startDate: '2019-01-16 17:58:15',
      vat: 12,
    }],
    nature: HOURLY,
  },
  {
    _id: new ObjectID(),
    type: CUSTOMER_CONTRACT,
    company: authCompany._id,
    versions: [{
      defaultUnitAmount: 24,
      name: 'Service 2',
      startDate: '2019-01-18 19:58:15',
      vat: 12,
    }],
    nature: HOURLY,
  },
];

const customerThirdPartyPayer = {
  _id: new ObjectID('62400565f8fd3555379720c9'),
  company: authCompany._id,
};

const customersList = [
  { // Customer with subscriptions, subscriptionsHistory, fundings and quote
    _id: new ObjectID(),
    company: authCompany._id,
    email: 'fake@test.com',
    identity: {
      title: 'mr',
      firstname: 'Romain',
      lastname: 'Bardet',
    },
    contact: {
      primaryAddress: {
        fullAddress: '37 rue de ponthieu 75008 Paris',
        zipCode: '75008',
        city: 'Paris',
      },
      phone: '0123456789',
      accessCodes: 'porte c3po',
    },
    followUp: {
      environment: 'ne va pas bien',
      objectives: 'preparer le dejeuner + balade',
      misc: 'code porte: 1234',
    },
    subscriptions: [
      {
        _id: subId,
        service: customerServiceList[0]._id,
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
        }],
      },
      {
        _id: new ObjectID(),
        service: customerServiceList[1]._id,
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
        }],
      },
    ],
    subscriptionsHistory: [{
      subscriptions: [{
        unitTTCRate: 12,
        estimatedWeeklyVolume: 12,
        evenings: 2,
        sundays: 1,
        service: 'Service 1',
      }, {
        unitTTCRate: 12,
        estimatedWeeklyVolume: 12,
        evenings: 2,
        sundays: 1,
        service: 'Service 2',
      }],
      helper: {
        firstname: 'Vladimir',
        lastname: 'Poutine',
        title: 'mr',
      },
      approvalDate: '2018-01-01T10:00:00.000+01:00',
    }],
    payment: {
      bankAccountOwner: 'David gaudu',
      iban: '',
      bic: '',
      mandates: [
        { rum: 'R012345678903456789' },
      ],
    },
    quotes: [{
      _id: new ObjectID(),
      subscriptions: [{
        serviceName: 'Test',
        unitTTCRate: 23,
        estimatedWeeklyVolume: 3,
      }, {
        serviceName: 'Test2',
        unitTTCRate: 30,
        estimatedWeeklyVolume: 10,
      }],
    }],
    fundings: [
      {
        _id: new ObjectID(),
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayer._id,
        subscription: subId,
        versions: [{
          folderNumber: 'D123456',
          startDate: moment.utc().toDate(),
          frequency: ONCE,
          endDate: moment.utc().add(6, 'months').toDate(),
          effectiveDate: moment.utc().toDate(),
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [0, 1, 2, 3, 4, 5, 6],
        }],
      },
    ],
  },
  { // Customer with mandates
    _id: new ObjectID(),
    company: authCompany._id,
    email: 'tito@ty.com',
    identity: {
      title: 'mr',
      firstname: 'Egan',
      lastname: 'Bernal',
    },
    contact: {
      primaryAddress: {
        fullAddress: '37 rue de ponthieu 75008 Paris',
        zipCode: '75008',
        city: 'Paris',
      },
      phone: '0612345678',
      accessCodes: 'you shall not pass',
    },
    payment: {
      bankAccountOwner: 'Lance Amstrong',
      iban: 'FR3514508000505917721779B12',
      bic: 'BNMDHISOBD',
      mandates: [
        { rum: 'R09876543456765432', _id: new ObjectID(), signedAt: moment().toDate() },
      ],
    },
  },
  {
    _id: new ObjectID(),
    company: authCompany._id,
    email: 'toototjo@hfjld.io',
    identity: {
      title: 'mr',
      firstname: 'Julian',
      lastname: 'Alaphilippe',
    },
    contact: {
      primaryAddress: {
        fullAddress: '37 rue de ponthieu 75008 Paris',
        zipCode: '75008',
        city: 'Paris',
      },
      phone: '0612345678',
      accessCodes: 'Bouton a l\'entrée',
    },
    payment: {
      bankAccountOwner: 'David gaudu',
      iban: '',
      bic: '',
      mandates: [
        { rum: 'R012345678903456789' },
      ],
    },
  },
  {
    _id: new ObjectID(),
    company: authCompany._id,
    email: 'volgarr@theviking.io',
    identity: {
      title: 'mr',
      firstname: 'Volgarr',
      lastname: 'Theviking',
    },
    driveFolder: { driveId: '1234567890' },
    contact: {
      primaryAddress: {
        fullAddress: 'Lyngsøvej 26, 8600 Silkeborg, Danemark',
        zipCode: '8600',
        city: 'Silkeborg',
      },
      phone: '0612345678',
    },
  },
  {
    company: otherCompanyId,
    _id: otherCompanyCustomerId,
    name: 'notFromCompany',
    email: 'test@test.io',
    identity: {
      title: 'mr',
      firstname: 'test',
      lastname: 'test',
    },
    driveFolder: { driveId: '09876543' },
    contact: {
      primaryAddress: {
        fullAddress: '37 rue de Ponthieu 75018 Paris',
        zipCode: '75018',
        city: 'Paris',
      },
      phone: '0698765432',
    },
    subscriptions: [
      {
        _id: new ObjectID(),
        service: customerServiceList[0]._id,
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
        }],
      },
      {
        _id: new ObjectID(),
        service: customerServiceList[1]._id,
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
        }],
      },
    ],
    subscriptionsHistory: [{
      subscriptions: [{
        unitTTCRate: 12,
        estimatedWeeklyVolume: 12,
        evenings: 2,
        sundays: 1,
        service: 'Service 1',
      }, {
        unitTTCRate: 12,
        estimatedWeeklyVolume: 12,
        evenings: 2,
        sundays: 1,
        service: 'Service 2',
      }],
      helper: {
        firstname: 'Vladimir',
        lastname: 'Poutine',
        title: 'mr',
      },
      approvalDate: '2018-01-01T10:00:00.000+01:00',
    }],
    payment: {
      bankAccountOwner: 'David gaudu',
      iban: '',
      bic: '',
      mandates: [
        {
          _id: new ObjectID(),
          rum: 'R012345678903456789',
        },
      ],
    },
    quotes: [{
      _id: new ObjectID(),
      subscriptions: [{
        serviceName: 'Test',
        unitTTCRate: 23,
        estimatedWeeklyVolume: 3,
      }, {
        serviceName: 'Test2',
        unitTTCRate: 30,
        estimatedWeeklyVolume: 10,
      }],
    }],
    fundings: [
      {
        _id: new ObjectID(),
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayer._id,
        subscription: subId,
        versions: [{
          folderNumber: 'D123456',
          startDate: moment.utc().toDate(),
          frequency: ONCE,
          endDate: moment.utc().add(6, 'months').toDate(),
          effectiveDate: moment.utc().toDate(),
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [0, 1, 2, 3, 4, 5, 6],
        }],
      },
    ],
  },
];

const userList = [
  {
    _id: new ObjectID(),
    company: authCompany._id,
    identity: { firstname: 'HelperForCustomer', lastname: 'Test' },
    local: { email: 'helper_for_customer_customer@alenvi.io', password: '123456' },
    refreshToken: uuidv4(),
    role: rolesList.find(role => role.name === 'helper')._id,
    customers: [customersList[0]._id],
  },
  {
    _id: new ObjectID(),
    company: authCompany._id,
    identity: { firstname: 'HelperForCustomer2', lastname: 'Test' },
    local: { email: 'helper_for_customer_customer2@alenvi.io', password: '123456' },
    refreshToken: uuidv4(),
    role: rolesList.find(role => role.name === 'helper')._id,
    customers: [customersList[1]._id],
  },
  {
    _id: new ObjectID(),
    company: authCompany._id,
    identity: { firstname: 'HelperForCustomer4', lastname: 'Test' },
    local: { email: 'helper_for_customer_customer4@alenvi.io', password: '123456' },
    refreshToken: uuidv4(),
    role: rolesList.find(role => role.name === 'helper')._id,
    customers: [customersList[3]._id],
  },
  {
    _id: new ObjectID(),
    company: authCompany._id,
    identity: { firstname: 'HelperForCustomerOtherCompany', lastname: 'Test' },
    local: { email: 'helper_for_customer_other_company@alenvi.io', password: '123456' },
    refreshToken: uuidv4(),
    role: rolesList.find(role => role.name === 'helper')._id,
    customers: otherCompanyCustomerId,
  },
];

const eventList = [
  {
    _id: new ObjectID(),
    company: authCompany._id,
    isBilled: true,
    customer: customersList[0]._id,
    type: 'intervention',
    bills: {},
    subscription: subId,
    startDate: '2019-01-16T14:30:19.543Z',
    endDate: '2019-01-16T15:30:21.653Z',
  },
  {
    _id: new ObjectID(),
    company: authCompany._id,
    sector: new ObjectID(),
    type: 'intervention',
    status: 'contract_with_company',
    startDate: '2019-01-16T09:30:19.543Z',
    endDate: '2019-01-16T11:30:21.653Z',
    customer: customersList[0]._id,
    createdAt: '2019-01-15T11:33:14.343Z',
    subscription: subId,
    isBilled: true,
    bills: {
      thirdPartyPayer: customerThirdPartyPayer._id,
      inclTaxesCustomer: 20,
      exclTaxesCustomer: 15,
      inclTaxesTpp: 10,
      exclTaxesTpp: 5,
      fundingId: new ObjectID(),
      nature: 'hourly',
      careHours: 2,
    },
  },
  {
    _id: new ObjectID(),
    company: otherCompanyId,
    isBilled: true,
    customer: otherCompanyCustomerId,
    type: 'intervention',
    bills: {
      thirdPartyPayer: new ObjectID(),
      inclTaxesCustomer: 20,
      exclTaxesCustomer: 15,
      inclTaxesTpp: 10,
      exclTaxesTpp: 5,
      fundingId: new ObjectID(),
      nature: 'hourly',
      careHours: 2,
    },
    subscription: new ObjectID(),
    startDate: '2019-01-16T14:30:19.543Z',
    endDate: '2019-01-16T15:30:21.653Z',
  },
];

const populateDB = async () => {
  await Service.deleteMany({});
  await Company.deleteMany({});
  await Customer.deleteMany({});
  await Event.deleteMany({});
  await ThirdPartyPayer.deleteMany({});
  await QuoteNumber.deleteMany({});
  await User.deleteMany({});

  await populateDBForAuthentication();
  await (new ThirdPartyPayer(customerThirdPartyPayer)).save();
  await Service.insertMany(customerServiceList);
  await Customer.insertMany(customersList);
  await Event.insertMany(eventList);
  for (const user of userList) {
    await (new User(user).save());
  }
};

module.exports = {
  customersList,
  userList,
  populateDB,
  customerServiceList,
  customerThirdPartyPayer,
  otherCompanyId,
  otherCompanyCustomerId,
};
