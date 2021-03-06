const moment = require('moment');
const get = require('lodash/get');
const has = require('lodash/has');
const {
  CIVILITY_LIST,
  HELPER,
  AUXILIARY_ROLES,
  DAYS_INDEX,
  FUNDING_FREQUENCIES,
  CUSTOMER_SITUATIONS,
  FUNDING_NATURES,
  SERVICE_NATURES,
} = require('./constants');
const UtilsHelper = require('./utils');
const Customer = require('../models/Customer');
const Role = require('../models/Role');
const User = require('../models/User');
const SectorHistory = require('../models/SectorHistory');
const ReferentHistory = require('../models/ReferentHistory');
const Service = require('../models/Service');
const ContractRepository = require('../repositories/ContractRepository');
const CustomerRepository = require('../repositories/CustomerRepository');
const { nationalities } = require('../data/nationalities');
const { countries } = require('../data/countries');

const getServicesNameList = (subscriptions) => {
  let list = `${UtilsHelper.getLastVersion(subscriptions[0].service.versions, 'startDate').name}`;
  if (subscriptions.length > 1) {
    for (const sub of subscriptions.slice(1)) {
      list = list.concat(`\r\n ${UtilsHelper.getLastVersion(sub.service.versions, 'startDate').name}`);
    }
  }
  return list;
};

const customerExportHeader = [
  'Id Bénéficiaire',
  'Titre',
  'Nom',
  'Prenom',
  'Date de naissance',
  'Adresse',
  '1ère intervention',
  'Id Auxiliaire référent',
  'Auxiliaire référent',
  'Situation',
  'Environnement',
  'Objectifs',
  'Autres',
  'Nom associé au compte bancaire',
  'IBAN',
  'BIC',
  'RUM',
  'Date de signature du mandat',
  'Nombre de souscriptions',
  'Souscriptions',
  'Nombre de financements',
  'Date de création',
];

const formatIdentity = person => `${person.firstname} ${person.lastname}`;

exports.exportCustomers = async (credentials) => {
  const companyId = get(credentials, 'company._id', null);
  const customers = await Customer.find({ company: companyId })
    .populate({ path: 'subscriptions.service' })
  // need the match as it is a virtual populate
    .populate({ path: 'firstIntervention', select: 'startDate', match: { company: companyId } })
    .populate({ path: 'referent', match: { company: companyId } })
    .lean({ autopopulate: true });
  const rows = [customerExportHeader];

  for (const cus of customers) {
    const birthDate = get(cus, 'identity.birthDate');
    const lastname = get(cus, 'identity.lastname');
    const mandates = get(cus, 'payment.mandates') || [];
    const lastMandate = UtilsHelper.getLastVersion(mandates, 'createdAt') || {};
    const signedAt = lastMandate.signedAt ? moment(lastMandate.signedAt).format('DD/MM/YYYY') : '';
    const subscriptionsCount = get(cus, 'subscriptions.length') || 0;
    const firstIntervention = get(cus, 'firstIntervention.startDate');
    const situation = CUSTOMER_SITUATIONS.find(sit => sit.value === get(cus, 'followUp.situation'));

    const cells = [
      get(cus, '_id') || '',
      CIVILITY_LIST[get(cus, 'identity.title')] || '',
      lastname ? lastname.toUpperCase() : '',
      get(cus, 'identity.firstname') || '',
      birthDate ? moment(birthDate).format('DD/MM/YYYY') : '',
      get(cus, 'contact.primaryAddress.fullAddress') || '',
      firstIntervention ? moment(firstIntervention).format('DD/MM/YYYY') : '',
      get(cus, 'referent._id') || '',
      has(cus, 'referent.identity') ? formatIdentity(get(cus, 'referent.identity')) : '',
      situation ? situation.label : '',
      get(cus, 'followUp.environment') || '',
      get(cus, 'followUp.objectives') || '',
      get(cus, 'followUp.misc') || '',
      get(cus, 'payment.bankAccountOwner') || '',
      get(cus, 'payment.iban') || '',
      get(cus, 'payment.bic') || '',
      lastMandate.rum || '',
      signedAt,
      subscriptionsCount,
      subscriptionsCount ? getServicesNameList(cus.subscriptions) : '',
      get(cus, 'fundings.length') || 0,
      cus.createdAt ? moment(cus.createdAt).format('DD/MM/YYYY') : '',
    ];

    rows.push(cells);
  }

  return rows;
};

