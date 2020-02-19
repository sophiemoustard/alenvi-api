const mongoose = require('mongoose');
const { ObjectID } = require('mongodb');
const get = require('lodash/get');
const expect = require('expect');
const moment = require('moment');
const sinon = require('sinon');
const Boom = require('boom');
const flat = require('flat');
const bcrypt = require('bcrypt');
const omit = require('lodash/omit');
const UsersHelper = require('../../../src/helpers/users');
const SectorHistoriesHelper = require('../../../src/helpers/sectorHistories');
const AuthenticationHelper = require('../../../src/helpers/authentication');
const translate = require('../../../src/helpers/translate');
const { TOKEN_EXPIRE_TIME } = require('../../../src/models/User');
const GdriveStorageHelper = require('../../../src/helpers/gdriveStorage');
const User = require('../../../src/models/User');
const Contract = require('../../../src/models/Contract');
const Role = require('../../../src/models/Role');
const Task = require('../../../src/models/Task');

require('sinon-mongoose');

const { language } = translate;

describe('authenticate', () => {
  let UserMock;
  let compare;
  let encode;
  beforeEach(() => {
    UserMock = sinon.mock(User);
    compare = sinon.stub(bcrypt, 'compare');
    encode = sinon.stub(AuthenticationHelper, 'encode');
  });
  afterEach(() => {
    UserMock.restore();
    compare.restore();
    encode.restore();
  });

  it('should throw an error if user does not exist', async () => {
    try {
      const payload = { email: 'toto@email.com', password: 'toto' };
      UserMock.expects('findOne')
        .withExactArgs({ 'local.email': payload.email.toLowerCase() })
        .chain('lean')
        .withExactArgs({ autopopulate: true })
        .once()
        .returns(null);

      await UsersHelper.authenticate(payload);
    } catch (e) {
      expect(e.output.statusCode).toEqual(401);
    } finally {
      UserMock.verify();
      sinon.assert.notCalled(compare);
      sinon.assert.notCalled(encode);
    }
  });
  it('should throw an error if refresh token does not exist', async () => {
    try {
      const payload = { email: 'toto@email.com', password: 'toto' };
      UserMock.expects('findOne')
        .withExactArgs({ 'local.email': payload.email.toLowerCase() })
        .chain('lean')
        .withExactArgs({ autopopulate: true })
        .once()
        .returns({ _id: new ObjectID() });

      await UsersHelper.authenticate(payload);
    } catch (e) {
      expect(e.output.statusCode).toEqual(401);
    } finally {
      UserMock.verify();
      sinon.assert.notCalled(compare);
      sinon.assert.notCalled(encode);
    }
  });
  it('should throw an error if wrong password', async () => {
    const payload = { email: 'toto@email.com', password: 'toto' };
    try {
      UserMock.expects('findOne')
        .withExactArgs({ 'local.email': payload.email.toLowerCase() })
        .chain('lean')
        .withExactArgs({ autopopulate: true })
        .once()
        .returns({ _id: new ObjectID(), refreshToken: 'token', local: { password: 'password_hash' } });
      compare.returns(false);

      await UsersHelper.authenticate(payload);
    } catch (e) {
      expect(e.output.statusCode).toEqual(401);
    } finally {
      UserMock.verify();
      sinon.assert.calledWithExactly(compare, payload.password, 'password_hash');
      sinon.assert.notCalled(encode);
    }
  });
  it('should return authentication data', async () => {
    const payload = { email: 'toto@email.com', password: 'toto' };
    const user = {
      _id: new ObjectID(),
      refreshToken: 'token',
      local: { password: 'toto' },
      role: { client: { name: 'role' } },
    };
    UserMock.expects('findOne')
      .withExactArgs({ 'local.email': payload.email.toLowerCase() })
      .chain('lean')
      .withExactArgs({ autopopulate: true })
      .once()
      .returns(user);
    compare.returns(true);
    encode.returns('token');

    const result = await UsersHelper.authenticate(payload);

    expect(result).toEqual({
      token: 'token',
      refreshToken: user.refreshToken,
      expiresIn: TOKEN_EXPIRE_TIME,
      user: { _id: user._id.toHexString(), role: [user.role.client.name] },
    });
    UserMock.verify();
    sinon.assert.calledWithExactly(compare, payload.password, 'toto');
    sinon.assert.calledWithExactly(
      encode,
      { _id: user._id.toHexString(), role: [user.role.client.name] },
      TOKEN_EXPIRE_TIME
    );
  });
});

