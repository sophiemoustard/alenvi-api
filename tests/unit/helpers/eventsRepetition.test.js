const expect = require('expect');
const sinon = require('sinon');
const moment = require('moment');
const omit = require('lodash/omit');
const { ObjectID } = require('mongodb');
const Event = require('../../../src/models/Event');
const Repetition = require('../../../src/models/Repetition');
const EventsRepetitionHelper = require('../../../src/helpers/eventsRepetition');
const EventsValidationHelper = require('../../../src/helpers/eventsValidation');
const RepetitionHelper = require('../../../src/helpers/repetitions');
const EventHistoriesHelper = require('../../../src/helpers/eventHistories');
const {
  INTERVENTION,
  ABSENCE,
  NEVER,
  EVERY_WEEK,
} = require('../../../src/helpers/constants');

require('sinon-mongoose');

describe('formatRepeatedPayload', () => {
  let hasConflicts;
  beforeEach(() => {
    hasConflicts = sinon.stub(EventsValidationHelper, 'hasConflicts');
  });
  afterEach(() => {
    hasConflicts.restore();
  });

  it('should format event with auxiliary', async () => {
    const day = moment('2019-07-17', 'YYYY-MM-DD');
    const auxiliaryId = new ObjectID();
    const event = {
      startDate: moment('2019-07-14').startOf('d'),
      endDate: moment('2019-07-15').startOf('d'),
      auxiliary: auxiliaryId,
      type: 'intervention',
    };
    const step = day.diff(event.startDate, 'd');
    const payload = {
      ...omit(event, '_id'),
      startDate: moment(event.startDate).add(step, 'd'),
      endDate: moment(event.endDate).add(step, 'd'),
    };
    hasConflicts.returns(false);
    const result = await EventsRepetitionHelper.formatRepeatedPayload(event, day);

    expect(result).toBeDefined();
    expect(result.startDate).toEqual(moment('2019-07-17').startOf('d').toDate());
    expect(result.endDate).toEqual(moment('2019-07-18').startOf('d').toDate());
    expect(result.auxiliary).toEqual(auxiliaryId);
    sinon.assert.calledWithExactly(hasConflicts, payload);
  });

  it('should format intervention without auxiliary', async () => {
    const auxiliaryId = new ObjectID();
    const day = moment('2019-07-17', 'YYYY-MM-DD');
    const event = {
      startDate: moment('2019-07-14').startOf('d'),
      endDate: moment('2019-07-15').startOf('d'),
      auxiliary: auxiliaryId,
      type: 'intervention',
      repetition: { frequency: 'every_week' },
    };
    const step = day.diff(event.startDate, 'd');
    const payload = {
      ...omit(event, '_id'),
      startDate: moment(event.startDate).add(step, 'd'),
      endDate: moment(event.endDate).add(step, 'd'),
    };
    hasConflicts.returns(true);
    const result = await EventsRepetitionHelper.formatRepeatedPayload(event, day);

    expect(result).toBeDefined();
    expect(result.startDate).toEqual(moment('2019-07-17').startOf('d').toDate());
    expect(result.endDate).toEqual(moment('2019-07-18').startOf('d').toDate());
    expect(result.auxiliary).not.toBeDefined();
    expect(result.repetition.frequency).toEqual('never');
    sinon.assert.calledWithExactly(hasConflicts, payload);
  });

  it('should format internal hour with auxiliary', async () => {
    const auxiliaryId = new ObjectID();
    const day = moment('2019-07-17', 'YYYY-MM-DD');
    const event = {
      _id: new ObjectID(),
      startDate: moment('2019-07-14').startOf('d'),
      endDate: moment('2019-07-15').startOf('d'),
      auxiliary: auxiliaryId,
      type: 'internalHour',
    };
    const step = day.diff(event.startDate, 'd');
    const payload = {
      ...omit(event, '_id'),
      startDate: moment(event.startDate).add(step, 'd'),
      endDate: moment(event.endDate).add(step, 'd'),
    };
    hasConflicts.returns(false);
    const result = await EventsRepetitionHelper.formatRepeatedPayload(event, day);

    expect(result).toBeDefined();
    expect(result.auxiliary).toBeDefined();
    sinon.assert.calledWithExactly(hasConflicts, payload);
  });

  it('should not called hasConflicts if event is not affected', async () => {
    const day = moment('2019-07-17', 'YYYY-MM-DD');
    const event = {
      startDate: moment('2019-07-14').startOf('d'),
      endDate: moment('2019-07-15').startOf('d'),
      type: 'intervention',
    };
    const step = day.diff(event.startDate, 'd');
    const payload = {
      ...omit(event, '_id'),
      startDate: moment(event.startDate).add(step, 'd'),
      endDate: moment(event.endDate).add(step, 'd'),
    };
    hasConflicts.returns(false);
    const result = await EventsRepetitionHelper.formatRepeatedPayload(event, day);
    expect(result).toBeDefined();
    expect(result.auxiliary).not.toBeDefined();
    sinon.assert.calledWithExactly(hasConflicts, payload);
  });

  it('should return null if event has conflict', async () => {
    const day = moment('2019-07-17', 'YYYY-MM-DD');
    const event = {
      startDate: moment('2019-07-14').startOf('d'),
      endDate: moment('2019-07-15').startOf('d'),
      type: 'intervention',
    };
    const step = day.diff(event.startDate, 'd');
    const payload = {
      ...omit(event, '_id'),
      startDate: moment(event.startDate).add(step, 'd'),
      endDate: moment(event.endDate).add(step, 'd'),
    };
    const result = await EventsRepetitionHelper.formatRepeatedPayload(event, day);

    expect(result).toBeDefined();
    expect(result.auxiliary).not.toBeDefined();
    sinon.assert.calledWithExactly(hasConflicts, payload);
  });

  it('should return null if event is an internal hour and auxiliary has conflict', async () => {
    const day = moment('2019-07-17', 'YYYY-MM-DD');
    const event = {
      _id: new ObjectID(),
      startDate: moment('2019-07-14').startOf('d'),
      endDate: moment('2019-07-15').startOf('d'),
      type: 'internalHour',
    };
    const step = day.diff(event.startDate, 'd');
    const payload = {
      ...omit(event, '_id'),
      startDate: moment(event.startDate).add(step, 'd'),
      endDate: moment(event.endDate).add(step, 'd'),
    };
    hasConflicts.returns(true);
    const result = await EventsRepetitionHelper.formatRepeatedPayload(event, day);

    expect(result).toBeNull();
    sinon.assert.calledWithExactly(hasConflicts, payload);
  });

  it('should return null if event is an unavailability and auxiliary has conflict', async () => {
    const day = moment('2019-07-17', 'YYYY-MM-DD');
    const event = {
      _id: new ObjectID(),
      startDate: moment('2019-07-14').startOf('d'),
      endDate: moment('2019-07-15').startOf('d'),
      type: 'unavailability',
    };
    const step = day.diff(event.startDate, 'd');
    const payload = {
      ...omit(event, '_id'),
      startDate: moment(event.startDate).add(step, 'd'),
      endDate: moment(event.endDate).add(step, 'd'),
    };
    hasConflicts.returns(true);
    const result = await EventsRepetitionHelper.formatRepeatedPayload(event, day);

    expect(result).toBeNull();
    sinon.assert.calledWithExactly(hasConflicts, payload);
  });
});

