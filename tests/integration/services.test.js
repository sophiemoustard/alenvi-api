const expect = require('expect');
const omit = require('lodash/omit');
const { ObjectID } = require('mongodb');
const { servicesList, serviceFromOtherCompany, populateDB } = require('./seed/servicesSeed');
const Service = require('../../src/models/Service');
const app = require('../../server');
const { HOURLY } = require('../../src/helpers/constants');
const { getToken, authCompany } = require('./seed/authenticationSeed');

describe('NODE ENV', () => {
  it('should be \'test\'', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('POST /services', () => {
  let authToken = null;
  beforeEach(populateDB);
  beforeEach(async () => {
    authToken = await getToken('client_admin');
  });

  it('should create a new service', async () => {
    const payload = {
      versions: [{
        name: 'Service',
        defaultUnitAmount: 12,
        vat: 12,
        exemptFromCharges: true,
        startDate: '2019-09-19T09:00:00',
      }],
      nature: HOURLY,
    };
    const response = await app.inject({
      method: 'POST',
      url: '/services',
      headers: { Cookie: `alenvi_token=${authToken}` },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.result.data.service.company).toEqual(authCompany._id);
  });

  const missingParams = ['versions[0].defaultUnitAmount', 'versions[0].name', 'nature'];
  missingParams.forEach((param) => {
    it(`should return a 400 error if missing '${param}' parameter`, async () => {
      const payload = {
        versions: [{
          name: 'Service',
          defaultUnitAmount: 12,
          vat: 12,
          exemptFromCharges: true,
          startDate: '2019-09-19T09:00:00',
        }],
        nature: HOURLY,
      };

      const res = await app.inject({
        method: 'POST',
        url: '/services',
        payload: omit(payload, [param]),
        headers: { Cookie: `alenvi_token=${authToken}` },
      });
      expect(res.statusCode).toBe(400);
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
        const payload = {
          versions: [{
            name: 'Service',
            defaultUnitAmount: 12,
            vat: 12,
            exemptFromCharges: true,
            startDate: '2019-09-19T09:00:00',
          }],
          nature: HOURLY,
        };
        authToken = await getToken(role.name);
        const response = await app.inject({
          method: 'POST',
          url: '/services',
          headers: { Cookie: `alenvi_token=${authToken}` },
          payload,
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});

describe('GET /services', () => {
  let authToken = null;
  beforeEach(populateDB);
  beforeEach(async () => {
    authToken = await getToken('client_admin');
  });

  it('should return services', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/services',
      headers: { Cookie: `alenvi_token=${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.result.data.services).toHaveLength(5);
  });

  it('should return archived services', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/services?isArchived=true',
      headers: { Cookie: `alenvi_token=${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.result.data.services.every(service => service.isArchived)).toBeTruthy();
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
          url: '/services',
          headers: { Cookie: `alenvi_token=${authToken}` },
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});

describe('PUT /services/:id', () => {
  let authToken = null;
  beforeEach(populateDB);
  beforeEach(async () => {
    authToken = await getToken('client_admin');
  });
  it('should update service', async () => {
    const payload = { defaultUnitAmount: 15, name: 'Service bis', startDate: '2019-01-16 17:58:15.519', vat: 12 };
    const response = await app.inject({
      method: 'PUT',
      url: `/services/${servicesList[0]._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
      payload,
    });

    expect(response.statusCode).toBe(200);

    const updatedService = await Service.findOne({ _id: servicesList[0]._id.toHexString() }).lean();
    expect(updatedService.versions).toBeDefined();
    expect(updatedService.versions.length).toBe(servicesList[0].versions.length + 1);
  });

  it('should archive service', async () => {
    const payload = { isArchived: true };
    const response = await app.inject({
      method: 'PUT',
      url: `/services/${servicesList[0]._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
      payload,
    });

    expect(response.statusCode).toBe(200);

    const updatedService = await Service.findOne({ _id: servicesList[0]._id.toHexString() }).lean();
    expect(updatedService.isArchived).toBe(true);
  });

  it('should return 404 if no service found', async () => {
    const invalidId = new ObjectID().toHexString();
    const payload = { defaultUnitAmount: 15, startDate: '2019-01-16 17:58:15.519', vat: 12 };
    const response = await app.inject({
      method: 'PUT',
      url: `/services/${invalidId}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
      payload,
    });

    expect(response.statusCode).toBe(404);
  });

  it('should return 400 if startDate is missing in payload', async () => {
    const payload = { vat: 12 };
    const response = await app.inject({
      method: 'PUT',
      url: `/services/${servicesList[0]._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 if nothing in payload', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/services/${servicesList[0]._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('should return 400 if isArchived is not alone in payload', async () => {
    const payload = {
      defaultUnitAmount: 15,
      startDate: '2019-01-16 17:58:15.519',
      vat: 12,
      isArchived: true,
    };
    const response = await app.inject({
      method: 'PUT',
      url: `/services/${servicesList[0]._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 403 if service isArchived', async () => {
    const payload = { defaultUnitAmount: 15, startDate: '2019-01-16 17:58:15.519', vat: 12 };
    const response = await app.inject({
      method: 'PUT',
      url: `/services/${servicesList[3]._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
      payload,
    });

    expect(response.statusCode).toBe(403);
  });

  it('should return a 403 error if user is not from the same company', async () => {
    const payload = { defaultUnitAmount: 15, name: 'Service bis', startDate: '2019-01-16 17:58:15.519', vat: 12 };
    const response = await app.inject({
      method: 'PUT',
      url: `/services/${serviceFromOtherCompany._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
      payload,
    });

    expect(response.statusCode).toBe(403);
  });

  describe('Other roles', () => {
    const roles = [
      { name: 'helper', expectedCode: 403 },
      { name: 'auxiliary', expectedCode: 403 },
      { name: 'auxiliary_without_company', expectedCode: 403 },
      { name: 'coach', expectedCode: 403 },
    ];

    roles.forEach((role) => {
      const payload = {
        defaultUnitAmount: 15,
        name: 'Service bis',
        startDate: '2019-01-16 17:58:15.519',
        vat: 12,
      };
      it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
        authToken = await getToken(role.name);
        const response = await app.inject({
          method: 'PUT',
          url: `/services/${servicesList[0]._id.toHexString()}`,
          headers: { Cookie: `alenvi_token=${authToken}` },
          payload,
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});

describe('DELETE /services/:id', () => {
  let authToken = null;
  beforeEach(populateDB);
  beforeEach(async () => {
    authToken = await getToken('client_admin');
  });

  it('should delete service', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/services/${servicesList[0]._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    const serviceCount = await Service.countDocuments({ company: authCompany._id });
    expect(serviceCount).toBe(4);
  });

  it('should return a 403 error if user is not from the same company', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/services/${serviceFromOtherCompany._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should return a 403 error if service is archived', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/services/${servicesList[3]._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should return a 403 error if service has subscriptions linked', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/services/${servicesList[2]._id.toHexString()}`,
      headers: { Cookie: `alenvi_token=${authToken}` },
    });

    expect(response.statusCode).toBe(403);
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
        const response = await app.inject({
          method: 'DELETE',
          url: `/services/${servicesList[0]._id.toHexString()}`,
          headers: { Cookie: `alenvi_token=${authToken}` },
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});