const auxiliaryExportHeader = [
  'Email',
  'Équipe',
  'Id Auxiliaire',
  'Titre',
  'Nom',
  'Prénom',
  'Date de naissance',
  'Pays de naissance',
  'Departement de naissance',
  'Ville de naissance',
  'Nationalité',
  'N° de sécurité sociale',
  'Addresse',
  'Téléphone',
  'Nombre de contracts',
  'Établissement',
  'Date de début de contrat prestataire',
  'Date de fin de contrat prestataire',
  'Date d\'inactivité',
  'Date de création',
];

const getDataForAuxiliariesExport = (aux, contractsLength, contract) => {
  const nationality = get(aux, 'identity.nationality');
  const lastname = get(aux, 'identity.lastname');
  const birthDate = get(aux, 'identity.birthDate');
  const address = get(aux, 'contact.address.fullAddress');
  const birthCountry = get(aux, 'identity.birthCountry');
  const { inactivityDate, createdAt } = aux;

  return [
    get(aux, 'local.email') || '',
    get(aux, 'sector.name') || '',
    aux._id || '',
    CIVILITY_LIST[get(aux, 'identity.title')] || '',
    lastname ? lastname.toUpperCase() : '',
    get(aux, 'identity.firstname') || '',
    birthDate ? moment(birthDate).format('DD/MM/YYYY') : '',
    countries[birthCountry] || '',
    get(aux, 'identity.birthState') || '',
    get(aux, 'identity.birthCity') || '',
    nationality ? nationalities[nationality] : '',
    get(aux, 'identity.socialSecurityNumber') || '',
    address || '',
    get(aux, 'contact.phone') || '',
    contractsLength,
    get(aux, 'establishment.name') || '',
    get(contract, 'startDate', null) ? moment(contract.startDate).format('DD/MM/YYYY') : '',
    get(contract, 'endDate', null) ? moment(contract.endDate).format('DD/MM/YYYY') : '',
    inactivityDate ? moment(inactivityDate).format('DD/MM/YYYY') : '',
    createdAt ? moment(createdAt).format('DD/MM/YYYY') : '',
  ];
};

exports.exportAuxiliaries = async (credentials) => {
  const companyId = get(credentials, 'company._id', null);
  const roles = await Role.find({ name: { $in: AUXILIARY_ROLES } }).lean();
  const roleIds = roles.map(role => role._id);
  const auxiliaries = await User
    .find({ 'role.client': { $in: roleIds }, company: companyId })
    .populate({ path: 'sector', select: '_id sector', match: { company: companyId } })
    .populate({ path: 'contracts', select: '_id startDate endDate' })
    .populate({ path: 'establishment', select: 'name', match: { company: companyId } })
    .lean({ autopopulate: true, virtuals: true });
  const data = [auxiliaryExportHeader];

  for (const aux of auxiliaries) {
    const { contracts } = aux;
    if (contracts && contracts.length) {
      for (const contract of contracts) {
        data.push(getDataForAuxiliariesExport(aux, contracts.length, contract));
      }
    } else {
      data.push(getDataForAuxiliariesExport(aux, 0));
    }
  }

  return data;
};

const helperExportHeader = [
  'Email',
  'Téléphone',
  'Id Aidant',
  'Aidant - Nom',
  'Aidant - Prénom',
  'Id Bénéficiaire',
  'Bénéficiaire - Titre',
  'Bénéficiaire - Nom',
  'Bénéficiaire - Prénom',
  'Bénéficiaire - Rue',
  'Bénéficiaire - Code postal',
  'Bénéficiaire - Ville',
  'Date de création',
];

exports.exportHelpers = async (credentials) => {
  const role = await Role.findOne({ name: HELPER }).lean();
  const companyId = get(credentials, 'company._id', null);

  const helpers = await User
    .find({ 'role.client': role._id, company: companyId })
    .populate({
      path: 'customers',
      populate: { path: 'customer', select: 'identity contact' },
      match: { company: companyId },
    })
    .lean();

  const data = [helperExportHeader];
  for (const hel of helpers) {
    const customer = hel.customers && hel.customers.customer;

    data.push([
      get(hel, 'local.email') || '',
      get(hel, 'contact.phone', '') !== '' ? `+33${hel.contact.phone.substring(1)}` : '',
      get(hel, '_id') || '',
      get(hel, 'identity.lastname', '').toUpperCase(),
      get(hel, 'identity.firstname') || '',
      get(customer, '_id') || '',
      CIVILITY_LIST[get(customer, 'identity.title')] || '',
      get(customer, 'identity.lastname', '').toUpperCase(),
      get(customer, 'identity.firstname') || '',
      get(customer, 'contact.primaryAddress.street') || '',
      get(customer, 'contact.primaryAddress.zipCode') || '',
      get(customer, 'contact.primaryAddress.city') || '',
      hel.createdAt ? moment(hel.createdAt).format('DD/MM/YYYY') : '',
    ]);
  }

  return data;
};

