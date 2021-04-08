const Boom = require('@hapi/boom');
const PartnerOrganization = require('../../models/PartnerOrganization');
const translate = require('../../helpers/translate');

const { language } = translate;

exports.authorizePartnerOrganizationCreation = async (req) => {
  const { credentials } = req.auth;

  const partnerOrganizationAlreadyExist = await PartnerOrganization.countDocuments({
    name: req.payload.name,
    company: credentials.company._id,
  });
  if (partnerOrganizationAlreadyExist) throw Boom.conflict(translate[language].partnerOrganizationAlreadyExists);

  return null;
};

exports.partnerOrganizationExists = async (req) => {
  const partnerOrganizationExists = await PartnerOrganization.countDocuments({ _id: req.params._id });
  if (!partnerOrganizationExists) throw Boom.forbidden();

  return null;
};