describe('refreshToken', () => {
  let UserMock;
  let encode;
  beforeEach(() => {
    UserMock = sinon.mock(User);
    encode = sinon.stub(AuthenticationHelper, 'encode');
  });
  afterEach(() => {
    UserMock.restore();
    encode.restore();
  });

  it('should throw an error if user does not exist', async () => {
    try {
      const payload = { refreshToken: 'token' };
      UserMock.expects('findOne')
        .withExactArgs({ refreshToken: payload.refreshToken })
        .chain('lean')
        .withExactArgs({ autopopulate: true })
        .once()
        .returns(null);

      await UsersHelper.refreshToken(payload);
    } catch (e) {
      expect(e.output.statusCode).toEqual(401);
    } finally {
      UserMock.verify();
      sinon.assert.notCalled(encode);
    }
  });
  it('should return refresh token', async () => {
    const payload = { refreshToken: 'token' };
    const user = { _id: new ObjectID(), refreshToken: 'token', local: { password: 'toto' }, role: { name: 'role' } };
    UserMock.expects('findOne')
      .withExactArgs({ refreshToken: payload.refreshToken })
      .chain('lean')
      .withExactArgs({ autopopulate: true })
      .once()
      .returns(user);
    encode.returns('token');

    const result = await UsersHelper.refreshToken(payload);

    expect(result).toEqual({
      token: 'token',
      refreshToken: user.refreshToken,
      expiresIn: TOKEN_EXPIRE_TIME,
      user: { _id: user._id.toHexString(), role: user.role.name },
    });
    UserMock.verify();
    sinon.assert.calledWithExactly(encode, { _id: user._id.toHexString(), role: user.role.name }, TOKEN_EXPIRE_TIME);
  });
});

describe('getUsersList', () => {
  let UserMock;
  let RoleMock;
  const users = [{ _id: new ObjectID() }, { _id: new ObjectID() }];
  const roles = [{ _id: new ObjectID() }, { _id: new ObjectID() }];
  const credentials = { company: { _id: new ObjectID() } };
  const companyId = credentials.company._id;

  beforeEach(() => {
    UserMock = sinon.mock(User);
    RoleMock = sinon.mock(Role);
  });

  afterEach(() => {
    UserMock.restore();
    RoleMock.restore();
  });

  it('should get users', async () => {
    const query = { email: 'toto@test.com' };

    UserMock
      .expects('find')
      .withExactArgs({ ...query, company: companyId }, {}, { autopopulate: false })
      .chain('populate')
      .withExactArgs({ path: 'procedure.task', select: 'name' })
      .chain('populate')
      .withExactArgs({ path: 'customers', select: 'identity driveFolder' })
      .chain('populate')
      .withExactArgs({ path: 'role.client', select: '-rights -__v -createdAt -updatedAt' })
      .chain('populate')
      .withExactArgs({
        path: 'sector',
        select: '_id sector',
        match: { company: credentials.company._id },
      })
      .chain('populate')
      .withExactArgs('contracts')
      .chain('lean')
      .withExactArgs({ virtuals: true, autopopulate: true })
      .returns(users);

    const result = await UsersHelper.getUsersList(query, credentials);
    expect(result).toEqual(users);
    UserMock.verify();
  });

  it('should get users according to roles', async () => {
    const query = { role: ['auxiliary', 'planning_referent'] };

    RoleMock
      .expects('find')
      .withExactArgs({ name: { $in: query.role } }, { _id: 1 })
      .chain('lean')
      .returns(roles);

    UserMock
      .expects('find')
      .withExactArgs({ 'role.client': { $in: roles.map(r => r._id) }, company: companyId }, {}, { autopopulate: false })
      .chain('populate')
      .withExactArgs({ path: 'procedure.task', select: 'name' })
      .chain('populate')
      .withExactArgs({ path: 'customers', select: 'identity driveFolder' })
      .chain('populate')
      .withExactArgs({ path: 'role.client', select: '-rights -__v -createdAt -updatedAt' })
      .chain('populate')
      .withExactArgs({
        path: 'sector',
        select: '_id sector',
        match: { company: credentials.company._id },
      })
      .chain('populate')
      .withExactArgs('contracts')
      .chain('lean')
      .withExactArgs({ virtuals: true, autopopulate: true })
      .returns(users);

    const result = await UsersHelper.getUsersList(query, credentials);
    expect(result).toEqual(users);
    RoleMock.verify();
    UserMock.verify();
  });


  it('should return a 404 error if role in query does not exist', async () => {
    const query = { role: 'toto' };

    RoleMock
      .expects('find')
      .withExactArgs({ name: { $in: [query.role] } }, { _id: 1 })
      .chain('lean')
      .returns([]);

    UserMock
      .expects('find')
      .never();

    try {
      await UsersHelper.getUsersList(query, credentials);
    } catch (e) {
      expect(e).toEqual(Boom.notFound(translate[language].roleNotFound));
    } finally {
      RoleMock.verify();
      UserMock.verify();
    }
  });
});