const sectorExportHeader = [
  'Equipe',
  'Id Auxiliaire',
  'Nom',
  'Prénom',
  'Date d\'arrivée dans l\'équipe',
  'Date de départ de l\'équipe',
];

exports.exportSectors = async (credentials) => {
  const companyId = get(credentials, 'company._id', null);
  const sectorHistories = await SectorHistory
    .find({ company: companyId, startDate: { $exists: true } })
    .populate({ path: 'sector', select: '_id name' })
    .populate({ path: 'auxiliary', select: '_id identity.firstname identity.lastname' })
    .lean();
  const data = [sectorExportHeader];

  for (const sectorHistory of sectorHistories) {
    data.push([
      get(sectorHistory, 'sector.name', null) || '',
      get(sectorHistory, 'auxiliary._id', null) || '',
      get(sectorHistory, 'auxiliary.identity.lastname', null) || '',
      get(sectorHistory, 'auxiliary.identity.firstname', null) || '',
      moment(sectorHistory.startDate).format('DD/MM/YYYY'),
      sectorHistory.endDate ? moment(sectorHistory.endDate).format('DD/MM/YYYY') : '',
    ]);
  }

  return data;
};

const staffRegisterHeader = [
  'Id Auxiliaire',
  'Nom',
  'Prénom',
  'Civilité',
  'Date de naissance',
  'Nationalité',
  'Emploi',
  'Type de contrat',
  'Date de début',
  'Date de fin',
];

exports.exportStaffRegister = async (credentials) => {
  const staffRegister = await ContractRepository.getStaffRegister(credentials.company._id);

  const rows = [staffRegisterHeader];
  for (const contract of staffRegister) {
    const birthDate = get(contract, 'user.identity.birthDate');

    rows.push([
      get(contract, 'user._id') || '',
      get(contract, 'user.identity.lastname', '').toUpperCase(),
      get(contract, 'user.identity.firstname') || '',
      CIVILITY_LIST[get(contract, 'user.identity.title')] || '',
      birthDate ? moment(birthDate).format('DD/MM/YYYY') : '',
      nationalities[get(contract, 'user.identity.nationality')] || '',
      'Auxiliaire de vie',
      'CDI',
      moment(contract.startDate).format('DD/MM/YYYY'),
      contract.endDate ? moment(contract.endDate).format('DD/MM/YYYY') : '',
    ]);
  }

  return rows;
};

const referentsHeader = [
  'Id Bénéficiaire',
  'Bénéficiaire - Titre',
  'Bénéficiaire - Nom',
  'Bénéficiaire - Prénom',
  'Id Auxiliaire',
  'Auxiliaire - Titre',
  'Auxiliaire - Nom',
  'Auxiliaire - Prénom',
  'Date de début',
  'Date de fin',
];

exports.exportReferents = async (credentials) => {
  const referentsHistories = await ReferentHistory.find({ company: get(credentials, 'company._id', '') })
    .populate('auxiliary')
    .populate('customer')
    .lean();

  const rows = [referentsHeader];
  for (const referentHistory of referentsHistories) {
    rows.push([
      get(referentHistory, 'customer._id') || '',
      CIVILITY_LIST[get(referentHistory, 'customer.identity.title')] || '',
      get(referentHistory, 'customer.identity.lastname', '').toUpperCase(),
      get(referentHistory, 'customer.identity.firstname') || '',
      get(referentHistory, 'auxiliary._id') || '',
      CIVILITY_LIST[get(referentHistory, 'auxiliary.identity.title')] || '',
      get(referentHistory, 'auxiliary.identity.lastname', '').toUpperCase(),
      get(referentHistory, 'auxiliary.identity.firstname') || '',
      moment(referentHistory.startDate).format('DD/MM/YYYY'),
      referentHistory.endDate ? moment(referentHistory.endDate).format('DD/MM/YYYY') : '',
    ]);
  }

  return rows;
};

const serviceHeader = [
  'Nature',
  'Entreprise',
  'Nom',
  'Montant unitaire par défaut',
  'TVA (%)',
  'Plan de majoration',
  'Date de début',
  'Date de création',
  'Date de mise a jour',
];

