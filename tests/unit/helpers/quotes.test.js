const { ObjectID } = require('mongodb');
const sinon = require('sinon');
const expect = require('expect');
const SinonMongoose = require('../sinonMongoose');
const Customer = require('../../../src/models/Customer');
const QuoteNumber = require('../../../src/models/QuoteNumber');
const QuoteHelper = require('../../../src/helpers/quotes');

describe('getQuotes', () => {
  let findOne;

  beforeEach(() => {
    findOne = sinon.stub(Customer, 'findOne');
  });

  afterEach(() => {
    findOne.restore();
  });

  it('should get customer quotes', async () => {
    const customerId = '12345678io0';

    findOne.returns(SinonMongoose.stubChainedQueries([], ['lean']));

    await QuoteHelper.getQuotes(customerId);

    SinonMongoose.calledWithExactly(
      findOne,
      [
        {
          query: 'findOne',
          args: [{ _id: customerId, quotes: { $exists: true } }, { identity: 1, quotes: 1 }, { autopopulate: false }],
        },
        { query: 'lean' },
      ]
    );
  });
});

describe('getQuoteNumber', () => {
  let findOneAndUpdate;

  beforeEach(() => {
    findOneAndUpdate = sinon.stub(QuoteNumber, 'findOneAndUpdate');
  });

  afterEach(() => {
    findOneAndUpdate.restore();
  });

  it('should return quote number', async () => {
    const company = { _id: new ObjectID() };

    findOneAndUpdate.returns(SinonMongoose.stubChainedQueries([], ['lean']));

    await QuoteHelper.getQuoteNumber(company._id);

    SinonMongoose.calledWithExactly(
      findOneAndUpdate,
      [
        {
          query: 'findOneAndUpdate',
          args: [
            { prefix: sinon.match(/\d{4}/), company: company._id },
            {},
            { new: true, upsert: true, setDefaultsOnInsert: true },
          ],
        },
        { query: 'lean' },
      ]
    );
  });
});

describe('formatQuoteNumber', () => {
  it('should format quote number', () => {
    expect(QuoteHelper.formatQuoteNumber(101, '1219', 1)).toBe('DEV-101121900001');
  });

  it('should format quote number with 5 digits', () => {
    expect(QuoteHelper.formatQuoteNumber(101, '1219', 12345)).toBe('DEV-101121912345');
  });
});

describe('createQuote', () => {
  let findOneAndUpdate;
  let updateOne;
  let getQuoteNumberStub;
  let formatQuoteNumberStub;

  beforeEach(() => {
    findOneAndUpdate = sinon.stub(Customer, 'findOneAndUpdate');
    updateOne = sinon.stub(QuoteNumber, 'updateOne');
    getQuoteNumberStub = sinon.stub(QuoteHelper, 'getQuoteNumber');
    formatQuoteNumberStub = sinon.stub(QuoteHelper, 'formatQuoteNumber');
  });
  afterEach(() => {
    findOneAndUpdate.restore();
    updateOne.restore();
    getQuoteNumberStub.restore();
    formatQuoteNumberStub.restore();
  });

  it('should get customer quotes', async () => {
    const customerId = '12345678io0';
    const payload = {
      subscriptions: [{ serviceName: 'Autonomie', unitTTCRate: 24, estimatedWeeklyVolume: 12 }],
    };
    const credentials = { company: { _id: new ObjectID(), prefixNumber: 101 } };

    getQuoteNumberStub.returns({ prefix: 'pre', seq: 2 });
    formatQuoteNumberStub.returns('pre-002');
    findOneAndUpdate.returns(SinonMongoose.stubChainedQueries([], ['lean']));

    await QuoteHelper.createQuote(customerId, payload, credentials);

    sinon.assert.calledOnceWithExactly(getQuoteNumberStub, credentials.company._id);
    sinon.assert.calledOnceWithExactly(formatQuoteNumberStub, credentials.company.prefixNumber, 'pre', 2);
    SinonMongoose.calledWithExactly(
      findOneAndUpdate,
      [
        {
          query: 'findOneAndUpdate',
          args: [
            { _id: customerId },
            { $push: { quotes: { ...payload, quoteNumber: 'pre-002' } } },
            { new: true, select: { identity: 1, quotes: 1 }, autopopulate: false },
          ],
        },
        { query: 'lean' },
      ]
    );
    sinon.assert.calledOnceWithExactly(
      updateOne,
      { prefix: 'pre', company: credentials.company._id }, { $set: { seq: 3 } }
    );
  });
});
