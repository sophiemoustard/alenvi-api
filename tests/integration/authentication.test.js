const { ObjectID } = require('mongodb');
const { fn: momentProto } = require('moment');
const expect = require('expect');
const sinon = require('sinon');
const app = require('../../server');
const User = require('../../src/models/User');
const { usersSeedList, populateDB, auxiliaryFromOtherCompany } = require('./seed/usersSeed');
const { getToken, getUser, getTokenByCredentials, authCompany } = require('./seed/authenticationSeed');
const { userList, noRoleNoCompany } = require('../seed/userSeed');
const GdriveStorage = require('../../src/helpers/gdriveStorage');
const EmailHelper = require('../../src/helpers/email');

describe('NODE ENV', () => {
  it('should be \'test\'', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('POST /users/authenticate', () => {
  beforeEach(populateDB);

  it('should authenticate a user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users/authenticate',
      payload: { email: 'kitty@alenvi.io', password: '123456!eR', origin: 'webapp' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.result.data).toEqual(expect.objectContaining({
      token: expect.any(String),
      tokenExpireDate: expect.any(Date),
      refreshToken: expect.any(String),
      user: expect.objectContaining({ _id: expect.any(String) }),
    }));
  });

  it('should authenticate a user and set firstMobileConnection', async () => {
    const momentToDate = sinon.stub(momentProto, 'toDate');
    momentToDate.returns('2020-12-08T13:45:25.437Z');

    const response = await app.inject({
      method: 'POST',
      url: '/users/authenticate',
      payload: { email: 'kitty@alenvi.io', password: '123456!eR', origin: 'mobile' },
    });

    expect(response.statusCode).toBe(200);
    const user = await User.findOne({ _id: response.result.data.user._id }).lean();
    expect(user.firstMobileConnection).toEqual(new Date('2020-12-08T13:45:25.437Z'));
    momentToDate.restore();
  });

  it('should authenticate a user without company', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users/authenticate',
      payload: userList[8].local,
    });

    expect(response.statusCode).toBe(200);
    expect(response.result.data).toEqual(expect.objectContaining({
      token: expect.any(String),
      tokenExpireDate: expect.any(Date),
      refreshToken: expect.any(String),
      user: expect.objectContaining({ _id: expect.any(String) }),
    }));
  });

  it('should authenticate a user without role', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users/authenticate',
      payload: userList[10].local,
    });

    expect(response.statusCode).toBe(200);
  });

  it('should authenticate a user without role or company', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users/authenticate',
      payload: userList[11].local,
    });

    expect(response.statusCode).toBe(200);
  });

  it('should not authenticate a user if missing parameter', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users/authenticate',
      payload: { email: 'kitty@alenvi.io' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should not authenticate a user if user does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users/authenticate',
      payload: { email: 'test@alenvi.io', password: '123456!eR' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should not authenticate a user if wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users/authenticate',
      payload: { email: 'kitty@alenvi.io', password: '7890' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should not authenticate a user if refreshToken is missing', async () => {
    await User.findOneAndUpdate({ 'local.email': 'white@alenvi.io' }, { $unset: { refreshToken: '' } });
    const res = await app.inject({
      method: 'POST',
      url: '/users/authenticate',
      payload: { email: 'white@alenvi.io', password: '123456!eR' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /users/:id/passwordtoken', () => {
  let authToken;
  const payload = { email: 'aux@alenvi.io' };

  describe('CLIENT_ADMIN', () => {
    beforeEach(populateDB);
    beforeEach(async () => {
      authToken = await getToken('client_admin', true, usersSeedList);
    });

    it('should create password token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/users/${usersSeedList[0]._id.toHexString()}/passwordtoken`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.result.data.passwordToken).toBeDefined();
    });

    it('should not create password token if user is from an other company', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/users/${auxiliaryFromOtherCompany._id.toHexString()}/passwordtoken`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should return 404 if user not found', async () => {
      const id = new ObjectID().toHexString();
      const res = await app.inject({
        method: 'POST',
        url: `/users/${id}/passwordtoken`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Other roles', () => {
    beforeEach(populateDB);
    const roles = [
      { name: 'helper', expectedCode: 403 },
      { name: 'auxiliary', expectedCode: 403 },
      { name: 'auxiliary_without_company', expectedCode: 403 },
      { name: 'coach', expectedCode: 200 },
      { name: 'vendor_admin', expectedCode: 200 },
      { name: 'training_organisation_manager', expectedCode: 200 },
    ];

    roles.forEach((role) => {
      it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
        authToken = await getToken(role.name);

        const response = await app.inject({
          method: 'POST',
          url: `/users/${userList[1]._id.toHexString()}/passwordtoken`,
          payload,
          headers: { Cookie: `alenvi_token=${authToken}` },
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});

describe('PUT /users/:id/password', () => {
  let authToken;
  const updatePayload = { local: { password: '123456!eR' } };

  describe('It\'s me', () => {
    beforeEach(populateDB);
    beforeEach(async () => {
      authToken = await getTokenByCredentials(noRoleNoCompany.local);
    });

    it('should update user password if it is me', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/users/${noRoleNoCompany._id.toHexString()}/password`,
        payload: updatePayload,
        headers: { 'x-access-token': authToken },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should return a 400 error if password too short', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/users/${noRoleNoCompany._id.toHexString()}/password`,
        payload: { local: { password: '12345' } },
        headers: { 'x-access-token': authToken },
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
      { name: 'training_organisation_manager', expectedCode: 403 },
      { name: 'client_admin', expectedCode: 403 },
      { name: 'vendor_admin', expectedCode: 403 },
    ];

    roles.forEach((role) => {
      it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
        authToken = await getToken(role.name);

        const response = await app.inject({
          method: 'PUT',
          url: `/users/${usersSeedList[0]._id.toHexString()}/password`,
          payload: updatePayload,
          headers: { Cookie: `alenvi_token=${authToken}` },
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});

describe('POST /users/refreshToken', () => {
  beforeEach(populateDB);
  it('should return refresh token for webapp', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users/refreshToken',
      headers: { Cookie: `refresh_token=${usersSeedList[1].refreshToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.result.data).toEqual(expect.objectContaining({
      token: expect.any(String),
      tokenExpireDate: expect.any(Date),
      refreshToken: expect.any(String),
      user: expect.objectContaining({ _id: expect.any(String) }),
    }));
  });

  it('should return refresh token for mobile', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users/refreshToken',
      payload: { refreshToken: usersSeedList[1].refreshToken },
    });

    expect(res.statusCode).toBe(200);
    expect(res.result.data).toEqual(expect.objectContaining({
      token: expect.any(String),
      tokenExpireDate: expect.any(Date),
      refreshToken: expect.any(String),
      user: expect.objectContaining({ _id: expect.any(String) }),
    }));
  });

  it('should return a 404 error when refresh token isn\'t good', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users/refreshToken',
      headers: { Cookie: 'refresh_token=false-refresh-token' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /users/:id/drivefolder', () => {
  let authToken;
  let createFolderStub;
  beforeEach(() => {
    createFolderStub = sinon.stub(GdriveStorage, 'createFolder');
  });
  afterEach(() => {
    createFolderStub.restore();
  });

  describe('CLIENT_ADMIN', () => {
    beforeEach(populateDB);
    beforeEach(async () => {
      authToken = await getToken('client_admin', true, usersSeedList);
    });

    it('should create a drive folder for a user', async () => {
      createFolderStub.returns({ id: '1234567890', webViewLink: 'http://test.com' });

      const response = await app.inject({
        method: 'POST',
        url: `/users/${usersSeedList[0]._id.toHexString()}/drivefolder`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(200);

      const updatedUser = await User.findOne({ _id: usersSeedList[0]._id }, { 'administrative.driveFolder': 1 }).lean();
      expect(updatedUser.administrative.driveFolder).toEqual({ driveId: '1234567890', link: 'http://test.com' });
      sinon.assert.calledWithExactly(createFolderStub, usersSeedList[0].identity, authCompany.auxiliariesFolderId);
    });
  });

  describe('Other roles', () => {
    beforeEach(populateDB);
    const roles = [
      { name: 'helper', expectedCode: 403 },
      { name: 'auxiliary', expectedCode: 403 },
      { name: 'auxiliary_without_company', expectedCode: 403 },
      { name: 'coach', expectedCode: 200 },
    ];
    roles.forEach((role) => {
      it(`should return ${role.expectedCode} as user is ${role.name}`, async () => {
        authToken = await getToken(role.name);
        createFolderStub.returns({ id: '1234567890', webViewLink: 'http://test.com' });

        const response = await app.inject({
          method: 'POST',
          url: `/users/${usersSeedList[1]._id.toHexString()}/drivefolder`,
          headers: { Cookie: `alenvi_token=${authToken}` },
        });

        expect(response.statusCode).toBe(role.expectedCode);
      });
    });
  });
});

describe('GET /users/passwordtoken/:token', () => {
  beforeEach(populateDB);

  it('should return a new access token after checking reset password token', async () => {
    const user = getUser('helper', true, usersSeedList);
    const fakeDate = sinon.useFakeTimers(new Date('2020-01-20'));

    const response = await app.inject({
      method: 'GET',
      url: `/users/passwordtoken/${user.passwordToken.token}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.result.data.token).toEqual(expect.any(String));
    fakeDate.restore();
  });

  it('should return a 404 error if token is not valid', async () => {
    const fakeDate = sinon.useFakeTimers(new Date('2020-01-20'));

    const response = await app.inject({
      method: 'GET',
      url: '/users/passwordtoken/1234567890',
    });

    expect(response.statusCode).toBe(404);
    fakeDate.restore();
  });
});

describe('POST /users/forgot-password', () => {
  let forgotPasswordEmail;
  beforeEach(populateDB);
  beforeEach(() => {
    forgotPasswordEmail = sinon.stub(EmailHelper, 'forgotPasswordEmail');
  });
  afterEach(() => {
    forgotPasswordEmail.restore();
  });

  it('should send an email to renew password', async () => {
    const userEmail = usersSeedList[0].local.email;
    const response = await app.inject({
      method: 'POST',
      url: '/users/forgot-password',
      payload: { email: userEmail },
    });

    expect(response.statusCode).toBe(200);
    sinon.assert.calledWith(
      forgotPasswordEmail,
      userEmail,
      sinon.match({ token: sinon.match.string, expiresIn: sinon.match.number })
    );
  });

  it('should be compatible with old mobile app version', async () => {
    const userEmail = usersSeedList[0].local.email;
    const response = await app.inject({
      method: 'POST',
      url: '/users/forgot-password',
      payload: { email: userEmail },
    });

    expect(response.statusCode).toBe(200);
    expect(response.result.data).toBeDefined();
    sinon.assert.calledWith(
      forgotPasswordEmail,
      userEmail,
      sinon.match({ token: sinon.match.string, expiresIn: sinon.match.number })
    );
  });

  it('should return a 400 error if missing email parameter', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users/forgot-password',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    sinon.assert.notCalled(forgotPasswordEmail);
  });

  it('should return a 404 error if user does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users/forgot-password',
      payload: { email: 't@t.com' },
    });

    expect(response.statusCode).toBe(404);
    sinon.assert.notCalled(forgotPasswordEmail);
  });
});