describe('createRepetitionsEveryDay', () => {
  let formatRepeatedPayload;
  let insertMany;
  beforeEach(() => {
    formatRepeatedPayload = sinon.stub(EventsRepetitionHelper, 'formatRepeatedPayload');
    insertMany = sinon.stub(Event, 'insertMany');
  });
  afterEach(() => {
    formatRepeatedPayload.restore();
    insertMany.restore();
  });

  it('should create repetition every day', async () => {
    const event = { startDate: '2019-01-10T09:00:00.000Z', endDate: '2019-01-10T11:00:00' };
    formatRepeatedPayload.returns(new Event({ company: new ObjectID() }));
    await EventsRepetitionHelper.createRepetitionsEveryDay(event);

    sinon.assert.callCount(formatRepeatedPayload, 90);
    sinon.assert.callCount(insertMany, 1);
  });
});

describe('createRepetitionsEveryWeekDay', () => {
  let formatRepeatedPayload;
  let insertMany;
  beforeEach(() => {
    formatRepeatedPayload = sinon.stub(EventsRepetitionHelper, 'formatRepeatedPayload');
    insertMany = sinon.stub(Event, 'insertMany');
  });
  afterEach(() => {
    formatRepeatedPayload.restore();
    insertMany.restore();
  });

  it('should create repetition every day', async () => {
    const event = { startDate: '2019-01-10T09:00:00', endDate: '2019-01-10T11:00:00' };
    formatRepeatedPayload.returns(new Event({ company: new ObjectID() }));
    await EventsRepetitionHelper.createRepetitionsEveryWeekDay(event);

    sinon.assert.callCount(formatRepeatedPayload, 64);
    sinon.assert.callCount(insertMany, 1);
  });
});