describe('getUsersListWithSectorHistories', () => {
  let UserMock;
  let RoleMock;
  const users = [{ _id: new ObjectID() }, { _id: new ObjectID() }];
  const roles = [{ _id: new ObjectID() }, { _id: new ObjectID() }];
  const credentials = { company: { _id: new ObjectID() } };
  const companyId = credentials.company._id;

  beforeEach(() => {
    UserMock = sinon.mock(User);
    RoleMock = sinon.mock(Role);
  });

  afterEach(() => {
    UserMock.restore();
    RoleMock.restore();
  });

  it('should get users', async () => {
    RoleMock
      .expects('find')
      .withExactArgs({ name: { $in: ['auxiliary', 'planning_referent'] } })
      .chain('lean')
      .returns(roles);

    const roleIds = roles.map(role => role._id);

    UserMock
      .expects('find')
      .withExactArgs({ role: { $in: roleIds }, company: companyId }, {}, { autopopulate: false })
      .chain('populate')
      .withExactArgs({ path: 'role', select: 'name' })
      .chain('populate')
      .withExactArgs({
        path: 'sectorHistories',
        select: '_id sector startDate endDate',
        match: { company: get(credentials, 'company._id', null) },
      })
      .chain('populate')
      .withExactArgs('contracts')
      .chain('lean')
      .withExactArgs({ virtuals: true, autopopulate: true })
      .returns(users);

    const result = await UsersHelper.getUsersListWithSectorHistories(credentials);
    expect(result).toEqual(users);
    RoleMock.verify();
    UserMock.verify();
  });
});

describe('getUser', () => {
  let userMock;
  const credentials = { company: { _id: new ObjectID() } };
  beforeEach(() => {
    userMock = sinon.mock(User);
  });
  afterEach(() => {
    userMock.restore();
  });

  it('should return user without populating role', async () => {
    const userId = new ObjectID();
    const user = { _id: userId, role: { name: 'helper', rights: [] } };
    userMock.expects('findOne')
      .withExactArgs({ _id: userId })
      .chain('populate')
      .withExactArgs('customers')
      .chain('populate')
      .withExactArgs('contracts')
      .chain('populate')
      .withExactArgs({ path: 'procedure.task', select: 'name _id' })
      .chain('populate')
      .withExactArgs({ path: 'sector', select: '_id sector', match: { company: credentials.company._id } })
      .chain('lean')
      .withExactArgs({ autopopulate: true, virtuals: true })
      .once()
      .returns(user);

    await UsersHelper.getUser(userId, credentials);

    userMock.verify();
  });

  it('should return user and populate role', async () => {
    const userId = new ObjectID();
    const rightId = new ObjectID();
    const user = { _id: userId, role: { name: 'helper', rights: [{ _id: rightId }] } };
    userMock.expects('findOne')
      .withExactArgs({ _id: userId })
      .chain('populate')
      .withExactArgs('customers')
      .chain('populate')
      .withExactArgs('contracts')
      .chain('populate')
      .withExactArgs({ path: 'procedure.task', select: 'name _id' })
      .chain('populate')
      .withExactArgs({ path: 'sector', select: '_id sector', match: { company: credentials.company._id } })
      .chain('lean')
      .withExactArgs({ autopopulate: true, virtuals: true })
      .once()
      .returns(user);

    await UsersHelper.getUser(userId, credentials);

    userMock.verify();
  });

  it('should throw error if user not found', async () => {
    try {
      const userId = new ObjectID();
      userMock.expects('findOne')
        .withExactArgs({ _id: userId })
        .chain('populate')
        .withExactArgs('customers')
        .chain('populate')
        .withExactArgs('contracts')
        .chain('populate')
        .withExactArgs({ path: 'procedure.task', select: 'name _id' })
        .chain('populate')
        .withExactArgs({ path: 'sector', select: '_id sector', match: { company: credentials.company._id } })
        .chain('lean')
        .withExactArgs({ autopopulate: true, virtuals: true })
        .once()
        .returns(null);

      await UsersHelper.getUser(userId, credentials);
    } catch (e) {
      expect(e.output.statusCode).toEqual(404);
    } finally {
      userMock.verify();
    }
  });
});

