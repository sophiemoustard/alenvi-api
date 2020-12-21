const expect = require('expect');
const omit = require('lodash/omit');
const GetStream = require('get-stream');
const path = require('path');
const fs = require('fs');
const sinon = require('sinon');
const GdriveStorage = require('../../src/helpers/gdriveStorage');
const DriveHelper = require('../../src/helpers/drive');
const DocxHelper = require('../../src/helpers/docx');
const Drive = require('../../src/models/Google/Drive');
const { generateFormData } = require('./utils');
const { getToken } = require('./seed/authenticationSeed');
const { auxiliary, populateDB } = require('./seed/driveSeed');
const app = require('../../server');

describe('NODE ENV', () => {
  it('should be "test"', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('POST /gdrive/:id/upload', () => {
  let authToken;
  const userFolderId = auxiliary.administrative.driveFolder.driveId;
  let addFileStub;
  let uploadFileSpy;
  beforeEach(() => {
    addFileStub = sinon
      .stub(GdriveStorage, 'addFile')
      .returns({ id: 'qwerty', webViewLink: 'http://test.com/file.pdf' });
    uploadFileSpy = sinon.spy(DriveHelper, 'uploadFile');
  });

  afterEach(() => {
    addFileStub.restore();
    uploadFileSpy.restore();
  });
  describe('CLIENT_ADMIN', () => {
    beforeEach(populateDB);
    beforeEach(async () => {
      authToken = await getToken('client_admin');
    });

    it('should add an absence document for an event', async () => {
      const payload = {
        file: fs.createReadStream(path.join(__dirname, 'assets/test_esign.pdf')),
        fileName: 'absence',
        type: 'absence',
      };
      const form = generateFormData(payload);
      const response = await app.inject({
        method: 'POST',
        url: `/gdrive/${userFolderId}/upload`,
        payload: await GetStream(form),
        headers: { ...form.getHeaders(), Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.result.data.payload).toMatchObject({
        attachment: { driveId: 'qwerty', link: 'http://test.com/file.pdf' },
      });
      sinon.assert.calledWith(uploadFileSpy, userFolderId, sinon.match({ fileName: 'absence' }));
      sinon.assert.calledOnce(addFileStub);
    });

    const missingParams = ['file', 'fileName'];
    missingParams.forEach((param) => {
      it(`should return a 400 error if '${param}' params is missing`, async () => {
        const payload = {
          file: fs.createReadStream(path.join(__dirname, 'assets/test_esign.pdf')),
          fileName: 'absence',
        };
        const form = generateFormData(omit(payload, param));
        const response = await app.inject({
          method: 'POST',
          url: `/gdrive/${userFolderId}/upload`,
          payload: await GetStream(form),
          headers: { ...form.getHeaders(), Cookie: `alenvi_token=${authToken}` },
        });

        expect(response.statusCode).toBe(400);
        sinon.assert.notCalled(uploadFileSpy);
        sinon.assert.notCalled(addFileStub);
      });
    });
  });
});

describe('DELETE /gdrive/file/:id', () => {
  let authToken;
  describe('CLIENT_ADMIN', () => {
    const userFileId = auxiliary.administrative.passport.driveId;
    let deleteFileStub;

    beforeEach(populateDB);
    beforeEach(async () => {
      authToken = await getToken('client_admin');
      deleteFileStub = sinon.stub(Drive, 'deleteFile');
    });

    afterEach(() => {
      deleteFileStub.restore();
    });

    it('should delete a document from google drive', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/gdrive/file/${userFileId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      sinon.assert.calledWithExactly(deleteFileStub, { fileId: userFileId });
    });
  });
});

describe('GET /gdrive/file/:id', () => {
  let authToken;
  describe('CLIENT_ADMIN', () => {
    const userFileId = auxiliary.administrative.passport.driveId;
    let getFileByIdStub;

    beforeEach(populateDB);
    beforeEach(async () => {
      authToken = await getToken('client_admin');
      getFileByIdStub = sinon.stub(Drive, 'getFileById');
    });

    afterEach(() => {
      getFileByIdStub.restore();
    });

    it('should return a document info from google drive', async () => {
      const fileInfo = {
        name: 'test',
        webViewLink: 'https://test.com/1234567890',
        thumbnailLink: 'https://test.com/img.jpg',
      };
      getFileByIdStub.returns(fileInfo);

      const response = await app.inject({
        method: 'GET',
        url: `/gdrive/file/${userFileId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.result.data.file).toEqual(fileInfo);
      sinon.assert.calledWithExactly(getFileByIdStub, { fileId: userFileId });
    });

    it('should return a 404 error if file is missing from google drive', async () => {
      getFileByIdStub.throws({ message: 'file not found' });

      const response = await app.inject({
        method: 'GET',
        url: `/gdrive/file/${userFileId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(404);
      sinon.assert.calledWithExactly(getFileByIdStub, { fileId: userFileId });
    });
  });
});

describe('GET /gdrive/list', () => {
  let authToken;
  describe('CLIENT_ADMIN', () => {
    const userFolderId = auxiliary.administrative.driveFolder.driveId;
    let listStub;

    beforeEach(populateDB);
    beforeEach(async () => {
      authToken = await getToken('client_admin');
      listStub = sinon.stub(Drive, 'list');
    });

    afterEach(() => {
      listStub.restore();
    });

    it('should a list of documents from google drive', async () => {
      const fileList = [{
        name: 'test',
        webViewLink: 'https://test.com/1234567890',
        thumbnailLink: 'https://test.com/img.jpg',
      }, {
        name: 'test2',
        webViewLink: 'https://test.com/1234567892',
        thumbnailLink: 'https://test.com/img2.jpg',
      }];
      listStub.returns({ files: fileList });

      const response = await app.inject({
        method: 'GET',
        url: `/gdrive/list?folderId=${userFolderId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.result.data.files).toEqual(fileList);
      sinon.assert.calledWithExactly(listStub, { folderId: userFolderId });
    });

    it('should return a 404 error if folder is missing from google drive', async () => {
      listStub.throws({ message: 'file not found' });

      const response = await app.inject({
        method: 'GET',
        url: `/gdrive/list?folderId=${userFolderId}`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(404);
      sinon.assert.calledWithExactly(listStub, { folderId: userFolderId });
    });
  });
});

describe('POST /gdrive/generatedocx', () => {
  let authToken;
  describe('CLIENT_ADMIN', () => {
    let generateDocxStub;

    beforeEach(populateDB);
    beforeEach(async () => {
      authToken = await getToken('client_admin');
      generateDocxStub = sinon.stub(DocxHelper, 'generateDocx');
    });

    afterEach(() => {
      generateDocxStub.restore();
    });

    it('should generate a docx document from google drive', async () => {
      const fileDriveId = '1234567890';
      const payload = { firstname: 'Jean', lastname: 'Bonbeurre' };
      generateDocxStub.returns(path.join(__dirname, './assets/signature_request.docx'));

      const response = await app.inject({
        method: 'POST',
        url: `/gdrive/${fileDriveId}/generatedocx`,
        payload,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      sinon.assert.calledWithExactly(generateDocxStub, { file: { fileId: fileDriveId }, data: payload });
    });
  });
});

describe('POST /gdrive/file/:id/download', () => {
  let authToken;
  describe('CLIENT_ADMIN', () => {
    let downloadFileStub;

    beforeEach(populateDB);
    beforeEach(async () => {
      authToken = await getToken('client_admin');
      downloadFileStub = sinon.stub(DriveHelper, 'downloadFile');
    });

    afterEach(() => {
      downloadFileStub.restore();
    });

    it('should generate a docx document from google drive', async () => {
      const fileDriveId = '1234567890';
      downloadFileStub.returns(path.join(__dirname, './assets/signature_request.docx'));

      const response = await app.inject({
        method: 'GET',
        url: `/gdrive/file/${fileDriveId}/download`,
        headers: { Cookie: `alenvi_token=${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      sinon.assert.calledWithExactly(downloadFileStub, fileDriveId);
    });
  });
});