describe('createRepetitionsByWeek', () => {
  let formatRepeatedPayload;
  let insertMany;
  beforeEach(() => {
    formatRepeatedPayload = sinon.stub(EventsRepetitionHelper, 'formatRepeatedPayload');
    insertMany = sinon.stub(Event, 'insertMany');
  });
  afterEach(() => {
    formatRepeatedPayload.restore();
    insertMany.restore();
  });

  it('should create repetition every day', async () => {
    const event = { startDate: '2019-01-10T09:00:00', endDate: '2019-01-10T11:00:00' };
    formatRepeatedPayload.returns(new Event({ company: new ObjectID() }));
    await EventsRepetitionHelper.createRepetitionsByWeek(event);

    sinon.assert.callCount(formatRepeatedPayload, 13);
    sinon.assert.callCount(insertMany, 1);
  });
});

describe('createRepetitions', () => {
  let findOneAndUpdate;
  let createRepetitionsEveryDay;
  let createRepetitionsEveryWeekDay;
  let createRepetitionsByWeek;
  let saveRepetition;
  beforeEach(() => {
    findOneAndUpdate = sinon.stub(Event, 'findOneAndUpdate');
    createRepetitionsEveryDay = sinon.stub(EventsRepetitionHelper, 'createRepetitionsEveryDay');
    createRepetitionsEveryWeekDay = sinon.stub(EventsRepetitionHelper, 'createRepetitionsEveryWeekDay');
    createRepetitionsByWeek = sinon.stub(EventsRepetitionHelper, 'createRepetitionsByWeek');
    saveRepetition = sinon.stub(Repetition.prototype, 'save');
  });
  afterEach(() => {
    findOneAndUpdate.restore();
    createRepetitionsEveryDay.restore();
    createRepetitionsEveryWeekDay.restore();
    createRepetitionsByWeek.restore();
    saveRepetition.restore();
  });

  it('should call createRepetitionsEveryDay', async () => {
    const payload = { _id: '1234567890', repetition: { frequency: 'every_day', parentId: '0987654321' } };
    const event = new Event({ repetition: { frequency: EVERY_WEEK }, company: new ObjectID() });
    await EventsRepetitionHelper.createRepetitions(event, payload);

    sinon.assert.called(findOneAndUpdate);
    sinon.assert.called(saveRepetition);
  });

  it('should call createRepetitionsEveryDay', async () => {
    const payload = { _id: '1234567890', repetition: { frequency: 'every_day', parentId: '0987654321' } };
    const event = new Event({ company: new ObjectID() });
    await EventsRepetitionHelper.createRepetitions(event, payload);

    sinon.assert.notCalled(findOneAndUpdate);
    sinon.assert.called(createRepetitionsEveryDay);
    sinon.assert.called(saveRepetition);
  });

  it('should call createRepetitionsEveryWeekDay', async () => {
    const payload = { _id: '1234567890', repetition: { frequency: 'every_week_day', parentId: '0987654321' } };
    const event = new Event({ company: new ObjectID() });
    await EventsRepetitionHelper.createRepetitions(event, payload);

    sinon.assert.notCalled(findOneAndUpdate);
    sinon.assert.called(createRepetitionsEveryWeekDay);
    sinon.assert.called(saveRepetition);
  });

  it('should call createRepetitionsByWeek to repeat every week', async () => {
    const payload = { _id: '1234567890', repetition: { frequency: 'every_week', parentId: '0987654321' } };
    const event = new Event({ company: new ObjectID() });
    await EventsRepetitionHelper.createRepetitions(event, payload);

    sinon.assert.notCalled(findOneAndUpdate);
    sinon.assert.calledWithExactly(createRepetitionsByWeek, payload, 1);
    sinon.assert.called(saveRepetition);
  });

  it('should call createRepetitionsByWeek to repeat every two weeks', async () => {
    const payload = { _id: '1234567890', repetition: { frequency: 'every_two_weeks', parentId: '0987654321' } };
    const event = new Event({ company: new ObjectID() });
    await EventsRepetitionHelper.createRepetitions(event, payload);

    sinon.assert.notCalled(findOneAndUpdate);
    sinon.assert.calledWithExactly(createRepetitionsByWeek, payload, 2);
    sinon.assert.called(saveRepetition);
  });
});

