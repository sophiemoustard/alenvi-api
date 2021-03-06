const expect = require('expect');
const moment = require('moment');
const omit = require('lodash/omit');
const sinon = require('sinon');
const { ObjectID } = require('mongodb');
const app = require('../../server');
const {
  paymentsList,
  populateDB,
  paymentCustomerList,
  userFromOtherCompany,
  customerFromOtherCompany,
  tppFromOtherCompany,
} = require('./seed/paymentsSeed');
const { PAYMENT } = require('../../src/helpers/constants');
const translate = require('../../src/helpers/translate');
const Payment = require('../../src/models/Payment');
const PaymentNumber = require('../../src/models/PaymentNumber');
const Drive = require('../../src/models/Google/Drive');
const PaymentHelper = require('../../src/helpers/payments');
const { getToken, getTokenByCredentials, authCompany } = require('./seed/authenticationSeed');

const { language } = translate;

describe('NODE ENV', () => {
  it('should be \'test\'', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('PAYMENTS ROUTES - POST /payments', () => {
  let authToken = null;
  beforeEach(populateDB);

  describe('CLIENT_ADMIN', () => {
    beforeEach(async () => {
      authToken = await getToken('client_admin');
    });

    it('should create a paiment', async () => {
      const payload = {
        date: moment('2019-09-15').toDate(),
        customer: paymentCustomerList[0]._id,
        netInclTaxes: 400,
        nature: PAYMENT,
        type: 'direct_debit',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments',
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.result.message).toBe(translate[language].paymentCreated);
      expect(response.result.data.payment).toEqual(expect.objectContaining(payload));
      expect(response.result.data.payment.number).toBe(`REG-${authCompany.prefixNumber}091900001`);

      const paymentCount = await Payment.countDocuments({ company: authCompany._id });
      expect(paymentCount).toBe(paymentsList.length + 1);
    });

    const falsyAssertions = ['date', 'customer', 'netInclTaxes', 'nature', 'type'];
    falsyAssertions.forEach((param) => {
      it(`should return a 400 error if '${param}' param is missing`, async () => {
        const payload = {
          date: moment('2019-09-15').toDate(),
          customer: paymentCustomerList[0]._id,
          netInclTaxes: 400,
          nature: PAYMENT,
          type: 'direct_debit',
        };

        const res = await app.inject({
          method: 'POST',
          url: '/payments',
          payload: omit(payload, [param]),
          headers: { Cookie: `alenvi_token=${authToken}` },
        });
        expect(res.statusCode).toBe(400);
      });
    });

    it('should not create a payment if customer is not from the same company', async () => {
      const payload = {
        date: moment('2019-09-15').toDate(),
        customer: customerFromOtherCompany._id,
        netInclTaxes: 400,
        nature: PAYMENT,
        type: 'direct_debit',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments',
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should not create a payment if thirdPartyPayer is not from the same company', async () => {
      const payload = {
        date: moment('2019-09-15').toDate(),
        customer: paymentCustomerList[0]._id,
        netInclTaxes: 400,
        nature: PAYMENT,
        type: 'direct_debit',
        thirdPartyPayer: tppFromOtherCompany._id,
      };
      const response = await app.inject({
        method: 'POST',
        url: '/payments',
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('Other roles', () => {
    const roles = [
      { name: 'helper', expectedCode: 403, erp: true },
      { name: 'auxiliary', expectedCode: 403, erp: true },
      { name: 'auxiliary_without_company', expectedCode: 403, erp: true },
      { name: 'coach', expectedCode: 403, erp: true },
      { name: 'client_admin', expectedCode: 403, erp: false },
    ];

    roles.forEach((role) => {
      it(`should return ${role.expectedCode} as user is ${role.name}${role.erp ? '' : ' without erp'}`, async () => {
        authToken = await getToken(role.name, role.erp);
        const payload = {
          date: moment('2019-09-15').toDate(),
          customer: paymentCustomerList[0]._id,
          netInclTaxes: 400,
          nature: PAYMENT,
          type: 'direct_debit',
        };
        const response = await app.inject({
          method: 'POST',
          url: '/payments',
          payload,
          headers: { Cookie: `alenvi_token=${authToken}` },
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});

describe('PAYMENTS ROUTES - POST /payments/createlist', () => {
  let authToken = null;
  const originalPayload = [
    {
      date: moment().toDate(),
      customer: paymentCustomerList[0]._id,
      customerInfo: paymentCustomerList[0],
      netInclTaxes: 900,
      nature: PAYMENT,
      type: 'direct_debit',
      rum: 'R12345678000000345634567',
    },
    {
      date: moment().toDate(),
      customer: paymentCustomerList[1]._id,
      customerInfo: paymentCustomerList[1],
      netInclTaxes: 250,
      nature: PAYMENT,
      type: 'direct_debit',
      rum: 'R12345678000000345634567',
    },
  ];

  describe('Admin with company', () => {
    beforeEach(populateDB);
    let addStub;
    beforeEach(async () => {
      authToken = await getToken('client_admin');
      addStub = sinon.stub(Drive, 'add');
    });
    afterEach(() => {
      addStub.restore();
    });

    it('should create multiple payments', async () => {
      const payload = [...originalPayload];

      const response = await app.inject({
        method: 'POST',
        url: '/payments/createlist',
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const paymentsCount = await Payment.countDocuments({ company: authCompany._id });
      expect(paymentsCount).toBe(paymentsList.length + 2);
      const newPaymentsCount = await Payment.countDocuments({
        number: {
          $in: [
            `REG-${authCompany.prefixNumber}${moment().format('MMYY')}00001`,
            `REG-${authCompany.prefixNumber}${moment().format('MMYY')}00002`,
          ],
        },
        company: authCompany._id,
      });
      expect(newPaymentsCount).toBe(payload.length);
      sinon.assert.called(addStub);
    });

    it('should not create new payment with existing number', async () => {
      const payload = [...originalPayload];
      const formatPaymentNumber = sinon.stub(PaymentHelper, 'formatPaymentNumber');
      const generateXML = sinon.stub(PaymentHelper, 'generateXML');
      formatPaymentNumber.returns(paymentsList[0].number);

      const paymentCountBefore = await Payment.countDocuments({ company: authCompany._id });
      const paymentNumberBefore = await PaymentNumber.findOne({
        prefix: '0319',
        nature: 'payment',
        company: authCompany._id,
      }).lean();

      const response = await app.inject({
        method: 'POST',
        url: '/payments/createlist',
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toEqual(500);

      const paymentCountAfter = await Payment.countDocuments({ company: authCompany._id });
      expect(paymentCountAfter).toEqual(paymentCountBefore);
      const paymentNumberAfter = await PaymentNumber.findOne({
        prefix: '0319',
        nature: 'payment',
        company: authCompany._id,
      }).lean();
      expect(paymentNumberBefore.seq).toEqual(paymentNumberAfter.seq);
      sinon.assert.notCalled(generateXML);
      formatPaymentNumber.restore();
      generateXML.restore();
    });

    it('should not create multiple payments if at least one customer is not from the same company', async () => {
      const payload = [
        { ...originalPayload[0], customer: customerFromOtherCompany._id },
        { ...originalPayload[1] },
      ];
      const response = await app.inject({
        method: 'POST',
        url: '/payments/createlist',
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it('should not create multiple payments if at least one paiement has a tpp', async () => {
      const payload = [
        { ...originalPayload[0], thirdPartyPayer: new ObjectID() },
        { ...originalPayload[1] },
      ];
      const response = await app.inject({
        method: 'POST',
        url: '/payments/createlist',
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('Admin without company', () => {
    beforeEach(populateDB);
    beforeEach(async () => {
      authToken = await getTokenByCredentials(userFromOtherCompany.local);
    });
    it('should not create multiple payments as company credentials are missing', async () => {
      const payload = [
        { ...originalPayload[0], customer: customerFromOtherCompany._id },
        { ...originalPayload[1], customer: customerFromOtherCompany._id },
      ];
      const response = await app.inject({
        method: 'POST',
        url: '/payments/createlist',
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Other roles', () => {
    beforeEach(populateDB);
    const roles = [
      { name: 'helper', expectedCode: 403 },
      { name: 'auxiliary', expectedCode: 403 },
      { name: 'auxiliary_without_company', expectedCode: 403 },
      { name: 'coach', expectedCode: 403 },
    ];

    roles.forEach((role) => {
      it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
        authToken = await getToken(role.name);
        const payload = [...originalPayload];
        const response = await app.inject({
          method: 'POST',
          url: '/payments/createlist',
          payload,
          headers: { Cookie: `alenvi_token=${authToken}` },
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});

describe('PAYMENTS ROUTES - PUT /payments/_id', () => {
  let authToken = null;
  beforeEach(populateDB);

  describe('CLIENT_ADMIN', () => {
    beforeEach(async () => {
      authToken = await getToken('client_admin');
    });

    it('should update payment', async () => {
      const payload = { netInclTaxes: 200, date: '2019-04-16T22:00:00', type: 'direct_debit' };
      const res = await app.inject({
        method: 'PUT',
        url: `/payments/${paymentsList[0]._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.payment.netInclTaxes).toEqual(payload.netInclTaxes);
      expect(res.result.data.payment.date).toBeDefined();
      expect(res.result.data.payment.type).toEqual(payload.type);
    });

    it('should return 404 as payment is not found', async () => {
      const invalidId = new ObjectID();
      const payload = { netInclTaxes: 200, date: '2019-04-16T22:00:00', type: 'direct_debit' };
      const res = await app.inject({
        method: 'PUT',
        url: `/payments/${invalidId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });
      expect(res.statusCode).toBe(404);
    });

    const falsyAssertions = ['date', 'netInclTaxes', 'type'];
    falsyAssertions.forEach((param) => {
      it(`should return a 400 error if '${param}' param is missing`, async () => {
        const payload = { netInclTaxes: 200, date: '2019-04-16T22:00:00', type: 'direct_debit' };
        const res = await app.inject({
          method: 'PUT',
          url: `/payments/${paymentsList[0]._id}`,
          headers: { Cookie: `alenvi_token=${authToken}` },
          payload: omit(payload, [param]),
        });

        expect(res.statusCode).toBe(400);
      });
    });

    it('should not update payment if user is not from the same company', async () => {
      authToken = await getTokenByCredentials(userFromOtherCompany.local);
      const payload = { netInclTaxes: 200, date: '2019-04-16T22:00:00', type: 'direct_debit' };
      const res = await app.inject({
        method: 'PUT',
        url: `/payments/${paymentsList[0]._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Other roles', () => {
    const roles = [
      { name: 'helper', expectedCode: 403 },
      { name: 'auxiliary', expectedCode: 403 },
      { name: 'auxiliary_without_company', expectedCode: 403 },
      { name: 'coach', expectedCode: 403 },
    ];

    roles.forEach((role) => {
      it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
        authToken = await getToken(role.name);
        const payload = { netInclTaxes: 200, date: '2019-04-16T22:00:00', type: 'direct_debit' };
        const response = await app.inject({
          method: 'PUT',
          url: `/payments/${paymentsList[0]._id}`,
          headers: { Cookie: `alenvi_token=${authToken}` },
          payload,
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});

describe('PAYMENTS ROUTES - DELETE /payments/_id', () => {
  let authToken = null;
  beforeEach(populateDB);

  describe('CLIENT_ADMIN', () => {
    beforeEach(async () => {
      authToken = await getToken('client_admin');
    });

    it('should remove payment', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/payments/${paymentsList[2]._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      const paymentCount = await Payment.countDocuments();
      expect(paymentCount).toBe(2);
    });

    it('should return 404 if payment does not exist', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/payments/${new ObjectID()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should not remove payment if it is not refund', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/payments/${paymentsList[0]._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should not remove payment if user is not from the same company', async () => {
      authToken = await getTokenByCredentials(userFromOtherCompany.local);

      const res = await app.inject({
        method: 'DELETE',
        url: `/payments/${paymentsList[2]._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Other roles', () => {
    const roles = [
      { name: 'helper', expectedCode: 403 },
      { name: 'auxiliary', expectedCode: 403 },
      { name: 'coach', expectedCode: 403 },
    ];

    roles.forEach((role) => {
      it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
        authToken = await getToken(role.name);
        const payload = { netInclTaxes: 200, date: '2019-04-16T22:00:00', type: 'direct_debit' };
        const response = await app.inject({
          method: 'PUT',
          url: `/payments/${paymentsList[2]._id}`,
          headers: { Cookie: `alenvi_token=${authToken}` },
          payload,
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});
