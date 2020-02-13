const expect = require('expect');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PassThrough } = require('stream');
const FileHelper = require('../../../src/helpers/file');

describe('createAndReadFile', () => {
  let readable;
  let writable;
  let createWriteStreamStub;
  let createReadStreamStub;
  const outputPath = '/src/data/file.txt';

  beforeEach(() => {
    readable = new PassThrough();
    writable = new PassThrough();
    createWriteStreamStub = sinon.stub(fs, 'createWriteStream').returns(writable);
    createReadStreamStub = sinon.stub(fs, 'createReadStream');
  });

  afterEach(() => {
    createWriteStreamStub.restore();
    createReadStreamStub.restore();
  });

  it('should rejects/errors if a write stream error occurs', async () => {
    const error = new Error('You crossed the streams!');

    const resultPromise = FileHelper.createAndReadFile(readable, outputPath);
    setTimeout(async () => {
      writable.emit('error', error);
    }, 100);

    await expect(resultPromise).rejects.toEqual(error);
    sinon.assert.calledWithExactly(createWriteStreamStub, outputPath);
    sinon.assert.notCalled(createReadStreamStub);
  });

  it('should resolves if data writes successfully', async () => {
    const resultPromise = FileHelper.createAndReadFile(readable, outputPath);
    setTimeout(async () => {
      readable.emit('data', 'Ceci');
      readable.emit('data', 'est');
      readable.emit('data', 'un');
      readable.emit('data', 'test !');
      readable.emit('end');
    }, 100);

    await expect(resultPromise).resolves.toEqual(undefined);
    sinon.assert.calledWithExactly(createWriteStreamStub, outputPath);
    sinon.assert.calledWithExactly(createReadStreamStub, outputPath);
  });
});

describe('fileToBase64', () => {
  let readable;
  let createReadStreamStub;
  const filePath = '/src/data/file.txt';

  beforeEach(() => {
    readable = new PassThrough();
    createReadStreamStub = sinon.stub(fs, 'createReadStream').returns(readable);
  });

  afterEach(() => {
    createReadStreamStub.restore();
  });

  it('should rejects/errors if read stream error occurs', async () => {
    const error = new Error('You crossed the stream!');
    const resultPromise = FileHelper.fileToBase64(filePath);
    setTimeout(async () => {
      readable.emit('error', error);
    }, 100);

    await expect(resultPromise).rejects.toEqual(error);
    sinon.assert.calledWithExactly(createReadStreamStub, filePath);
  });

  it('should resolves to a base64 string if data writes successfully', async () => {
    const resultPromise = FileHelper.fileToBase64(filePath);
    setTimeout(async () => {
      readable.emit('data', Buffer.from('Ceci', 'utf-8'));
      readable.emit('data', Buffer.from('est', 'utf-8'));
      readable.emit('data', Buffer.from('un', 'utf-8'));
      readable.emit('data', Buffer.from('test !', 'utf-8'));
      readable.end();
    }, 100);

    await expect(resultPromise).resolves.toEqual(expect.any(String));
    sinon.assert.calledWithExactly(createReadStreamStub, filePath);
  });
});

describe('exportToCsv', () => {
  it('should return a csv file path from data array', async () => {
    const date = new Date('2020-01-04');
    const fakeDate = sinon.useFakeTimers(date);
    const data = [['Prénom', 'Nom', 'Age'], ['Jean', 'Bonbeurre', 50], ['Bob', 'Eponge', 20]];
    const outputPath = path.join(os.tmpdir(), `exports-${date.getTime()}.csv`);
    const writeFileStub = sinon.stub(fs.promises, 'writeFile');
    const csvContent = '\ufeff"Prénom";"Nom";"Age"\r\n"Jean";"Bonbeurre";50\r\n"Bob";"Eponge";20';

    const result = await FileHelper.exportToCsv(data);
    expect(result).toBe(outputPath);
    sinon.assert.calledWithExactly(writeFileStub, outputPath, csvContent, 'utf8');
    writeFileStub.restore();
    fakeDate.restore();
  });
});