describe('createAndSaveFile', () => {
  let addFileStub;
  let saveCertificateDriveIdStub;
  let saveFileStub;
  const uploadedFile = { id: '123456790', webViewLink: 'http://test.com' };

  beforeEach(() => {
    addFileStub = sinon.stub(GdriveStorageHelper, 'addFile').returns(uploadedFile);
    saveFileStub = sinon.stub(UsersHelper, 'saveFile');
    saveCertificateDriveIdStub = sinon.stub(UsersHelper, 'saveCertificateDriveId');
  });

  afterEach(() => {
    addFileStub.restore();
    saveFileStub.restore();
    saveCertificateDriveIdStub.restore();
  });

  it('upload a file on drive and save info to user', async () => {
    const params = { _id: new ObjectID(), driveId: '1234567890' };
    const payload = {
      fileName: 'test',
      file: 'true',
      type: 'cni',
      'Content-type': 'application/pdf',
    };

    const result = await UsersHelper.createAndSaveFile(params, payload);

    expect(result).toEqual(uploadedFile);
    sinon.assert.calledWithExactly(addFileStub, {
      driveFolderId: params.driveId,
      name: payload.fileName,
      type: payload['Content-Type'],
      body: payload.file,
    });
    sinon.assert.calledWithExactly(saveFileStub, params._id, payload.type, {
      driveId: uploadedFile.id,
      link: uploadedFile.webViewLink,
    });
    sinon.assert.notCalled(saveCertificateDriveIdStub);
  });

  it('upload a certificate file on drive and save info to user', async () => {
    const params = { _id: new ObjectID(), driveId: '1234567890' };
    const payload = {
      fileName: 'test',
      type: 'certificates',
      'Content-type': 'application/pdf',
      file: 'Ceci est un fichier',
    };

    const result = await UsersHelper.createAndSaveFile(params, payload);

    expect(result).toEqual(uploadedFile);
    sinon.assert.calledWithExactly(addFileStub, {
      driveFolderId: params.driveId,
      name: payload.fileName,
      type: payload['Content-Type'],
      body: payload.file,
    });
    sinon.assert.calledWithExactly(saveCertificateDriveIdStub, params._id, {
      driveId: uploadedFile.id,
      link: uploadedFile.webViewLink,
    });
    sinon.assert.notCalled(saveFileStub);
  });
});

