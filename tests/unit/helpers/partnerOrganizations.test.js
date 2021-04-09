const sinon = require('sinon');
const { ObjectID } = require('mongodb');
const PartnerOrganization = require('../../../src/models/PartnerOrganization');
const PartnerOrganizationsHelper = require('../../../src/helpers/partnerOrganizations');
const SinonMongoose = require('../sinonMongoose');

describe('create', () => {
  let create;
  beforeEach(() => {
    create = sinon.stub(PartnerOrganization, 'create');
  });
  afterEach(() => {
    create.restore();
  });

  it('should create partner organization', async () => {
    const credentials = { company: { _id: new ObjectID() } };
    const payload = {
      name: 'Etchebest Corporation',
      phone: '0123456789',
      email: 'sku@alenvi.io',
      address: {
        fullAddress: '24 avenue Daumesnil 75012 Paris',
        zipCode: '75012',
        city: 'Paris',
        street: '24 avenue Daumesnil',
        location: { type: 'Point', coordinates: [2.377133, 48.801389] },
      },
    };

    await PartnerOrganizationsHelper.create(payload, credentials);

    sinon.assert.calledOnceWithExactly(
      create,
      {
        name: 'Etchebest Corporation',
        phone: '0123456789',
        email: 'sku@alenvi.io',
        address: {
          fullAddress: '24 avenue Daumesnil 75012 Paris',
          zipCode: '75012',
          city: 'Paris',
          street: '24 avenue Daumesnil',
          location: { type: 'Point', coordinates: [2.377133, 48.801389] },
        },
        company: credentials.company._id,
      }
    );
  });
});

describe('list', () => {
  let find;
  beforeEach(() => {
    find = sinon.stub(PartnerOrganization, 'find');
  });
  afterEach(() => {
    find.restore();
  });

  it('should list partner organizations from my company', async () => {
    const credentials = { company: { _id: new ObjectID() } };

    find.returns(SinonMongoose.stubChainedQueries([[{ _id: new ObjectID(), name: 'skusku' }]], ['lean']));

    await PartnerOrganizationsHelper.list(credentials);

    SinonMongoose.calledWithExactly(
      find,
      [{ query: 'find', args: [{ company: credentials.company._id }] }, { query: 'lean' }]
    );
  });
});

describe('getById', () => {
  let findOne;
  beforeEach(() => {
    findOne = sinon.stub(PartnerOrganization, 'findOne');
  });
  afterEach(() => {
    findOne.restore();
  });

  it('should update a partner organizations', async () => {
    const partnerOrganizationId = new ObjectID();

    findOne.returns(SinonMongoose.stubChainedQueries([[{ _id: partnerOrganizationId, name: 'skusku' }]], ['lean']));

    await PartnerOrganizationsHelper.getById(partnerOrganizationId);

    SinonMongoose.calledWithExactly(
      findOne,
      [{ query: 'findOne', args: [{ _id: partnerOrganizationId }] }, { query: 'lean' }]
    );
  });
});

describe('update', () => {
  let updateOne;
  beforeEach(() => {
    updateOne = sinon.stub(PartnerOrganization, 'updateOne');
  });
  afterEach(() => {
    updateOne.restore();
  });

  it('should update a partner organizations', async () => {
    const payload = { name: 'skusku' };
    const partnerOrganizationId = new ObjectID();

    await PartnerOrganizationsHelper.update(partnerOrganizationId, payload);

    sinon.assert.calledOnceWithExactly(updateOne, { _id: partnerOrganizationId }, { $set: { name: 'skusku' } });
  });
});
