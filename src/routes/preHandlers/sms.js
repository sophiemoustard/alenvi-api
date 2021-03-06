const Boom = require('@hapi/boom');
const get = require('lodash/get');
const User = require('../../models/User');
const translate = require('../../helpers/translate');
const UtilsHelper = require('../../helpers/utils');

const { language } = translate;

exports.authorizeSendSms = async (req) => {
  const companyId = get(req, 'auth.credentials.company._id');
  const user = await User.findOne({ 'contact.phone': `0${req.payload.recipient.substring(3)}` }).lean();
  if (!user) throw Boom.notFound(translate[language].userNotFound);

  if (!UtilsHelper.areObjectIdsEquals(user.company, companyId)) throw Boom.forbidden();

  return null;
};
