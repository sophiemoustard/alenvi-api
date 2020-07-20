const sinon = require('sinon');
const expect = require('expect');
const { ObjectID } = require('mongodb');
const Step = require('../../../src/models/Step');
const Activity = require('../../../src/models/Activity');
const ActivityHelper = require('../../../src/helpers/activities');
require('sinon-mongoose');

describe('getActivity', () => {
  let ActivityMock;

  beforeEach(() => {
    ActivityMock = sinon.mock(Activity);
  });

  afterEach(() => {
    ActivityMock.restore();
  });

  it('should return the requested activity', async () => {
    const activity = { _id: new ObjectID() };

    ActivityMock.expects('findOne')
      .withExactArgs({ _id: activity._id })
      .chain('lean')
      .once()
      .returns(activity);

    const result = await ActivityHelper.getActivity(activity._id);
    expect(result).toMatchObject(activity);
  });
});

describe('updateActivity', () => {
  let ActivityMock;

  beforeEach(() => {
    ActivityMock = sinon.mock(Activity);
  });

  afterEach(() => {
    ActivityMock.restore();
  });

  it("should update an activity's title", async () => {
    const activity = { _id: new ObjectID(), title: 'faire du pedalo' };
    const payload = { title: 'faire dodo' };

    ActivityMock.expects('updateOne')
      .withExactArgs({ _id: activity._id }, { $set: payload })
      .once();

    await ActivityHelper.updateActivity(activity._id, payload);

    ActivityMock.verify();
  });
});

describe('addActivity', () => {
  let StepMock;
  let ActivityMock;

  beforeEach(() => {
    StepMock = sinon.mock(Step);
    ActivityMock = sinon.mock(Activity);
  });

  afterEach(() => {
    StepMock.restore();
    ActivityMock.restore();
  });

  const step = { _id: new ObjectID(), title: 'step' };
  const newActivity = { title: 'c\'est une étape !' };
  it('should create an activity', async () => {
    const activityId = new ObjectID();
    StepMock.expects('countDocuments').withExactArgs({ _id: step._id }).returns(1);

    ActivityMock.expects('create').withExactArgs(newActivity).returns({ _id: activityId });

    const returnedStep = { ...step, steps: [activityId] };
    StepMock.expects('findOneAndUpdate')
      .withExactArgs({ _id: step._id }, { $push: { activities: activityId } }, { new: true })
      .chain('lean')
      .returns(returnedStep);

    const result = await ActivityHelper.addActivity(step._id, newActivity);

    expect(result).toMatchObject(returnedStep);
    StepMock.verify();
    ActivityMock.verify();
  });

  it('should return an error if step does not exist', async () => {
    try {
      StepMock.expects('countDocuments').withExactArgs({ _id: step._id }).returns(0);

      ActivityMock.expects('create').never();
      StepMock.expects('findOneAndUpdate').never();

      const result = await ActivityHelper.addActivity(step._id, newActivity);

      expect(result).toBeUndefined();
    } catch (e) {
      StepMock.verify();
      ActivityMock.verify();
    }
  });
});
