const expect = require('expect');
const moment = require('moment');
const sinon = require('sinon');
const { ObjectID } = require('mongodb');
const omit = require('lodash/omit');
const pick = require('lodash/pick');

const UtilsHelper = require('../../../src/helpers/utils');

describe('getLastVersion', () => {
  it('should return the last version based on the date key', () => {
    const versions = [
      { startDate: '2021-09-21T00:00:00', createdAt: '2021-09-21T00:00:00', _id: 1 },
      { startDate: '2021-09-24T00:00:00', createdAt: '2021-09-18T00:00:00', _id: 2 },
    ];

    expect(UtilsHelper.getLastVersion(versions, 'startDate')).toBeDefined();
    expect(UtilsHelper.getLastVersion(versions, 'startDate')._id).toEqual(2);
    expect(UtilsHelper.getLastVersion(versions, 'createdAt')).toBeDefined();
    expect(UtilsHelper.getLastVersion(versions, 'createdAt')._id).toEqual(1);
  });

  it('should return null if versions is empty', () => {
    expect(UtilsHelper.getLastVersion([], 'toto')).toBeNull();
  });

  it('should return the single element is versions only contains one element', () => {
    const versions = [{ startDate: '2021-09-21T00:00:00', createdAt: '2021-09-21T00:00:00', _id: 1 }];

    const result = UtilsHelper.getLastVersion(versions, 'startDate');

    expect(result).toBeDefined();
    expect(result._id).toEqual(1);
  });
});

describe('mergeLastVersionWithBaseObject', () => {
  let getLastVersion;
  beforeEach(() => {
    getLastVersion = sinon.stub(UtilsHelper, 'getLastVersion');
  });
  afterEach(() => {
    getLastVersion.restore();
  });

  it('should merge last version of given object with that same object', () => {
    const baseObj = { tpp: '123456', frequency: 'once', versions: [{ createdAt: '2021-09-21T00:00:00' }] };

    getLastVersion.returns(baseObj.versions[0]);

    const result = UtilsHelper.mergeLastVersionWithBaseObject(baseObj, 'createdAt');

    expect(result).toEqual(expect.objectContaining({ ...baseObj.versions[0], ...omit(baseObj, ['versions']) }));
    sinon.assert.calledWithExactly(getLastVersion, baseObj.versions, 'createdAt');
  });

  it('should throw an error if last version cannot be found', () => {
    const baseObj = { tpp: '123456', frequency: 'once', versions: [{ createdAt: '2021-09-21T00:00:00' }] };
    getLastVersion.returns(null);

    expect(() => UtilsHelper.mergeLastVersionWithBaseObject(baseObj, 'createdAt'))
      .toThrowError('Unable to find last version from base object !');
  });
});

describe('getMatchingVersion', () => {
  it('should return null if versions is empty', () => {
    expect(UtilsHelper.getMatchingVersion('2021-09-21T00:00:00', { versions: [] }, 'startDate')).toBeNull();
  });

  it('should return the matching version', () => {
    const obj = {
      versions: [
        { startDate: '2021-09-12T00:00:00', _id: 1 },
        { startDate: '2021-10-21T00:00:00', _id: 2 },
      ],
    };

    const result = UtilsHelper.getMatchingVersion('2021-09-21T00:00:00', obj, 'startDate');
    expect(result).toBeDefined();
    expect(result.versionId).toEqual(1);
  });

  it('should return the last matching version', () => {
    const obj = {
      versions: [
        { startDate: '2021-09-01T00:00:00', _id: 1 },
        { startDate: '2021-09-12T00:00:00', _id: 3 },
        { startDate: '2021-10-21T00:00:00', _id: 2 },
      ],
    };

    const result = UtilsHelper.getMatchingVersion('2021-09-21T00:00:00', obj, 'startDate');
    expect(result).toBeDefined();
    expect(result.versionId).toEqual(3);
  });

  it('should return null if no matching version', () => {
    const obj = {
      versions: [
        { startDate: '2021-09-12T00:00:00', endDate: '2021-09-13T00:00:00', _id: 1 },
        { startDate: '2021-10-21T00:00:00', _id: 2 },
      ],
    };

    expect(UtilsHelper.getMatchingVersion('2021-09-21T00:00:00', obj, 'startDate')).toBeNull();
  });
});

