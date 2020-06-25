const expect = require('expect');
const VersionHelper = require('../../../src/helpers/version');

describe('checkUpdate', () => {
  beforeEach(() => {
    process.env.API_VERSION = '2.3.4';
  });
  afterEach(() => {
    process.env.API_VERSION = '';
  });

  it('should return true if not same version', async () => {
    const result = await VersionHelper.checkUpdate('1');
    expect(result).toBeTruthy();
  });

  it('should return false if same version', async () => {
    const result = await VersionHelper.checkUpdate('2');
    expect(result).toBeFalsy();
  });
});