exports.exportServices = async (credentials) => {
  const companyId = get(credentials, 'company._id', null);
  const services = await Service.find({ company: companyId })
    .populate('company')
    .populate({ path: 'versions.surcharge', match: { company: companyId } })
    .lean();
  const data = [serviceHeader];

  for (const service of services) {
    const lastVersion = UtilsHelper.getLastVersion(service.versions, 'startDate');
    data.push([
      SERVICE_NATURES.find(nat => nat.value === service.nature).label,
      service.company.name,
      lastVersion.name,
      UtilsHelper.formatFloatForExport(lastVersion.defaultUnitAmount),
      UtilsHelper.formatFloatForExport(lastVersion.vat),
      lastVersion.surcharge ? lastVersion.surcharge.name : '',
      moment(lastVersion.startDate).format('DD/MM/YYYY'),
      moment(service.createdAt).format('DD/MM/YYYY'),
      moment(service.updatedAt).format('DD/MM/YYYY')]);
  }

  return data;
};

const subscriptionExportHeader = [
  'Id Bénéficiaire',
  'Titre',
  'Nom',
  'Prénom',
  'Service',
  'Prix unitaire TTC',
  'Volume hebdomadaire estimatif',
  'Dont soirées',
  'Dont dimanches',
];

exports.exportSubscriptions = async (credentials) => {
  const customers = await Customer
    .find({ subscriptions: { $exists: true, $not: { $size: 0 } }, company: get(credentials, 'company._id', null) })
    .populate({ path: 'subscriptions.service' })
    .lean();
  const data = [subscriptionExportHeader];

  for (const cus of customers) {
    for (const sub of cus.subscriptions) {
      const lastServiceVersion = UtilsHelper.getLastVersion(sub.service.versions, 'startDate');
      const lastVersion = UtilsHelper.getLastVersion(sub.versions, 'createdAt');

      data.push([
        get(cus, '_id') || '',
        CIVILITY_LIST[get(cus, 'identity.title')] || '',
        get(cus, 'identity.lastname', '').toUpperCase() || '',
        get(cus, 'identity.firstname', '') || '',
        lastServiceVersion ? lastServiceVersion.name : '',
        lastVersion ? UtilsHelper.formatFloatForExport(lastVersion.unitTTCRate) : '',
        lastVersion ? UtilsHelper.formatFloatForExport(lastVersion.estimatedWeeklyVolume) : '',
        lastVersion ? get(lastVersion, 'evenings', '') : '',
        lastVersion ? get(lastVersion, 'sundays', '') : '',
      ]);
    }
  }

  return data;
};

const fundingExportHeader = [
  'Id Bénéficiaire',
  'Titre',
  'Nom',
  'Prénom',
  'Id tiers payeur',
  'Tiers payeur',
  'Nature',
  'Service',
  'Date de début',
  'Date de fin',
  'Numéro de dossier',
  'Fréquence',
  'Montant TTC',
  'Montant unitaire TTC',
  'Nombre d\'heures',
  'Jours',
  'Participation du bénéficiaire',
];

exports.exportFundings = async (credentials) => {
  const customerFundings = await CustomerRepository.getCustomerFundings(get(credentials, 'company._id', null));
  const data = [fundingExportHeader];

  for (const cus of customerFundings) {
    const funding = UtilsHelper.mergeLastVersionWithBaseObject(cus.funding, 'createdAt');
    const nature = FUNDING_NATURES.find(nat => nat.value === funding.nature);
    const lastServiceVersion = has(funding, 'subscription.service.versions')
      ? UtilsHelper.getLastVersion(funding.subscription.service.versions, 'startDate')
      : null;
    const frequency = FUNDING_FREQUENCIES.find(freq => freq.value === funding.frequency);
    let careDays = '';
    if (funding.careDays) {
      careDays = funding.careDays.map(dayIndex => DAYS_INDEX[dayIndex]).join(' ');
    }

    data.push([
      cus._id || '',
      CIVILITY_LIST[get(cus, 'identity.title')] || '',
      get(cus, 'identity.lastname', '').toUpperCase() || '',
      get(cus, 'identity.firstname', '') || '',
      get(funding, 'thirdPartyPayer._id') || '',
      get(funding, 'thirdPartyPayer.name') || '',
      nature ? nature.label : '',
      lastServiceVersion ? lastServiceVersion.name : '',
      funding.startDate ? moment(funding.startDate).format('DD/MM/YYYY') : '',
      funding.endDate ? moment(funding.endDate).format('DD/MM/YYYY') : '',
      funding.folderNumber || '',
      frequency ? frequency.label : '',
      UtilsHelper.formatFloatForExport(funding.amountTTC),
      UtilsHelper.formatFloatForExport(funding.unitTTCRate),
      UtilsHelper.formatFloatForExport(funding.careHours),
      careDays || '',
      UtilsHelper.formatFloatForExport(funding.customerParticipationRate),
    ]);
  }

  return data;
};