describe('getMatchingObject', () => {
  it('should return null if versions is empty', () => {
    expect(UtilsHelper.getMatchingObject('2021-09-21T00:00:00', [], 'startDate')).toBeNull();
  });

  it('should return the matching object', () => {
    const obj = [
      { startDate: '2021-09-12T00:00:00', _id: 1 },
      { startDate: '2021-10-12T00:00:00', _id: 2 },
    ];

    const result = UtilsHelper.getMatchingObject('2021-09-21T00:00:00', obj, 'startDate');
    expect(result).toBeDefined();
    expect(result._id).toEqual(1);
  });

  it('should return null if no matching version', () => {
    const obj = [
      { startDate: '2021-09-12T00:00:00', endDate: '2021-09-13T00:00:00', _id: 1 },
      { startDate: '2021-10-12T00:00:00', _id: 2 },
    ];

    expect(UtilsHelper.getMatchingObject('2021-09-21T00:00:00', obj, 'startDate')).toBeNull();
  });
});

describe('getFixedNumber', () => {
  it('should return number to string with number of decimals as provided by parameter', () => {
    const result = UtilsHelper.getFixedNumber(10, 2);
    expect(result).toBe('10.00');
  });
});

describe('removeSpaces', () => {
  it('should remove all spaces from string', () => {
    const result = UtilsHelper.removeSpaces('he llo  world  ');
    expect(result).toBe('helloworld');
  });

  it('should return an empty string if parameter is missing', () => {
    const result = UtilsHelper.removeSpaces();
    expect(result).toBe('');
  });
});

describe('formatPrice', () => {
  it('should format price', () => {
    const res = UtilsHelper.formatPrice(5.5);
    expect(res).toEqual('5,50\u00a0€');
  });
});

describe('getFullTitleFromIdentity', () => {
  const identityBase = {
    title: 'mr',
    firstname: 'Bojack',
    lastname: 'Horseman',
  };

  it('should return the title, the firstname and the name', () => {
    const result = UtilsHelper.getFullTitleFromIdentity(identityBase);
    expect(result).toBe('M. Bojack HORSEMAN');
  });

  it('should return the title and the lastname', () => {
    const result = UtilsHelper.getFullTitleFromIdentity(omit(identityBase, 'firstname'));
    expect(result).toBe('M. HORSEMAN');
  });

  it('should return the firstname and the name', () => {
    const result = UtilsHelper.getFullTitleFromIdentity(omit(identityBase, 'title'));
    expect(result).toBe('Bojack HORSEMAN');
  });

  it('should return the firstname', () => {
    const result = UtilsHelper.getFullTitleFromIdentity(pick(identityBase, 'firstname'));
    expect(result).toBe('Bojack');
  });

  it('should return the lastname', () => {
    const result = UtilsHelper.getFullTitleFromIdentity(pick(identityBase, 'lastname'));
    expect(result).toBe('HORSEMAN');
  });

  it('should return an empty string if the identity is not provided', () => {
    expect(UtilsHelper.getFullTitleFromIdentity()).toBe('');
  });
});

describe('formatFloatForExport', () => {
  const validCases = [[0, '0,00'], [1, '1,00'], [7.1, '7,10'], [3.56, '3,56'], [4.23506, '4,24']];
  const invalidValues = [null, undefined, NaN];

  validCases.forEach(([param, result]) => {
    it('should return a formatted float on a valid float', () => {
      expect(UtilsHelper.formatFloatForExport(param)).toBe(result);
    });
  });

  invalidValues.forEach((param) => {
    it('should return an empty string on an invalid value', () => {
      expect(UtilsHelper.formatFloatForExport(param)).toBe('');
    });
  });
});