describe('updateRepetition', () => {
  let hasConflicts;
  let findEvent;
  let findOneAndUpdateEvent;
  let updateRepetitions;
  beforeEach(() => {
    hasConflicts = sinon.stub(EventsValidationHelper, 'hasConflicts');
    findEvent = sinon.stub(Event, 'find');
    findOneAndUpdateEvent = sinon.stub(Event, 'findOneAndUpdate');
    updateRepetitions = sinon.stub(RepetitionHelper, 'updateRepetitions');
  });
  afterEach(() => {
    hasConflicts.restore();
    findEvent.restore();
    findOneAndUpdateEvent.restore();
    updateRepetitions.restore();
  });

  it('should update repetition', async () => {
    const event = { repetition: { parentId: 'qwertyuiop', frequency: 'every_day' }, startDate: '2019-03-23T09:00:00.000Z', type: INTERVENTION };
    const payload = { startDate: '2019-03-23T10:00:00.000Z', endDate: '2019-03-23T11:00:00.000Z', auxiliary: '1234567890' };
    const events = [
      { repetition: { parentId: 'qwertyuiop', frequency: 'every_day' }, startDate: '2019-03-23T09:00:00.000Z', endDate: '2019-03-23T11:00:00.000Z', _id: 'asdfghjk' },
      { repetition: { parentId: 'qwertyuiop', frequency: 'every_day' }, startDate: '2019-03-24T09:00:00.000Z', endDate: '2019-03-24T11:00:00.000Z', _id: '123456' },
      { repetition: { parentId: 'qwertyuiop', frequency: 'every_day' }, startDate: '2019-03-25T09:00:00.000Z', endDate: '2019-03-25T11:00:00.000Z', _id: '654321' },
    ];
    findEvent.returns(events);
    hasConflicts.returns(false);
    const credentials = { company: { _id: new ObjectID() } };
    await EventsRepetitionHelper.updateRepetition(event, payload, credentials);

    sinon.assert.calledWithExactly(
      findEvent,
      {
        'repetition.parentId': 'qwertyuiop',
        'repetition.frequency': { $not: { $eq: 'never' } },
        startDate: { $gte: new Date('2019-03-23T09:00:00.000Z') },
        company: credentials.company._id,
      }
    );
    sinon.assert.calledThrice(hasConflicts);
    sinon.assert.calledThrice(findOneAndUpdateEvent);
    sinon.assert.calledWithExactly(updateRepetitions, payload, 'qwertyuiop');
  });

  it('should unassign intervention in conflict', async () => {
    const event = { repetition: { parentId: 'qwertyuiop', frequency: 'every_day' }, startDate: '2019-03-23T09:00:00.000Z', type: INTERVENTION };
    const payload = { startDate: '2019-03-23T10:00:00.000Z', endDate: '2019-03-23T11:00:00.000Z', auxiliary: '1234567890' };
    const events = [
      { repetition: { parentId: 'qwertyuiop', frequency: 'every_day' }, startDate: '2019-03-24T09:00:00.000Z', endDate: '2019-03-24T11:00:00.000Z', _id: '123456' },
    ];
    findEvent.returns(events);
    hasConflicts.returns(true);
    const credentials = { company: { _id: new ObjectID() } };
    await EventsRepetitionHelper.updateRepetition(event, payload, credentials);

    sinon.assert.calledWithExactly(
      hasConflicts,
      {
        _id: '123456',
        auxiliary: '1234567890',
        startDate: '2019-03-24T10:00:00.000Z',
        endDate: '2019-03-24T11:00:00.000Z',
        company: credentials.company._id,
      }
    );
    sinon.assert.calledWithExactly(
      findOneAndUpdateEvent,
      { _id: '123456' },
      { $set: { _id: '123456', startDate: '2019-03-24T10:00:00.000Z', endDate: '2019-03-24T11:00:00.000Z' }, $unset: { auxiliary: '', repetition: '' } }
    );
    sinon.assert.calledWithExactly(updateRepetitions, payload, 'qwertyuiop');
  });
});