describe('createUser', () => {
  let UserMock;
  let TaskMock;
  let RoleMock;
  let objectIdStub;
  let createHistoryStub;
  const userId = new ObjectID();
  const roleId = new ObjectID();
  const credentials = { company: { _id: new ObjectID() } };

  beforeEach(() => {
    UserMock = sinon.mock(User);
    TaskMock = sinon.mock(Task);
    RoleMock = sinon.mock(Role);
    objectIdStub = sinon.stub(mongoose.Types, 'ObjectId').returns(userId);
    createHistoryStub = sinon.stub(SectorHistoriesHelper, 'createHistory');
  });

  afterEach(() => {
    UserMock.restore();
    TaskMock.restore();
    RoleMock.restore();
    objectIdStub.restore();
    createHistoryStub.restore();
  });

  it('should create an auxiliary', async () => {
    const payload = {
      identity: { lastname: 'Test', firstname: 'Toto' },
      local: { email: 'toto@test.com', password: '1234567890' },
      role: { client: roleId },
      sector: new ObjectID(),
    };
    const newUser = {
      ...payload,
      role: { client: { _id: roleId, name: 'auxiliary', rights: [{ _id: new ObjectID() }] } },
    };
    const tasks = [{ _id: new ObjectID() }, { _id: new ObjectID() }];
    const taskIds = tasks.map(task => ({ task: task._id }));
    const newUserWithProcedure = {
      ...newUser,
      procedure: [
        { task: tasks[0]._id, isDone: false, at: null },
        { task: tasks[1]._id, isDone: false, at: null },
      ],
    };

    RoleMock.expects('findById')
      .withExactArgs(payload.role, { name: 1, interface: 1 })
      .chain('lean')
      .returns({ _id: roleId, name: 'auxiliary', interface: 'client' });

    TaskMock.expects('find').chain('lean').returns(tasks);

    UserMock.expects('create')
      .withExactArgs({
        ...omit(payload, 'sector'),
        company: credentials.company._id,
        refreshToken: sinon.match.string,
        procedure: taskIds,
      })
      .returns({ ...newUserWithProcedure, _id: userId });

    UserMock.expects('findOne')
      .withExactArgs({ _id: userId })
      .chain('populate')
      .withExactArgs({
        path: 'sector',
        select: '_id sector',
        match: { company: get(credentials, 'company._id', null) },
      })
      .chain('lean')
      .withExactArgs({ virtuals: true, autopopulate: true })
      .returns({ ...newUserWithProcedure });


    const result = await UsersHelper.createUser(payload, credentials);

    expect(result).toMatchObject(newUserWithProcedure);
    RoleMock.verify();
    TaskMock.verify();
    UserMock.verify();
    sinon.assert.calledWithExactly(createHistoryStub, { _id: userId, sector: payload.sector }, credentials.company._id);
  });

  it('should create a coach', async () => {
    const payload = {
      identity: { lastname: 'Test', firstname: 'Toto' },
      local: { email: 'toto@test.com', password: '1234567890' },
      role: { client: roleId },
    };
    const newUser = {
      ...payload,
      role: { _id: roleId, name: 'coach', rights: [{ _id: new ObjectID() }] },
    };

    RoleMock
      .expects('findById')
      .withExactArgs(payload.role, { name: 1, interface: 1 })
      .chain('lean')
      .returns({ _id: roleId, name: 'coach', interface: 'client' });

    TaskMock.expects('find').never();

    UserMock.expects('create')
      .withExactArgs({
        ...payload,
        company: credentials.company._id,
        refreshToken: sinon.match.string,
      })
      .returns({ ...newUser, _id: userId });

    UserMock
      .expects('findOne')
      .withExactArgs({ _id: userId })
      .chain('populate')
      .withExactArgs({
        path: 'sector',
        select: '_id sector',
        match: { company: get(credentials, 'company._id', null) },
      })
      .chain('lean')
      .withExactArgs({ virtuals: true, autopopulate: true })
      .returns({ ...newUser });

    const result = await UsersHelper.createUser(payload, credentials);

    expect(result).toMatchObject(newUser);
    RoleMock.verify();
    TaskMock.verify();
    UserMock.verify();
    sinon.assert.notCalled(createHistoryStub);
  });

  it('should create a client admin', async () => {
    const payload = {
      identity: { lastname: 'Admin', firstname: 'Toto' },
      local: { email: 'admin@test.com', password: '1234567890' },
      role: { client: roleId },
      company: new ObjectID(),
    };
    const newUser = {
      ...payload,
      role: { _id: roleId, name: 'client_admin', rights: [{ _id: new ObjectID() }] },
    };

    RoleMock
      .expects('findById')
      .withExactArgs(payload.role, { name: 1, interface: 1 })
      .chain('lean')
      .returns({ _id: roleId, name: 'client_admin', interface: 'client' });

    TaskMock.expects('find').never();

    UserMock.expects('create')
      .withExactArgs({
        ...payload,
        refreshToken: sinon.match.string,
      })
      .returns({ ...newUser, _id: userId });

    UserMock
      .expects('findOne')
      .withExactArgs({ _id: userId })
      .chain('populate')
      .withExactArgs({
        path: 'sector',
        select: '_id sector',
        match: { company: payload.company },
      })
      .chain('lean')
      .withExactArgs({ virtuals: true, autopopulate: true })
      .returns({ ...newUser });


    const result = await UsersHelper.createUser(payload, credentials);

    expect(result).toMatchObject(newUser);
    RoleMock.verify();
    TaskMock.verify();
    UserMock.verify();
  });

  it('should return a 400 error if role does not exist', async () => {
    try {
      const payload = {
        identity: { lastname: 'Test', firstname: 'Toto' },
        local: { email: 'toto@test.com', password: '1234567890' },
        role: { client: roleId },
      };

      RoleMock
        .expects('findById')
        .withExactArgs(payload.role, { name: 1, interface: 1 })
        .chain('lean')
        .returns(null);

      TaskMock.expects('find').never();
      UserMock.expects('create').never();

      await UsersHelper.createUser(payload, credentials);
    } catch (e) {
      expect(e).toEqual(Boom.badRequest('Role does not exist'));
    } finally {
      RoleMock.verify();
      UserMock.verify();
      sinon.assert.notCalled(createHistoryStub);
    }
  });
});

