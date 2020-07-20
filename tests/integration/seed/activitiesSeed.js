const { ObjectID } = require('mongodb');
const Step = require('../../../src/models/Step');
const Activity = require('../../../src/models/Activity');
const { populateDBForAuthentication } = require('./authenticationSeed');
const { TRANSITION } = require('../../../src/helpers/constants');

const cardsList = [
  { _id: new ObjectID(), type: TRANSITION },
];

const activitiesList = [
  { _id: new ObjectID(), title: 'manger', cards: [cardsList[0]._id] },
  { _id: new ObjectID(), title: 'bouger' },
  { _id: new ObjectID(), title: 'fumer' },
];

const stepsList = [
  { _id: new ObjectID(), type: 'e_learning', title: 'rouge', activities: [activitiesList[0]._id, activitiesList[1]._id] },
  { _id: new ObjectID(), type: 'on_site', title: 'bleu', activities: [activitiesList[2]._id] },
];


const populateDB = async () => {
  await Step.deleteMany({});
  await Activity.deleteMany({});

  await populateDBForAuthentication();

  await Step.insertMany(stepsList);
  await Activity.insertMany(activitiesList);
};

module.exports = {
  populateDB,
  cardsList,
  activitiesList,
  stepsList,
};