describe('deleteRepetition', () => {
  let createEventHistoryOnDelete;
  let deleteMany;
  let deleteOne;
  const credentials = { _id: (new ObjectID()).toHexString(), company: { _id: new ObjectID() } };
  beforeEach(() => {
    createEventHistoryOnDelete = sinon.stub(EventHistoriesHelper, 'createEventHistoryOnDelete');
    deleteMany = sinon.stub(Event, 'deleteMany');
    deleteOne = sinon.stub(Repetition, 'deleteOne');
  });
  afterEach(() => {
    createEventHistoryOnDelete.restore();
    deleteMany.restore();
    deleteOne.restore();
  });

  it('should delete repetition', async () => {
    const parentId = new ObjectID();
    const event = {
      type: INTERVENTION,
      repetition: { frequency: EVERY_WEEK, parentId },
      startDate: '2019-01-21T09:38:18.653Z',
    };
    const result = await EventsRepetitionHelper.deleteRepetition(event, credentials);

    expect(result).toEqual(event);
    sinon.assert.calledWithExactly(createEventHistoryOnDelete, event, credentials);
    sinon.assert.calledWithExactly(
      deleteMany,
      {
        'repetition.parentId': parentId,
        startDate: { $gte: new Date(event.startDate) },
        $or: [{ isBilled: false }, { isBilled: { $exists: false } }],
        company: credentials.company._id,
      }
    );
    sinon.assert.calledWithExactly(deleteOne, { parentId });
  });

  it('should not delete repetition as event is absence', async () => {
    const event = {
      type: ABSENCE,
      repetition: { frequency: EVERY_WEEK },
      startDate: '2019-01-21T09:38:18.653Z',
    };
    const result = await EventsRepetitionHelper.deleteRepetition(event, credentials);

    expect(result).toEqual(event);
    sinon.assert.notCalled(createEventHistoryOnDelete);
    sinon.assert.notCalled(deleteMany);
    sinon.assert.notCalled(deleteOne);
  });

  it('should not delete repetition as event is not a repetition', async () => {
    const parentId = new ObjectID();
    const event = {
      type: INTERVENTION,
      repetition: {
        frequency: NEVER,
        parentId,
      },
      startDate: '2019-01-21T09:38:18.653Z',
    };
    const result = await EventsRepetitionHelper.deleteRepetition(event, credentials);

    expect(result).toEqual(event);
    sinon.assert.notCalled(createEventHistoryOnDelete);
    sinon.assert.notCalled(deleteMany);
    sinon.assert.notCalled(deleteOne);
  });
});