describe('updateUser', () => {
  let UserMock;
  let updateHistoryOnSectorUpdateStub;
  const credentials = { company: { _id: new ObjectID() } };
  const userId = new ObjectID();
  const user = {
    _id: userId,
    role: {
      rights: [
        { right_id: { _id: new ObjectID().toHexString(), permission: 'test' }, hasAccess: true },
        { right_id: { _id: new ObjectID().toHexString(), permission: 'test2' }, hasAccess: false },
      ],
    },
  };

  beforeEach(() => {
    UserMock = sinon.mock(User);
    updateHistoryOnSectorUpdateStub = sinon.stub(SectorHistoriesHelper, 'updateHistoryOnSectorUpdate');
  });
  afterEach(() => {
    UserMock.restore();
    updateHistoryOnSectorUpdateStub.restore();
  });

  it('should update a user', async () => {
    const payload = { identity: { firstname: 'Titi' } };

    UserMock.expects('findOneAndUpdate')
      .withExactArgs(
        { _id: userId, company: credentials.company._id },
        { $set: flat(payload) },
        { new: true, runValidators: true }
      )
      .chain('lean')
      .withExactArgs({ autopopulate: true, virtuals: true })
      .returns({ ...user, ...payload });

    const result = await UsersHelper.updateUser(userId, payload, credentials);

    expect(result).toEqual({ ...user, ...payload });
    UserMock.verify();
    sinon.assert.notCalled(updateHistoryOnSectorUpdateStub);
  });

  it('should update a user and create sector history', async () => {
    const payload = { identity: { firstname: 'Titi' }, sector: new ObjectID() };

    UserMock.expects('findOneAndUpdate')
      .withExactArgs(
        { _id: userId, company: credentials.company._id },
        { $set: flat(payload) },
        { new: true, runValidators: true }
      )
      .chain('lean')
      .withExactArgs({ autopopulate: true, virtuals: true })
      .returns({ ...user, ...payload });

    const result = await UsersHelper.updateUser(userId, payload, credentials);

    expect(result).toMatchObject({ ...user, ...payload });
    UserMock.verify();
    sinon.assert.calledWithExactly(updateHistoryOnSectorUpdateStub, userId, payload.sector, credentials.company._id);
  });

  it('should update a user certificate', async () => {
    const payload = { 'administrative.certificates': { driveId: '1234567890' } };

    UserMock
      .expects('findOneAndUpdate')
      .withExactArgs({ _id: userId, company: credentials.company._id }, { $pull: payload }, { new: true })
      .chain('lean')
      .withExactArgs({ autopopulate: true, virtuals: true })
      .returns({ ...user, ...payload });

    const result = await UsersHelper.updateUser(userId, payload, credentials);

    expect(result).toMatchObject({ ...user, ...payload });
    UserMock.verify();
    sinon.assert.notCalled(updateHistoryOnSectorUpdateStub);
  });
});

describe('updateUserInactivityDate', () => {
  let countDocuments;
  let updateOne;
  beforeEach(() => {
    countDocuments = sinon.stub(Contract, 'countDocuments');
    updateOne = sinon.stub(User, 'updateOne');
  });
  afterEach(() => {
    countDocuments.restore();
    updateOne.restore();
  });

  it('should update user inactivity date', async () => {
    const userId = new ObjectID();
    const endDate = '2019-02-12T00:00:00';
    const credentials = { company: { _id: '1234567890' } };

    countDocuments.returns(0);

    await UsersHelper.updateUserInactivityDate(userId, endDate, credentials);
    sinon.assert.calledWithExactly(
      countDocuments,
      { user: userId, company: '1234567890', $or: [{ endDate: { $exists: false } }, { endDate: null }] }
    );
    sinon.assert.calledWithExactly(
      updateOne,
      { _id: userId },
      { $set: { inactivityDate: moment(endDate).add('1', 'month').startOf('M').toDate() } }
    );
  });

  it('should not update user inactivity date', async () => {
    const userId = new ObjectID();
    const endDate = '2019-02-12T00:00:00';
    const credentials = { company: { _id: '1234567890' } };

    countDocuments.returns(2);

    await UsersHelper.updateUserInactivityDate(userId, endDate, credentials);
    sinon.assert.calledWithExactly(
      countDocuments,
      { user: userId, company: '1234567890', $or: [{ endDate: { $exists: false } }, { endDate: null }] }
    );
    sinon.assert.notCalled(updateOne);
  });
});
