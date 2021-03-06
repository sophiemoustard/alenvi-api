const { ObjectID } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const { WEBAPP } = require('../../../src/helpers/constants');
const User = require('../../../src/models/User');
const { populateDBForAuthentication, rolesList, otherCompany, authCompany } = require('./authenticationSeed');

const emailUser = {
  _id: new ObjectID(),
  identity: { firstname: 'emailUser', lastname: 'Test' },
  local: { email: 'email_user@alenvi.io', password: '123456!eR' },
  refreshToken: uuidv4(),
  role: { client: rolesList.find(role => role.name === 'client_admin')._id },
  company: authCompany._id,
  origin: WEBAPP,
};

const emailUserFromOtherCompany = {
  _id: new ObjectID(),
  identity: { firstname: 'otherCompany', lastname: 'Test' },
  local: { email: 'email_user_other_company@alenvi.io', password: '123456!eR' },
  refreshToken: uuidv4(),
  role: { client: rolesList.find(role => role.name === 'client_admin')._id },
  company: otherCompany._id,
  origin: WEBAPP,
};

const trainerFromOtherCompany = {
  _id: new ObjectID(),
  identity: { firstname: 'trainer', lastname: 'Test' },
  local: { email: 'trainer_email_other_company@alenvi.io', password: '123456!eR' },
  refreshToken: uuidv4(),
  role: { vendor: rolesList.find(role => role.name === 'trainer')._id },
  company: otherCompany._id,
  origin: WEBAPP,
};

const populateDB = async () => {
  await User.deleteMany({});
  await populateDBForAuthentication();
  await new User(emailUser).save();
  await new User(emailUserFromOtherCompany).save();
  await new User(trainerFromOtherCompany).save();
};

module.exports = { populateDB, emailUser, emailUserFromOtherCompany, trainerFromOtherCompany };
