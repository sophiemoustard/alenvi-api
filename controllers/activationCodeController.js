const randomize = require('randomatic');
const Boom = require('boom');

const tokenProcess = require('../helpers/tokenProcess');
const ActivationCode = require('../models/ActivationCode');
const translate = require('../helpers/translate');

const { language } = translate;

const createActivationCode = async (req) => {
  try {
    req.payload.code = randomize('0000');
    req.payload.firstSMS = Date.now();
    const activationData = new ActivationCode(req.payload);
    await activationData.save();
    return { message: translate[language].activationCodeCreated, data: { activationData } };
  } catch (e) {
    req.log('error', e);
    return Boom.badImplementation(translate[language].unexpectedBehavior);
  }
};

const checkActivationCode = async (req) => {
  try {
    const activationData = await ActivationCode.findOne({ code: req.params.code });
    if (!activationData) {
      return Boom.notFound(translate[language].activationCodeNotFoundOrInvalid);
    }
    // 2 days expire
    const expireTime = 604800;
    const tokenPayload = {
      _id: activationData.newUserId,
      userEmail: activationData.userEmail,
    };
    const token = tokenProcess.encode(tokenPayload, expireTime);
    return { message: translate[language].activationCodeValidated, data: { activationData, token } };
  } catch (e) {
    req.log('error', e);
    return Boom.badImplementation(translate[language].unexpectedBehavior);
  }
};

const deleteActivationCode = async (req) => {
  try {
    const activationData = await ActivationCode.findOne({ mobile_phone: req.params.mobile_phone });
    if (!activationData) {
      return Boom.notFound(translate[language].activationCodeNotFoundOrInvalid);
    }
    const deleteActivationData = await ActivationCode.findByIdAndRemove({ _id: activationData._id });
    return { message: translate[language].activationCodeDeleted, data: { deleteActivationData } };
  } catch (e) {
    req.log('error', e);
    return Boom.badImplementation(translate[language].unexpectedBehavior);
  }
};

module.exports = {
  createActivationCode,
  checkActivationCode,
  deleteActivationCode
};
