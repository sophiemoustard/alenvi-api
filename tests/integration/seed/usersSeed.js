const uuidv4 = require('uuid/v4');
const { ObjectID } = require('mongodb');
const User = require('../../../src/models/User');
const Customer = require('../../../src/models/Customer');
const Company = require('../../../src/models/Company');
const Task = require('../../../src/models/Task');
const Sector = require('../../../src/models/Sector');
const SectorHistory = require('../../../src/models/SectorHistory');
const { rolesList, populateDBForAuthentication, otherCompany } = require('./authenticationSeed');

const company = {
  _id: new ObjectID(),
  name: 'Testtoto',
  tradeName: 'TT',
  rhConfig: {
    internalHours: [
      { name: 'Formation', default: true, _id: new ObjectID() },
      { name: 'Code', default: false, _id: new ObjectID() },
      { name: 'Gouter', default: false, _id: new ObjectID() },
    ],
    feeAmount: 12,
  },
  iban: 'FR3514508000505917721779B12',
  bic: 'RTYUIKJHBFRG',
  ics: '12345678',
  directDebitsFolderId: '1234567890',
  customersFolderId: 'mnbvcxz',
  folderId: '0987654321',
  customersConfig: {
    billingPeriod: 'two_weeks',
  },
  prefixNumber: 103,
};

const task = {
  _id: new ObjectID(),
  name: 'Test',
};

const customerFromOtherCompany = {
  _id: new ObjectID(),
  identity: { title: 'mr', firstname: 'toto', lastname: 'test' },
  company: otherCompany._id,
  contact: {
    primaryAddress: {
      fullAddress: '37 rue de ponthieu 75008 Paris',
      zipCode: '75008',
      city: 'Paris',
      street: '37 rue de Ponthieu',
      location: { type: 'Point', coordinates: [2.377133, 48.801389] },
    },
    phone: '0123456789',
    accessCodes: 'porte c3po',
  },
};

const userFromOtherCompany = {
  _id: new ObjectID(),
  identity: { firstname: 'test', lastname: 'toto' },
  local: { email: 'othercompany@alenvi.io', password: '123456' },
  role: rolesList.find(role => role.name === 'helper')._id,
  refreshToken: uuidv4(),
  company: otherCompany._id,
  procedure: [{ task: task._id }],
  inactivityDate: null,
  customers: [customerFromOtherCompany._id],
};

const usersSeedList = [
  {
    _id: new ObjectID(),
    identity: { firstname: 'Auxiliary', lastname: 'Black' },
    local: { email: 'black@alenvi.io', password: '123456' },
    role: rolesList.find(role => role.name === 'auxiliary')._id,
    refreshToken: uuidv4(),
    company: company._id,
    administrative: {
      certificates: [{ driveId: '1234567890' }],
      driveFolder: { driveId: '0987654321' },
    },
    procedure: [{ task: task._id }],
    inactivityDate: null,
  },
  {
    _id: new ObjectID(),
    identity: { firstname: 'Auxiliary', lastname: 'White' },
    local: { email: 'white@alenvi.io', password: '123456' },
    role: rolesList.find(role => role.name === 'auxiliary')._id,
    refreshToken: uuidv4(),
    company: company._id,
    administrative: {
      certificates: [{ driveId: '1234567890' }],
      driveFolder: { driveId: '0987654321' },
    },
    procedure: [{ task: task._id }],
    inactivityDate: null,
  },
  {
    _id: new ObjectID(),
    identity: { firstname: 'Admin1', lastname: 'Horseman' },
    local: { email: 'horseman@alenvi.io', password: '123456' },
    refreshToken: uuidv4(),
    company: company._id,
    role: rolesList.find(role => role.name === 'admin')._id,
    inactivityDate: '2018-11-01T12:52:27.461Z',
  },
  {
    _id: new ObjectID(),
    identity: { firstname: 'Admin2', lastname: 'Vador' },
    local: { email: 'vador@alenvi.io', password: '123456' },
    refreshToken: uuidv4(),
    company: company._id,
    role: rolesList.find(role => role.name === 'admin')._id,
    inactivityDate: '2018-11-01T12:52:27.461Z',
  },
  {
    _id: new ObjectID(),
    identity: { firstname: 'Admin3', lastname: 'Kitty' },
    local: { email: 'kitty@alenvi.io', password: '123456' },
    refreshToken: uuidv4(),
    company: company._id,
    role: rolesList.find(role => role.name === 'admin')._id,
    inactivityDate: '2018-11-01T12:52:27.461Z',
  },
  {
    _id: new ObjectID(),
    identity: { firstname: 'Coach', lastname: 'Trump' },
    local: { email: 'trump@alenvi.io', password: '123456' },
    inactivityDate: null,
    refreshToken: uuidv4(),
    company: company._id,
    role: rolesList.find(role => role.name === 'coach')._id,
    contracts: [new ObjectID()],
  },
  {
    _id: new ObjectID(),
    identity: { firstname: 'Helper1', lastname: 'Carolyn' },
    local: { email: 'carolyn@alenvi.io', password: '123456' },
    inactivityDate: null,
    refreshToken: uuidv4(),
    company: company._id,
    role: rolesList.find(role => role.name === 'helper')._id,
    contracts: [new ObjectID()],
  },
];

const userSectors = [
  { _id: new ObjectID(), name: 'Terre', company: company._id },
  { _id: new ObjectID(), name: 'Lune', company: company._id },
];

const userPayload = {
  identity: { firstname: 'Auxiliary2', lastname: 'Kirk' },
  local: { email: 'kirk@alenvi.io', password: '123456' },
  role: rolesList.find(role => role.name === 'auxiliary')._id,
  sector: userSectors[0]._id,
};


const sectorHistories = usersSeedList
  .filter(user => user.role === rolesList.find(role => role.name === 'auxiliary')._id)
  .map(user => ({ auxiliary: user._id, sector: userSectors[0]._id, company: company._id }));

const isInList = (list, user) => list.some(i => i._id.toHexString() === user._id.toHexString());
const isExistingRole = (roleId, roleName) => roleId === rolesList.find(r => r.name === roleName)._id;

const populateDB = async () => {
  await User.deleteMany({});
  await Company.deleteMany({});
  await Task.deleteMany({});
  await Customer.deleteMany({});
  await Sector.deleteMany({});
  await SectorHistory.deleteMany({});

  await populateDBForAuthentication();
  await User.create(usersSeedList.concat(userFromOtherCompany));
  await Customer.create(customerFromOtherCompany);
  await Sector.create(userSectors);
  await SectorHistory.create(sectorHistories);
  await new Company(company).save();
  await new Task(task).save();
};

module.exports = {
  usersSeedList,
  userPayload,
  populateDB,
  isInList,
  isExistingRole,
  customerFromOtherCompany,
  userFromOtherCompany,
  userSectors,
  company,
  sectorHistories,
};
