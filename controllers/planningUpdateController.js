const Boom = require('boom');

const translate = require('../helpers/translate');
const User = require('../models/User');


const { language } = translate;

const list = async (req) => {
  try {
    const filter = {
      planningModification: { $exists: true }
    };
    if (req.query.userId) {
      filter._id = req.query.userId;
    }
    const modifPlanning = await User.find(filter, {
      firstname: 1,
      lastname: 1,
      sector: 1,
      'planningModification._id': 1,
      'planningModification.modificationType': 1,
      'planningModification.involved': 1,
      'planningModification.content': 1,
      'planningModification.createdAt': 1,
      'planningModification.check.isChecked': 1,
      'planningModification.check.checkedAt': 1
    }).populate({
      path: 'planningModification.check.checkBy',
      select: 'firstname lastname'
    }).lean();
    if (!modifPlanning) {
      return Boom.notFound(translate[language].planningModificationsNotFound);
    }
    return { message: translate[language].planningModificationsFound, data: { modifPlanning } };
  } catch (e) {
    req.log('error', e);
    return Boom.badImplementation();
  }
};

const storeUserModificationPlanning = async (req) => {
  try {
    const filter = {};
    if (req.query.userId) {
      filter._id = req.query.userId;
    } else {
      filter.employee_id = req.query.employee_id;
    }
    const payload = {
      content: req.payload.content,
      involved: req.payload.involved,
      modificationType: req.payload.type
    };
    if (req.payload.check) {
      payload.check = req.payload.check;
    }
    const userModificationPlanningStored = await User.findOneAndUpdate(filter, { $push: { planningModification: payload } }, { new: true });
    if (!userModificationPlanningStored) {
      return Boom.notFound(translate[language].userNotFound);
    }
    return { message: translate[language].planningModificationStored, data: { userModificationPlanningStored } };
  } catch (e) {
    req.log('error', e);
    return Boom.badImplementation();
  }
};

const updateModificationPlanningStatus = async (req) => {
  try {
    const modificationPlanningUpdated = await User.findOneAndUpdate({ 'planningModification._id': req.params._id }, { $set: { 'planningModification.$.check': req.payload } }, { new: true });
    if (!modificationPlanningUpdated) {
      return Boom.notFound(translate[language].planningModificationsNotFound);
    }
    return { message: translate[language].planningModificationUpdated, data: { modificationPlanningUpdated } };
  } catch (e) {
    req.log('error', e);
    return Boom.badImplementation();
  }
};

const removeModificationPlanning = async (req) => {
  try {
    const modificationPlanning = await User.update({ _id: req.query.userId }, { $pull: { planningModification: { _id: req.params._id } } });
    if (!modificationPlanning) {
      return Boom.notFound(translate[language].planningModificationsNotFound);
    }
    return { message: translate[language].planningModificationDeleted };
  } catch (e) {
    req.log('error', e);
    return Boom.badImplementation();
  }
};

module.exports = {
  list,
  storeUserModificationPlanning,
  updateModificationPlanningStatus,
  removeModificationPlanning
};