describe('getDaysRatioBetweenTwoDates', () => {
  it('Case 1. No sundays nor holidays in range', () => {
    const start = new Date('2019/05/21');
    const end = new Date('2019/05/23');
    const result = UtilsHelper.getDaysRatioBetweenTwoDates(start, end);

    expect(result).toBeDefined();
    expect(result).toEqual({ holidays: 0, sundays: 0, businessDays: 3 });
  });

  it('Case 2. Sundays in range', () => {
    const start = new Date('2019/05/18');
    const end = new Date('2019/05/23');
    const result = UtilsHelper.getDaysRatioBetweenTwoDates(start, end);

    expect(result).toBeDefined();
    expect(result).toEqual({ holidays: 0, sundays: 1, businessDays: 5 });
  });

  it('Case 3. Holidays in range', () => {
    const start = new Date('2022/04/17');
    const end = new Date('2022/04/19');
    const result = UtilsHelper.getDaysRatioBetweenTwoDates(start, end);

    expect(result).toBeDefined();
    expect(result).toEqual({ holidays: 1, sundays: 1, businessDays: 1 });
  });
});

describe('formatDuration', () => {
  it('should format duration with minutes', () => {
    const duration = moment.duration({ minutes: 20, hours: 2 });
    const result = UtilsHelper.formatDuration(duration);

    expect(result).toEqual('2h20');
  });
  it('should format duration with padded minutes', () => {
    const duration = moment.duration({ minutes: 2, hours: 2 });
    const result = UtilsHelper.formatDuration(duration);

    expect(result).toEqual('2h02');
  });
  it('should format duration with days', () => {
    const duration = moment.duration({ days: 2, hours: 2 });
    const result = UtilsHelper.formatDuration(duration);

    expect(result).toEqual('50h');
  });
});

describe('areObjectIdsEquals', () => {
  it('should return true if object ids are the same', () => {
    const id1 = new ObjectID();
    const id2 = id1.toHexString();

    const result = UtilsHelper.areObjectIdsEquals(id1, id2);

    expect(result).toBe(true);
  });

  it('should return false if object ids are not the same', () => {
    const id1 = new ObjectID();
    const id2 = new ObjectID().toHexString();

    const result = UtilsHelper.areObjectIdsEquals(id1, id2);

    expect(result).toBe(false);
  });

  it('should return false if one object id is missing', () => {
    const id1 = '';
    const id2 = new ObjectID().toHexString();

    const result = UtilsHelper.areObjectIdsEquals(id1, id2);

    expect(result).toBe(false);
  });

  it('should return false if both object ids are missing', () => {
    const id1 = '';
    const id2 = '';

    const result = UtilsHelper.areObjectIdsEquals(id1, id2);

    expect(result).toBe(false);
  });
});

describe('doesArrayIncludeId', () => {
  let areObjectIdsEqualStub;

  beforeEach(() => { areObjectIdsEqualStub = sinon.stub(UtilsHelper, 'areObjectIdsEquals'); });

  afterEach(() => { areObjectIdsEqualStub.restore(); });

  it('should return true if the array includes the id', () => {
    const correctId = new ObjectID();
    const incorrectId = new ObjectID();
    areObjectIdsEqualStub.onCall(0).returns(false);
    areObjectIdsEqualStub.onCall(1).returns(true);

    const result = UtilsHelper.doesArrayIncludeId([incorrectId, correctId], correctId);

    expect(result).toBe(true);
    sinon.assert.calledWithExactly(areObjectIdsEqualStub.getCall(0), incorrectId, correctId);
    sinon.assert.calledWithExactly(areObjectIdsEqualStub.getCall(1), correctId, correctId);
  });

  it('should return false if the array does not include the id', () => {
    areObjectIdsEqualStub.onCall(0).returns(false);
    areObjectIdsEqualStub.onCall(1).returns(false);

    const result = UtilsHelper.doesArrayIncludeId([new ObjectID(), new ObjectID()], new ObjectID());

    expect(result).toBe(false);
  });
});
