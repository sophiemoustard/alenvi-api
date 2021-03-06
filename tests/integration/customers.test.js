const path = require('path');
const expect = require('expect');
const { ObjectID } = require('mongodb');
const moment = require('moment');
const sinon = require('sinon');
const pick = require('lodash/pick');
const omit = require('lodash/omit');
const has = require('lodash/has');
const cloneDeep = require('lodash/cloneDeep');
const GetStream = require('get-stream');
const fs = require('fs');
const { generateFormData } = require('./utils');

const app = require('../../server');
const {
  populateDB,
  otherCompanyCustomer,
  customersList,
  userList,
  customerServiceList,
  customerThirdPartyPayers,
} = require('./seed/customersSeed');
const Customer = require('../../src/models/Customer');
const ESign = require('../../src/models/ESign');
const Drive = require('../../src/models/Google/Drive');
const Helper = require('../../src/models/Helper');
const { MONTHLY, FIXED, HOURLY, DEATH } = require('../../src/helpers/constants');
const { getToken, getTokenByCredentials, authCompany, otherCompany } = require('./seed/authenticationSeed');
const FileHelper = require('../../src/helpers/file');
const DocxHelper = require('../../src/helpers/docx');

describe('NODE ENV', () => {
  it('should be \'test\'', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('CUSTOMERS ROUTES', () => {
  let authToken;
  beforeEach(populateDB);
  beforeEach(async () => {
    authToken = await getToken('client_admin');
  });

  describe('POST /customers', () => {
    let addStub;
    beforeEach(() => {
      addStub = sinon.stub(Drive, 'add');
    });
    afterEach(() => {
      addStub.restore();
    });

    const payload = {
      identity: { title: 'mr', lastname: 'leboncoin' },
      contact: {
        primaryAddress: {
          street: '37 rue de Ponthieu',
          zipCode: '75008',
          city: 'Paris',
          fullAddress: '37 rue de Ponthieu 75008 Paris',
          location: { type: 'Point', coordinates: [2.0987, 1.2345] },
        },
      },
    };

    it('should create a new customer', async () => {
      const customersBefore = await Customer.countDocuments({ company: authCompany._id }).lean();
      addStub.returns({ id: '1234567890', webViewLink: 'http://qwertyuiop' });

      const res = await app.inject({
        method: 'POST',
        url: '/customers',
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(pick(res.result.data.customer.toObject(), ['company', 'identity', 'contact'])).toMatchObject({
        company: authCompany._id,
        identity: { lastname: payload.identity.lastname },
        contact: {
          primaryAddress: {
            street: payload.contact.primaryAddress.street,
            zipCode: payload.contact.primaryAddress.zipCode,
            city: payload.contact.primaryAddress.city,
            fullAddress: payload.contact.primaryAddress.fullAddress,
            location: payload.contact.primaryAddress.location,
          },
        },
      });
      expect(res.result.data.customer.payment.mandates).toBeDefined();
      expect(res.result.data.customer.payment.mandates.length).toEqual(1);
      expect(res.result.data.customer.payment.mandates[0].rum).toBeDefined();
      expect(res.result.data.customer.driveFolder).toEqual({ driveId: '1234567890', link: 'http://qwertyuiop' });
      const customers = await Customer.find({ company: authCompany._id }).lean();
      expect(customers).toHaveLength(customersBefore + 1);
    });

    const missingParams = [
      'identity.lastname',
      'identity.title',
      'contact.primaryAddress.street',
      'contact.primaryAddress.zipCode',
      'contact.primaryAddress.city',
      'contact.primaryAddress.fullAddress',
      'contact.primaryAddress.location.type',
      'contact.primaryAddress.location.coordinates',
    ];
    missingParams.forEach((paramPath) => {
      it(`should return a 400 error if missing '${paramPath}' parameter`, async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/customers',
          payload: omit(cloneDeep(payload), paramPath),
          headers: { Cookie: `alenvi_token=${authToken}` },
        });
        expect(res.statusCode).toBe(400);
      });
    });

    describe('Other roles', () => {
      const roles = [
        { name: 'helper', expectedCode: 403, erp: true },
        { name: 'auxiliary', expectedCode: 403, erp: true },
        { name: 'auxiliary_without_company', expectedCode: 403, erp: true },
        { name: 'coach', expectedCode: 200, erp: true },
        { name: 'client_admin', expectedCode: 403, erp: false },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}${role.erp ? '' : ' without erp'}`, async () => {
          authToken = await getToken(role.name, role.erp);
          addStub.returns({ id: '1234567890', webViewLink: 'http://qwertyuiop' });

          const response = await app.inject({
            method: 'POST',
            url: '/customers',
            payload,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('GET /customers', () => {
    it('should get all customers', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/customers',
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      const areAllCustomersFromCompany = res.result.data.customers
        .every(customer => customer.company.toHexString() === authCompany._id.toHexString());
      expect(areAllCustomersFromCompany).toBe(true);
      const customers = await Customer.find({ company: authCompany._id }).lean();
      expect(res.result.data.customers).toHaveLength(customers.length);
    });

    describe('Other roles', () => {
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 200 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'GET',
            url: '/customers',
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });

    it('should get only customers from the company', async () => {
      authToken = await getTokenByCredentials(userList[4].local);
      const res = await app.inject({
        method: 'GET',
        url: '/customers',
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      const areAllCustomersFromCompany = res.result.data.customers
        .every(customer => customer.company._id.toHexString() === otherCompany._id.toHexString());
      expect(areAllCustomersFromCompany).toBe(true);
      expect(res.result.data.customers).toHaveLength(1);
    });
  });

  describe('GET /customers/first-intervention', () => {
    it('should get all customers with first intervention info', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/customers/first-intervention',
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      const customers = await Customer.find({ company: authCompany._id }).lean();
      expect(Object.values(res.result.data.customers)).toHaveLength(customers.length);
      expect(Object.values(res.result.data.customers).every(cus => has(cus, 'firstIntervention'))).toBeTruthy();
    });

    describe('Other roles', () => {
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 200 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'GET',
            url: '/customers',
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });

    it('should get only customers from the company with first intervention info', async () => {
      authToken = await getTokenByCredentials(userList[4].local);
      const res = await app.inject({
        method: 'GET',
        url: '/customers/first-intervention',
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(Object.values(res.result.data.customers)).toHaveLength(1);
      expect(Object.values(res.result.data.customers).every(cus => has(cus, 'firstIntervention'))).toBeTruthy();
    });
  });

  describe('GET /customers/billed-events', () => {
    it('should get all customers with billed events', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/customers/billed-events',
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customers).toBeDefined();
      expect(res.result.data.customers[0].subscriptions).toBeDefined();
      expect(res.result.data.customers[0].subscriptions.length).toEqual(1);
      expect(res.result.data.customers[0].thirdPartyPayers).toBeDefined();
      expect(res.result.data.customers[0].thirdPartyPayers.length).toEqual(1);
    });

    describe('Other roles', () => {
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'GET',
            url: '/customers/billed-events',
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });

    it('should get only customers with billed events from the company', async () => {
      authToken = await getTokenByCredentials(userList[4].local);
      const res = await app.inject({
        method: 'GET',
        url: '/customers/billed-events',
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customers).toBeDefined();
      const areAllCustomersFromCompany = res.result.data.customers.every(async (customer) => {
        const customerFromDB = await Customer.find({ _id: customer._id, company: otherCompany._id });
        return customerFromDB;
      });
      expect(areAllCustomersFromCompany).toBe(true);
    });
  });

  describe('GET /customers/subscriptions', () => {
    it('should get all customers with subscriptions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/customers/subscriptions',
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customers.every(cus => cus.subscriptions.length > 0)).toBeTruthy();
      expect(res.result.data.customers.length).toEqual(7);
      expect(res.result.data.customers[0].contact).toBeDefined();
      const customer = res.result.data.customers
        .find(cus => cus._id.toHexString() === customersList[0]._id.toHexString());
      expect(customer.subscriptions.length).toEqual(2);
      expect(customer.referentHistories.length).toEqual(2);
    });

    describe('Other roles', () => {
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 200 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'GET',
            url: '/customers/subscriptions',
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });

    it('should get only customers with subscriptions from the company', async () => {
      authToken = await getTokenByCredentials(userList[4].local);
      const res = await app.inject({
        method: 'GET',
        url: '/customers/subscriptions',
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customers).toBeDefined();
      const areAllCustomersFromCompany = res.result.data.customers
        .every(async (cus) => {
          const customer = await Customer.findOne({ _id: cus._id }).lean();
          return customer.company.toHexString() === otherCompany._id.toHexString();
        });
      expect(areAllCustomersFromCompany).toBe(true);
    });
  });

  describe('GET /customer/with-intervention', () => {
    it('should get all customers with at least one intervention', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/customers/with-intervention',
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customers).toBeDefined();
      expect(res.result.data.customers).toHaveLength(1);
    });

    describe('Other roles', () => {
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 200 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'GET',
            url: '/customers/with-intervention',
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('GET /customers/{id}', () => {
    it('should return customer', async () => {
      const customerId = customersList[0]._id;
      const res = await app.inject({
        method: 'GET',
        url: `/customers/${customerId.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customer).toMatchObject({
        _id: customerId,
        subscriptions: [
          {
            ...customersList[0].subscriptions[0],
            service: {
              defaultUnitAmount: 12,
              name: 'Service 1',
              startDate: new Date('2019-01-16 17:58:15'),
              vat: 12,
              nature: HOURLY,
            },
          },
          {
            ...customersList[0].subscriptions[1],
            service: {
              defaultUnitAmount: 24,
              name: 'Service 2',
              startDate: new Date('2019-01-18 19:58:15'),
              vat: 12,
              nature: HOURLY,
            },
          },
        ],
        subscriptionsAccepted: true,
        referent: {
          identity: { firstname: 'Referent', lastname: 'Test', title: 'mr' },
          contact: { phone: '0987654321' },
          picture: { publicId: '1234', link: 'test' },
        },
      });
    });

    it('should return a 404 error if customer is not found', async () => {
      const id = new ObjectID().toHexString();
      const res = await app.inject({
        method: 'GET',
        url: `/customers/${id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return a 403 error if customer is not from the same company', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/customers/${otherCompanyCustomer._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      it('should return the customer if I am its helper', async () => {
        const helper = userList[0];
        authToken = await getTokenByCredentials(helper.local);
        const res = await app.inject({
          method: 'GET',
          url: `/customers/${helper.customers[0]}`,
          headers: { Cookie: `alenvi_token=${authToken}` },
        });
        expect(res.statusCode).toBe(200);
      });

      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 200 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'GET',
            url: `/customers/${customersList[0]._id.toHexString()}`,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('PUT /customers/{id}', () => {
    const updatePayload = {
      identity: {
        firstname: 'seloger',
        lastname: 'pap',
      },
    };

    it('should update a customer', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customersList[0]._id.toHexString()}`,
        payload: updatePayload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customer).toEqual(expect.objectContaining({
        identity: expect.objectContaining({
          firstname: updatePayload.identity.firstname,
          lastname: updatePayload.identity.lastname,
        }),
      }));
      const updatedCustomer = await Customer.findById(customersList[0]._id);
      expect(updatedCustomer).toEqual(expect.objectContaining({
        identity: expect.objectContaining({
          firstname: updatePayload.identity.firstname,
          lastname: updatePayload.identity.lastname,
        }),
      }));
    });

    it('should not create new rum if iban is set for the first time', async () => {
      const customer = customersList[2];
      const ibanPayload = { payment: { iban: 'FR2230066783676514892821545' } };
      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload: ibanPayload,
      });

      expect(result.statusCode).toBe(200);
      expect(result.result.data.customer.payment.mandates).toBeDefined();
      expect(result.result.data.customer.payment.mandates.length).toEqual(1);
    });

    it('should create new rum if iban updated', async () => {
      const customer = customersList[1];
      const ibanPayload = { payment: { iban: 'FR2230066783676514892821545' } };
      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload: ibanPayload,
      });

      expect(result.statusCode).toBe(200);
      expect(result.result.data.customer.payment.mandates).toBeDefined();
      expect(result.result.data.customer.payment.mandates.length).toEqual(2);
      expect(result.result.data.customer.payment.mandates[1].rum).toBeDefined();
    });

    it('should update secondaryAddress', async () => {
      const customer = customersList[0];

      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload: {
          contact: {
            secondaryAddress: {
              fullAddress: '27 rue des renaudes 75017 Paris',
              zipCode: '75017',
              city: 'Paris',
              street: '27 rue des renaudes',
              location: { type: 'Point', coordinates: [2.377133, 48.801389] },
            },
          },
        },
      });

      expect(result.statusCode).toBe(200);
      expect(result.result.data.customer.contact.secondaryAddress.fullAddress).toBe('27 rue des renaudes 75017 Paris');
    });

    it('should delete secondaryAddress', async () => {
      const customer = customersList[0];

      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload: { contact: { secondaryAddress: {} } },
      });

      expect(result.statusCode).toBe(200);
      expect(result.result.data.customer.contact.secondaryAddress).not.toBeUndefined();
    });

    it('should update status', async () => {
      const customer = customersList[0];

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id}`,
        payload: { stoppedAt: new Date(), stopReason: DEATH },
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should return a 404 error if no customer found', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${new ObjectID().toHexString()}`,
        payload: updatePayload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return a 400 error if phone number is invalid', async () => {
      const customer = customersList[0];

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id}`,
        payload: { contact: { phone: '123dcsnejnf' } },
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 400 error if missing stopReason or stoppedAt in status update', async () => {
      const customer = customersList[0];

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id}`,
        payload: { stopReason: DEATH },
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 400 error if wrong stop reason', async () => {
      const customer = customersList[0];

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id}`,
        payload: { stoppedAt: new Date(), stopReason: 'test' },
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 403 if already stop', async () => {
      const customer = customersList[9];

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id}`,
        payload: { stoppedAt: new Date(), stopReason: DEATH },
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 403 if stoppedDate before createdAt', async () => {
      const customer = customersList[10];

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id}`,
        payload: { stoppedAt: new Date('2021-05-23'), stopReason: DEATH },
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should not update a customer if from other company', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${otherCompanyCustomer._id}`,
        payload: updatePayload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      it('should update a customer if I am its helper', async () => {
        const helper = userList[0];
        authToken = await getTokenByCredentials(helper.local);
        const res = await app.inject({
          method: 'PUT',
          url: `/customers/${helper.customers[0]}`,
          headers: { Cookie: `alenvi_token=${authToken}` },
          payload: {
            identity: {
              firstname: 'Volgarr',
              lastname: 'Theviking',
            },
          },
        });

        expect(res.statusCode).toBe(200);
      });

      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 200 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'PUT',
            url: `/customers/${customersList[0]._id.toHexString()}`,
            payload: updatePayload,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('DELETE /customers/{id}', () => {
    let deleteFileStub;
    beforeEach(() => {
      deleteFileStub = sinon.stub(Drive, 'deleteFile').resolves({ id: '1234567890' });
    });
    afterEach(() => {
      deleteFileStub.restore();
    });

    it('should delete a customer without interventions', async () => {
      const customersBefore = await Customer.countDocuments({ company: authCompany._id });
      const res = await app.inject({
        method: 'DELETE',
        url: `/customers/${customersList[3]._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      sinon.assert.calledWithExactly(deleteFileStub, { fileId: customersList[3].driveFolder.driveId });

      const customers = await Customer.find({ company: authCompany._id }).lean();
      expect(customers.length).toBe(customersBefore - 1);

      const helper = await Helper.countDocuments({ _id: userList[2]._id });
      expect(helper).toBe(0);
    });

    it('should return a 404 error if no customer found', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/customers/${new ObjectID().toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return a 404 error if customer is not from the same company', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/customers/${otherCompanyCustomer._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return a 403 error if customer has interventions', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/customers/${customersList[0]._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return a 403 error if customer has bills', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/customers/${customersList[4]._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return a 403 error if customer has payments', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/customers/${customersList[5]._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return a 403 error if customer has creditnotes', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/customers/${customersList[6]._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return a 403 error if customer has taxcertificates', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/customers/${customersList[7]._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'DELETE',
            url: `/customers/${customersList[3]._id.toHexString()}`,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('GET /customers/{id}/qrcode', () => {
    it('should return customer\'s qrcode', async () => {
      const result = await app.inject({
        method: 'GET',
        url: `/customers/${customersList[0]._id}/qrcode`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(200);
    });

    it('should return 403 if customer is not from loggedUser\'s company', async () => {
      const result = await app.inject({
        method: 'GET',
        url: `/customers/${otherCompanyCustomer._id}/qrcode`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(403);
    });

    it('should return 404 if customer does not exists', async () => {
      const result = await app.inject({
        method: 'GET',
        url: `/customers/${new ObjectID()}/qrcode`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(404);
    });

    describe('Other roles', () => {
      it('should get QR code if I am its helper ', async () => {
        const helper = userList[0];
        authToken = await getTokenByCredentials(helper.local);
        const res = await app.inject({
          method: 'GET',
          url: `/customers/${customersList[0]._id}/qrcode`,
          headers: { Cookie: `alenvi_token=${authToken}` },
        });

        expect(res.statusCode).toBe(200);
      });

      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 200 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
        { name: 'vendor_admin', expectedCode: 403 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'GET',
            url: `/customers/${customersList[0]._id}/qrcode`,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });
});

describe('CUSTOMER SUBSCRIPTIONS ROUTES', () => {
  let authToken;
  beforeEach(populateDB);
  beforeEach(async () => {
    authToken = await getToken('client_admin');
  });

  describe('POST /customers/{id}/subscriptions', () => {
    it('should add subscription to customer', async () => {
      const customer = customersList[1];
      const payload = {
        service: customerServiceList[1]._id,
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
        }],
      };

      const result = await app.inject({
        method: 'POST',
        url: `/customers/${customer._id.toHexString()}/subscriptions`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toBe(200);
      expect(result.result.data.customer.subscriptions).toBeDefined();
      expect(result.result.data.customer.subscriptions[1].service._id).toEqual(payload.service);
      expect(result.result.data.customer.subscriptions[1].versions[0].unitTTCRate)
        .toEqual(payload.versions[0].unitTTCRate);
    });

    it('should return 403 if service is archived', async () => {
      const customer = customersList[1];
      const payload = {
        service: customerServiceList[2]._id,
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
        }],
      };

      const result = await app.inject({
        method: 'POST',
        url: `/customers/${customer._id.toHexString()}/subscriptions`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toBe(403);
    });

    it('should return 409 if service already subscribed', async () => {
      const customer = customersList[0];
      const payload = {
        service: customer.subscriptions[0].service,
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
        }],
      };

      const result = await app.inject({
        method: 'POST',
        url: `/customers/${customer._id.toHexString()}/subscriptions`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toBe(409);
    });

    it('should return 403 if customer not from company', async () => {
      const customer = customersList[0];
      const payload = {
        service: customer.subscriptions[0].service,
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
        }],
      };

      const result = await app.inject({
        method: 'POST',
        url: `/customers/${otherCompanyCustomer._id}/subscriptions`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const payload = {
        service: customerServiceList[1]._id,
        versions: [{
          unitTTCRate: 12,
          estimatedWeeklyVolume: 12,
          evenings: 2,
          sundays: 1,
        }],
      };

      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'POST',
            url: `/customers/${customersList[1]._id.toHexString()}/subscriptions`,
            headers: { Cookie: `alenvi_token=${authToken}` },
            payload,
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('PUT /customers/{id}/subscriptions/{subscriptionId}', () => {
    const payload = {
      estimatedWeeklyVolume: 24,
      unitTTCRate: 1,
      evenings: 3,
    };

    it('should update customer subscription', async () => {
      const customer = customersList[0];
      const subscription = customer.subscriptions[0];

      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id.toHexString()}/subscriptions/${subscription._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toBe(200);
      expect(result.result.data.customer.subscriptions).toBeDefined();
      expect(result.result.data.customer.subscriptions[0].versions).toBeDefined();
      expect(result.result.data.customer.subscriptions[0].versions.length)
        .toEqual(subscription.versions.length + 1);
    });

    it('should return a 403 if service is archived', async () => {
      const customer = customersList[1];
      const subscription = customer.subscriptions[0];

      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id.toHexString()}/subscriptions/${subscription._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toBe(403);
    });

    it('should return 404 as customer not found', async () => {
      const invalidId = new ObjectID().toHexString();
      const customer = customersList[0];
      const subscription = customer.subscriptions[0];

      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${invalidId}/subscriptions/${subscription._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toBe(404);
    });

    it('should return 404 as subscription not found', async () => {
      const customer = customersList[0];
      const invalidId = new ObjectID().toHexString();

      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id.toHexString()}/subscriptions/${invalidId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toBe(404);
    });

    it('should return 403 if customer not from company', async () => {
      const subscriptionId = otherCompanyCustomer.subscriptions[0]._id;
      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${otherCompanyCustomer._id}/subscriptions/${subscriptionId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const customer = customersList[0];
      const subscription = customer.subscriptions[0];
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'PUT',
            url: `/customers/${customer._id.toHexString()}/subscriptions/${subscription._id.toHexString()}`,
            headers: { Cookie: `alenvi_token=${authToken}` },
            payload,
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('DELETE /customers/{id}/subscriptions/{subscriptionId}', () => {
    it('should delete customer subscription', async () => {
      const customer = customersList[0];
      const subscription = customer.subscriptions[1];

      const result = await app.inject({
        method: 'DELETE',
        url: `/customers/${customer._id.toHexString()}/subscriptions/${subscription._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(200);
    });

    it('should not delete customer subscription if customer not from same company', async () => {
      const subscriptionId = otherCompanyCustomer.subscriptions[0]._id;
      const result = await app.inject({
        method: 'DELETE',
        url: `/customers/${otherCompanyCustomer._id}/subscriptions/${subscriptionId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(403);
    });

    it('should not delete customer subscription if events linked', async () => {
      const customer = customersList[0];
      const subscription = customer.subscriptions[0];

      const result = await app.inject({
        method: 'DELETE',
        url: `/customers/${customer._id.toHexString()}/subscriptions/${subscription._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const customer = customersList[0];
      const subscription = customer.subscriptions[1];
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'DELETE',
            url: `/customers/${customer._id.toHexString()}/subscriptions/${subscription._id.toHexString()}`,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });
});

describe('CUSTOMER MANDATES ROUTES', () => {
  let authToken;
  beforeEach(populateDB);
  beforeEach(async () => {
    authToken = await getToken('client_admin');
  });

  describe('GET /customers/{_id}/mandates', () => {
    it('should return customer mandates', async () => {
      const customer = customersList[1];
      const result = await app.inject({
        method: 'GET',
        url: `/customers/${customer._id}/mandates`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(200);
      expect(result.result.data.customer.payment.mandates).toBeDefined();
      expect(result.result.data.customer.payment.mandates.length).toEqual(customer.payment.mandates.length);
    });

    it('should return 404 if customer not found', async () => {
      const invalidId = new ObjectID().toHexString();
      const result = await app.inject({
        method: 'GET',
        url: `/customers/${invalidId}/mandates`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(404);
    });

    it('should return 403 if customer is from other company', async () => {
      const result = await app.inject({
        method: 'GET',
        url: `/customers/${otherCompanyCustomer._id}/mandates`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const customer = customersList[1];
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'GET',
            url: `/customers/${customer._id}/mandates`,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('PUT /customers/{_id}/mandates/{mandateId}', () => {
    it('should update customer mandate', async () => {
      const customer = customersList[1];
      const mandate = customer.payment.mandates[0];
      const payload = { signedAt: '2019-09-09T00:00:00' };

      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id.toHexString()}/mandates/${mandate._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toEqual(200);
      expect(result.result.data.customer.payment.mandates).toBeDefined();
      expect(result.result.data.customer.payment.mandates[0].signedAt).toBeDefined();
    });

    it('should return 404 if customer not found', async () => {
      const invalidId = new ObjectID().toHexString();
      const mandate = customersList[1].payment.mandates[0];
      const payload = { signedAt: '2019-09-09T00:00:00' };

      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${invalidId}/mandates/${mandate._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toEqual(404);
    });

    it('should return 404 if mandate not found', async () => {
      const invalidId = new ObjectID().toHexString();
      const customer = customersList[1];
      const payload = { signedAt: '2019-09-09T00:00:00' };

      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id.toHexString()}/mandates/${invalidId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toEqual(404);
    });

    it('should return 403 if user not from same company', async () => {
      const payload = { signedAt: '2019-09-09T00:00:00' };
      const mandateId = otherCompanyCustomer.payment.mandates[0]._id;

      const result = await app.inject({
        method: 'PUT',
        url: `/customers/${otherCompanyCustomer._id}/mandates/${mandateId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(result.statusCode).toEqual(403);
    });

    describe('Other roles', () => {
      const customer = customersList[1];
      const mandate = customer.payment.mandates[0];
      const payload = {
        signedAt: '2019-01-18T10:00:00.000Z',
      };

      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'PUT',
            url: `/customers/${customer._id.toHexString()}/mandates/${mandate._id.toHexString()}`,
            headers: { Cookie: `alenvi_token=${authToken}` },
            payload,
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('POST customers/:id/mandates/:id/esign', () => {
    let createDocumentStub;
    let generateDocxStub;
    let fileToBase64Stub;

    beforeEach(() => {
      createDocumentStub = sinon.stub(ESign, 'createDocument');
      generateDocxStub = sinon.stub(DocxHelper, 'generateDocx');
      fileToBase64Stub = sinon.stub(FileHelper, 'fileToBase64');

      createDocumentStub.returns({
        data: {
          document_hash: 'dOcUmEnThAsH',
          signers: [{ embedded_signing_url: 'embeddedSigningUrl<->' }],
        },
      });
      generateDocxStub.returns(path.join(__dirname, 'assets/signature_request.docx'));
      fileToBase64Stub.returns('signature_request');
    });

    afterEach(() => {
      createDocumentStub.restore();
      generateDocxStub.restore();
      fileToBase64Stub.restore();
    });

    const payload = {
      fileId: '1234567',
      customer: {
        name: 'Test',
        email: 'test@test.com',
      },
      fields: {
        title: 'mrs',
        firstname: 'Test',
        lastname: 'Test',
        address: '15 rue du test',
        city: 'Test city',
        zipCode: '34000',
        birthDate: '15/07/88',
        birthCountry: 'France',
        birthState: '93',
        nationality: 'Française',
        SSN: '12345678909876543',
        grossHourlyRate: 24,
        monthlyHours: 56,
        salary: 1500,
        startDate: '18/12/2018',
        weeklyHours: 35,
        yearlyHours: 1200,
        uploadDate: '18/12/2018',
        initialContractStartDate: '16/12/2018',
      },
    };
    const customerId = customersList[1]._id.toHexString();
    const mandateId = customersList[1].payment.mandates[0]._id.toHexString();

    it('should create a mandate signature request if I am its helper', async () => {
      const helper = userList[1];
      authToken = await getTokenByCredentials(helper.local);
      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customerId}/mandates/${mandateId}/esign`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(res.statusCode).toBe(200);
      sinon.assert.calledOnce(createDocumentStub);
      sinon.assert.calledOnce(generateDocxStub);
      sinon.assert.calledOnce(fileToBase64Stub);
      expect(res.statusCode).toBe(200);
      expect(res.result.data.signatureRequest).toEqual(expect.objectContaining({
        embeddedUrl: expect.any(String),
      }));
      const customer = await Customer.findById(customerId);
      expect(customer.payment.mandates[0].everSignId).toBeDefined();
    });

    it('should return 403 if user is not from the same company', async () => {
      const helper = userList[2];
      authToken = await getTokenByCredentials(helper.local);
      const res = await app.inject({
        method: 'POST',
        url: `/customers/${otherCompanyCustomer._id}/mandates/${mandateId}/esign`,
        headers: { Cookie: `alenvi_token=${authToken}` },
        payload,
      });

      expect(res.statusCode).toBe(403);
    });

    const roles = [
      { name: 'helper', expectedCode: 403, callCount: 0 },
      { name: 'client_admin', expectedCode: 403, callCount: 0 },
      { name: 'auxiliary', expectedCode: 403, callCount: 0 },
      { name: 'coach', expectedCode: 403, callCount: 0 },
    ];

    roles.forEach((role) => {
      it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
        authToken = await getToken(role.name);
        const response = await app.inject({
          method: 'POST',
          url: `/customers/${customerId}/mandates/${mandateId}/esign`,
          payload,
          headers: { Cookie: `alenvi_token=${authToken}` },
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});

describe('CUSTOMERS QUOTES ROUTES', () => {
  let authToken;
  beforeEach(populateDB);
  beforeEach(async () => {
    authToken = await getToken('client_admin');
  });

  describe('GET customers/:id/quotes', () => {
    it('should return customer quotes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/customers/${customersList[0]._id.toHexString()}/quotes`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customer).toBeDefined();
      expect(res.result.data.customer.quotes).toBeDefined();
      expect(res.result.data.customer.quotes.length).toEqual(customersList[0].quotes.length);
      expect(res.result.data.customer.quotes[0]._id).toEqual(customersList[0].quotes[0]._id);
      expect(res.result.data.customer._id).toEqual(customersList[0]._id);
    });
    it('should return 404 error if no user found', async () => {
      const invalidId = new ObjectID().toHexString();
      const res = await app.inject({
        method: 'GET',
        url: `/customers/${invalidId}/quotes`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 403 error if user is from other company', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/customers/${otherCompanyCustomer._id}/quotes`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'GET',
            url: `/customers/${customersList[0]._id.toHexString()}/quotes`,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('POST customers/:id/quotes', () => {
    it('should create a customer quote', async () => {
      const payload = {
        subscriptions: [
          { serviceName: 'TestTest', unitTTCRate: 23, estimatedWeeklyVolume: 3 },
          { serviceName: 'TestTest2', unitTTCRate: 30, estimatedWeeklyVolume: 10 },
        ],
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customersList[1]._id.toHexString()}/quotes`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customer).toBeDefined();
      expect(res.result.data.customer.quotes).toBeDefined();
      expect(res.result.data.customer._id).toEqual(customersList[1]._id);
      expect(res.result.data.customer.quotes[0].quoteNumber).toEqual(`DEV-101${moment().format('MMYY')}00001`);
      expect(res.result.data.customer.quotes[0].subscriptions).toEqual(expect.arrayContaining([
        expect.objectContaining(payload.subscriptions[0]),
        expect.objectContaining(payload.subscriptions[1]),
      ]));
    });

    it('should return a 400 error if \'subscriptions\' array is missing from payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customersList[1]._id.toHexString()}/quotes`,
        payload: {},
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should not create a customer quote if from other company', async () => {
      const payload = {
        subscriptions: [{
          serviceName: 'TestTest',
          unitTTCRate: 23,
          estimatedWeeklyVolume: 3,
        }, {
          serviceName: 'TestTest2',
          unitTTCRate: 30,
          estimatedWeeklyVolume: 10,
        }],
      };
      const res = await app.inject({
        method: 'POST',
        url: `/customers/${otherCompanyCustomer._id}/quotes`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const payload = {
        subscriptions: [{
          serviceName: 'TestTest',
          unitTTCRate: 23,
          estimatedWeeklyVolume: 3,
        }, {
          serviceName: 'TestTest2',
          unitTTCRate: 30,
          estimatedWeeklyVolume: 10,
        }],
      };

      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 200 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'POST',
            url: `/customers/${customersList[1]._id.toHexString()}/quotes`,
            payload,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });
});

describe('CUSTOMERS SUBSCRIPTION HISTORY ROUTES', () => {
  let helper;
  let authToken;
  beforeEach(populateDB);
  beforeEach(async () => {
    [helper] = userList;
    authToken = await getTokenByCredentials(helper.local);
  });

  describe('POST customers/:id/subscriptionshistory', () => {
    it('should create a customer subscription history', async () => {
      const payload = {
        subscriptions: [
          { service: 'TestTest', unitTTCRate: 23, estimatedWeeklyVolume: 3 },
          { service: 'TestTest2', unitTTCRate: 30, estimatedWeeklyVolume: 10 },
        ],
        helper: { firstname: 'Emmanuel', lastname: 'Magellan', title: 'mrs' },
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${helper.customers[0].toHexString()}/subscriptionshistory`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customer).toBeDefined();
      expect(res.result.data.customer.subscriptionsHistory[1]).toBeDefined();
      expect(res.result.data.customer._id).toEqual(helper.customers[0]);
      expect(res.result.data.customer.subscriptionsHistory[1].subscriptions).toEqual(expect.arrayContaining([
        expect.objectContaining(payload.subscriptions[0]),
        expect.objectContaining(payload.subscriptions[1]),
      ]));
      expect(res.result.data.customer.subscriptionsHistory[1].helper).toEqual(expect.objectContaining(payload.helper));
      expect(res.result.data.customer.subscriptionsHistory[1].approvalDate).toEqual(expect.any(Date));
    });

    it('should return a 400 error if \'subscriptions\' array is missing from payload', async () => {
      const payload = { helper: { firstname: 'Emmanuel', lastname: 'Magellan', title: 'mrs' } };
      const res = await app.inject({
        method: 'POST',
        url: `/customers/${helper.customers[0].toHexString()}/subscriptionshistory`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 400 error if \'helper\' object is missing from payload', async () => {
      const payload = {
        subscriptions: [
          { service: 'TestTest', unitTTCRate: 23, estimatedWeeklyVolume: 3 },
          { service: 'TestTest2', unitTTCRate: 30, estimatedWeeklyVolume: 10 }],
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${helper.customers[0].toHexString()}/subscriptionshistory`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 403 error if user is not from the same company', async () => {
      const payload = {
        subscriptions: [{
          service: 'TestTest',
          unitTTCRate: 23,
          estimatedWeeklyVolume: 3,
        }, {
          service: 'TestTest2',
          unitTTCRate: 30,
          estimatedWeeklyVolume: 10,
        }],
        helper: {
          firstname: 'Emmanuel',
          lastname: 'Magellan',
          title: 'mrs',
        },
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${otherCompanyCustomer._id}/subscriptionshistory`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const payload = {
        subscriptions: [{
          service: 'TestTest',
          unitTTCRate: 23,
          estimatedWeeklyVolume: 3,
        }, {
          service: 'TestTest2',
          unitTTCRate: 30,
          estimatedWeeklyVolume: 10,
        }],
        helper: {
          firstname: 'Lana',
          lastname: 'Wachowski',
          title: 'mrs',
        },
      };
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
        { name: 'auxiliary_without_company', expectedCode: 403 },
        { name: 'coach', expectedCode: 403 },
        { name: 'client_admin', expectedCode: 403 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'POST',
            url: `/customers/${customersList[0]._id.toHexString()}/subscriptionshistory`,
            payload,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });
});

describe('CUSTOMERS FUNDINGS ROUTES', () => {
  let authToken;
  beforeEach(populateDB);
  beforeEach(async () => {
    authToken = await getToken('coach');
  });

  describe('POST customers/:id/fundings', () => {
    it('should create a customer funding', async () => {
      const customer = customersList[0];
      const payload = {
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayers[0]._id,
        subscription: customer.subscriptions[1]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          endDate: '2021-03-01T23:59:59',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customer._id.toHexString()}/fundings`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customer.fundings.length).toEqual(2);
    });

    it('should return a 409 error if subscription is used by another funding', async () => {
      const customer = customersList[0];
      const payload = {
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayers[0]._id,
        subscription: customer.subscriptions[0]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customer._id.toHexString()}/fundings`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(409);
    });

    it('should return a 400 error if \'subscriptions\' is missing from payload', async () => {
      const payload = {
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayers[0]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          endDate: '2021-03-01T23:59:59',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customersList[0]._id.toHexString()}/fundings`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 400 error if \'endDate\' is before \'startDate\'', async () => {
      const payload = {
        nature: FIXED,
        subscription: customersList[0].subscriptions[0]._id,
        thirdPartyPayer: customerThirdPartyPayers[0]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          endDate: '2020-03-01T23:59:59',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customersList[0]._id.toHexString()}/fundings`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 400 error if \'thirdPartyPayer\' is missing from payload', async () => {
      const payload = {
        nature: FIXED,
        subscription: customersList[0].subscriptions[0]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          endDate: '2021-03-01T23:59:59',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customersList[0]._id.toHexString()}/fundings`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 404 error if customer does not exist', async () => {
      const invalidId = new ObjectID().toHexString();
      const payload = {
        subscription: customersList[0].subscriptions[0]._id,
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayers[0]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          endDate: '2021-03-01T23:59:59',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${invalidId}/fundings`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return a 403 error if customer is not from the same company', async () => {
      const payload = {
        subscription: customersList[0].subscriptions[0]._id,
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayers[0]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          endDate: '2021-03-01T23:59:59',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${otherCompanyCustomer._id}/fundings`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return a 400 error if fundingPlanId is missing and thirdPartyPayer has teletransmissionId', async () => {
      const payload = {
        subscription: customersList[0].subscriptions[0]._id,
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayers[1]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          endDate: '2021-03-01T23:59:59',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customersList[0]._id.toHexString()}/fundings`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 400 if fundingPlanId is not a string', async () => {
      const payload = {
        subscription: customersList[0].subscriptions[0]._id,
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayers[1]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          endDate: '2021-03-01T23:59:59',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
        fundingPlanId: 12345,
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customersList[0]._id.toHexString()}/fundings`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 403 if fundingPlanId in payload but thirdPartyPayer has no teletransmissionId', async () => {
      const payload = {
        subscription: customersList[0].subscriptions[0]._id,
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayers[0]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          endDate: '2021-03-01T23:59:59',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
        fundingPlanId: '12345',
      };

      const res = await app.inject({
        method: 'POST',
        url: `/customers/${customersList[0]._id.toHexString()}/fundings`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const customer = customersList[0];
      const payload = {
        nature: FIXED,
        thirdPartyPayer: customerThirdPartyPayers[0]._id,
        subscription: customer.subscriptions[1]._id,
        frequency: MONTHLY,
        versions: [{
          folderNumber: 'D123456',
          startDate: '2021-01-01T00:00:00',
          endDate: '2021-03-01T23:59:59',
          amountTTC: 120,
          customerParticipationRate: 10,
          careDays: [2, 5],
        }],
      };
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'POST',
            url: `/customers/${customer._id.toHexString()}/fundings`,
            payload,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('PUT customers/:id/fundings', () => {
    it('should update a customer funding', async () => {
      const customer = customersList[0];
      const payload = {
        subscription: customer.subscriptions[0]._id,
        amountTTC: 90,
        customerParticipationRate: 20,
        startDate: '2021-01-01T00:00:00',
        endDate: '2021-03-01T23:59:59',
        careDays: [1, 3],
        fundingPlanId: '12345',
      };

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id.toHexString()}/fundings/${customer.fundings[0]._id.toHexString()}`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.result.data.customer).toBeDefined();
      expect(res.result.data.customer.fundings[0]).toBeDefined();
      expect(res.result.data.customer._id).toEqual(customer._id);
      expect(res.result.data.customer.fundings[0].versions.length).toBe(2);
    });

    it('should return 400 if endDate is before startDate', async () => {
      const customer = customersList[0];
      const payload = {
        subscription: customer.subscriptions[0]._id,
        amountTTC: 90,
        customerParticipationRate: 20,
        startDate: '2021-01-01T00:00:00',
        endDate: '2020-03-01T23:59:59',
        careDays: [1, 3],
      };

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id.toHexString()}/fundings/${customer.fundings[0]._id.toHexString()}`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 400 if fundingPlanId is empty and tpp has teletransmissionId', async () => {
      const customer = customersList[0];
      const payload = {
        subscription: customer.subscriptions[0]._id,
        amountTTC: 90,
        customerParticipationRate: 20,
        startDate: '2021-01-01T00:00:00',
        endDate: '2021-03-01T23:59:59',
        careDays: [1, 3],
        fundingPlanId: '',
      };

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id.toHexString()}/fundings/${customer.fundings[0]._id.toHexString()}`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 400 if fundingPlanId is not a string', async () => {
      const customer = customersList[0];
      const payload = {
        subscription: customer.subscriptions[0]._id,
        amountTTC: 90,
        customerParticipationRate: 20,
        startDate: '2021-01-01T00:00:00',
        endDate: '2021-03-01T23:59:59',
        careDays: [1, 3],
        fundingPlanId: 12345,
      };

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id.toHexString()}/fundings/${customer.fundings[0]._id.toHexString()}`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return a 404 error if customer does not exist', async () => {
      const invalidId = new ObjectID().toHexString();
      const payload = {
        subscription: customersList[0].subscriptions[0]._id,
        amountTTC: 90,
        customerParticipationRate: 20,
        startDate: '2021-01-01T00:00:00',
        endDate: '2021-03-01T23:59:59',
        careDays: [1, 3],
      };

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${invalidId}/fundings/${customersList[0].fundings[0]._id.toHexString()}`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return a 403 error if customer is not from the same company', async () => {
      const payload = {
        subscription: otherCompanyCustomer.subscriptions[0]._id,
        amountTTC: 90,
        customerParticipationRate: 20,
        startDate: '2021-01-01T00:00:00',
        endDate: '2021-03-01T23:59:59',
        careDays: [1, 3],
      };

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${otherCompanyCustomer._id}/fundings/${otherCompanyCustomer.fundings[0]._id.toHexString()}`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 403 if payload has fundingPlanId but thirdpartypayer has no teletransmissionId', async () => {
      const customer = customersList[1];
      const payload = {
        subscription: customer.subscriptions[0]._id,
        amountTTC: 90,
        customerParticipationRate: 20,
        startDate: '2021-01-01T00:00:00',
        endDate: '2021-03-01T23:59:59',
        careDays: [1, 3],
        fundingPlanId: '12345',
      };

      const res = await app.inject({
        method: 'PUT',
        url: `/customers/${customer._id.toHexString()}/fundings/${customer.fundings[0]._id.toHexString()}`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const customer = customersList[0];
      const payload = {
        subscription: customer.subscriptions[0]._id,
        amountTTC: 90,
        customerParticipationRate: 20,
        startDate: '2021-01-01T00:00:00',
        endDate: '2021-03-01T23:59:59',
        careDays: [1, 3],
      };

      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'PUT',
            url: `/customers/${customer._id.toHexString()}/fundings/${customer.fundings[0]._id.toHexString()}`,
            payload,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });

  describe('DELETE /customers/{id}/fundings/{fundingId}', () => {
    it('should delete customer funding', async () => {
      const customer = customersList[0];
      const funding = customer.fundings[0];

      const result = await app.inject({
        method: 'DELETE',
        url: `/customers/${customer._id.toHexString()}/fundings/${funding._id.toHexString()}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(200);
    });

    it('should not delete customer funding if customer is not from same company', async () => {
      const result = await app.inject({
        method: 'DELETE',
        url: `/customers/${otherCompanyCustomer._id}/fundings/${otherCompanyCustomer.fundings[0]._id}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(result.statusCode).toBe(403);
    });

    describe('Other roles', () => {
      const customer = customersList[0];
      const funding = customer.fundings[0];
      const roles = [
        { name: 'helper', expectedCode: 403 },
        { name: 'auxiliary', expectedCode: 403 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'DELETE',
            url: `/customers/${customer._id.toHexString()}/fundings/${funding._id.toHexString()}`,
            headers: { Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
        });
      });
    });
  });
});

describe('CUSTOMER FILE UPLOAD ROUTES', () => {
  let authToken;
  beforeEach(populateDB);
  beforeEach(async () => {
    authToken = await getToken('client_admin');
  });

  describe('POST /customers/:_id/gdrive/:driveId/upload', () => {
    const fakeDriveId = 'fakeDriveId';
    let addStub;
    let getFileByIdStub;

    beforeEach(() => {
      addStub = sinon.stub(Drive, 'add');
      getFileByIdStub = sinon.stub(Drive, 'getFileById');
    });

    afterEach(() => {
      addStub.restore();
      getFileByIdStub.restore();
    });

    it('should upload a signed mandate', async () => {
      addStub.returns({ id: 'fakeFileDriveId' });
      getFileByIdStub.returns({ webViewLink: 'fakeWebViewLink' });

      const customer = customersList[1];
      const payload = {
        fileName: 'mandat_signe',
        file: fs.createReadStream(path.join(__dirname, 'assets/test_upload.png')),
        type: 'signedMandate',
        mandateId: customer.payment.mandates[0]._id.toHexString(),
      };
      const form = generateFormData(payload);

      const response = await app.inject({
        method: 'POST',
        url: `/customers/${customer._id.toHexString()}/gdrive/${fakeDriveId}/upload`,
        payload: await GetStream(form),
        headers: { ...form.getHeaders(), Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toEqual(200);
      sinon.assert.calledOnce(addStub);
      sinon.assert.calledOnce(getFileByIdStub);
    });

    it('should not upload a signed mandate if customer is not from the same company', async () => {
      addStub.returns({ id: 'fakeFileDriveId' });
      getFileByIdStub.returns({ webViewLink: 'fakeWebViewLink' });

      const payload = {
        fileName: 'mandat_signe',
        file: fs.createReadStream(path.join(__dirname, 'assets/test_upload.png')),
        type: 'signedMandate',
        mandateId: otherCompanyCustomer.payment.mandates[0]._id.toHexString(),
      };
      const form = generateFormData(payload);

      const response = await app.inject({
        method: 'POST',
        url: `/customers/${otherCompanyCustomer._id}/gdrive/${fakeDriveId}/upload`,
        payload: await GetStream(form),
        headers: { ...form.getHeaders(), Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toEqual(403);
    });

    it('should upload a signed quote', async () => {
      addStub.returns({ id: 'fakeFileDriveId' });
      getFileByIdStub.returns({ webViewLink: 'fakeWebViewLink' });

      const customer = customersList[0];
      const payload = {
        fileName: 'devis_signe',
        file: fs.createReadStream(path.join(__dirname, 'assets/test_upload.png')),
        type: 'signedQuote',
        quoteId: customer.quotes[0]._id.toHexString(),
      };
      const form = generateFormData(payload);

      const response = await app.inject({
        method: 'POST',
        url: `/customers/${customer._id.toHexString()}/gdrive/${fakeDriveId}/upload`,
        payload: await GetStream(form),
        headers: { ...form.getHeaders(), Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toEqual(200);
      sinon.assert.calledOnce(addStub);
      sinon.assert.calledOnce(getFileByIdStub);
    });

    it('should not upload a signed quote if customer is not from the same company', async () => {
      addStub.returns({ id: 'fakeFileDriveId' });
      getFileByIdStub.returns({ webViewLink: 'fakeWebViewLink' });

      const payload = {
        fileName: 'devis_signe',
        file: fs.createReadStream(path.join(__dirname, 'assets/test_upload.png')),
        type: 'signedQuote',
        quoteId: otherCompanyCustomer.quotes[0]._id.toHexString(),
      };
      const form = generateFormData(payload);

      const response = await app.inject({
        method: 'POST',
        url: `/customers/${otherCompanyCustomer._id}/gdrive/${fakeDriveId}/upload`,
        payload: await GetStream(form),
        headers: { ...form.getHeaders(), Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toEqual(403);
    });

    it('should upload a financial certificate', async () => {
      addStub.returns({ id: 'fakeFileDriveId' });
      getFileByIdStub.returns({ webViewLink: 'fakeWebViewLink' });

      const customer = customersList[0];
      const payload = {
        file: fs.createReadStream(path.join(__dirname, 'assets/test_upload.png')),
        type: 'financialCertificates',
        fileName: 'financialCertificate',
      };
      const form = generateFormData(payload);

      const response = await app.inject({
        method: 'POST',
        url: `/customers/${customer._id.toHexString()}/gdrive/${fakeDriveId}/upload`,
        payload: await GetStream(form),
        headers: { ...form.getHeaders(), Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toEqual(200);
      sinon.assert.calledOnce(addStub);
      sinon.assert.calledOnce(getFileByIdStub);
    });

    it('should not upload a financial certificate if customer is not from the same company', async () => {
      addStub.returns({ id: 'fakeFileDriveId' });
      getFileByIdStub.returns({ webViewLink: 'fakeWebViewLink' });

      const payload = {
        file: fs.createReadStream(path.join(__dirname, 'assets/test_upload.png')),
        type: 'financialCertificates',
        fileName: 'financialCertificate',
      };
      const form = generateFormData(payload);

      const response = await app.inject({
        method: 'POST',
        url: `/customers/${otherCompanyCustomer._id}/gdrive/${fakeDriveId}/upload`,
        payload: await GetStream(form),
        headers: { ...form.getHeaders(), Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toEqual(403);
    });

    describe('Other roles', () => {
      it('should upload a financial certificate if I am its helper', async () => {
        const payload = {
          fileName: 'financialCertificate',
          file: fs.createReadStream(path.join(__dirname, 'assets/test_upload.png')),
          type: 'financialCertificates',
        };
        addStub.returns({ id: 'fakeFileDriveId' });
        getFileByIdStub.returns({ webViewLink: 'fakeWebViewLink' });
        const helper = userList[0];
        authToken = await getTokenByCredentials(helper.local);
        const customerId = helper.customers[0];
        const form = generateFormData(payload);
        const res = await app.inject({
          method: 'POST',
          url: `/customers/${customerId.toHexString()}/gdrive/${fakeDriveId}/upload`,
          payload: await GetStream(form),
          headers: { ...form.getHeaders(), Cookie: `alenvi_token=${authToken}` },
        });
        expect(res.statusCode).toBe(200);
        sinon.assert.calledOnce(addStub);
        sinon.assert.calledOnce(getFileByIdStub);
      });

      const roles = [
        { name: 'helper', expectedCode: 403, callCount: 0 },
        { name: 'auxiliary', expectedCode: 403, callCount: 0 },
        { name: 'auxiliary_without_company', expectedCode: 403, callCount: 0 },
        { name: 'coach', expectedCode: 200, callCount: 1 },
      ];

      roles.forEach((role) => {
        it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
          const payload = {
            fileName: 'financialCertificate',
            file: fs.createReadStream(path.join(__dirname, 'assets/test_upload.png')),
            type: 'financialCertificates',
          };
          addStub.returns({ id: 'fakeFileDriveId' });
          getFileByIdStub.returns({ webViewLink: 'fakeWebViewLink' });

          const form = generateFormData(payload);
          authToken = await getToken(role.name);
          const response = await app.inject({
            method: 'POST',
            url: `/customers/${customersList[0]._id.toHexString()}/gdrive/${fakeDriveId}/upload`,
            payload: await GetStream(form),
            headers: { ...form.getHeaders(), Cookie: `alenvi_token=${authToken}` },
          });

          expect(response.statusCode).toBe(role.expectedCode);
          sinon.assert.callCount(addStub, role.callCount);
          sinon.assert.callCount(getFileByIdStub, role.callCount);
        });
      });
    });
  });
});
