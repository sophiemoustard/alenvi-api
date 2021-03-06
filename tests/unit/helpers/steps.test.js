const sinon = require('sinon');
const expect = require('expect');
const { ObjectID } = require('mongodb');
const SubProgram = require('../../../src/models/SubProgram');
const Step = require('../../../src/models/Step');
const StepHelper = require('../../../src/helpers/steps');
const { E_LEARNING } = require('../../../src/helpers/constants');

describe('updateStep', () => {
  let updateOne;
  beforeEach(() => {
    updateOne = sinon.stub(Step, 'updateOne');
  });
  afterEach(() => {
    updateOne.restore();
  });

  it('should update a step\'s name', async () => {
    const step = { _id: new ObjectID(), name: 'jour' };
    const payload = { name: 'nuit' };

    await StepHelper.updateStep(step._id, payload);

    sinon.assert.calledOnceWithExactly(updateOne, { _id: step._id }, { $set: payload });
  });
});

describe('addStep', () => {
  let updateOneSupProgram;
  let createStep;

  beforeEach(() => {
    updateOneSupProgram = sinon.stub(SubProgram, 'updateOne');
    createStep = sinon.stub(Step, 'create');
  });

  afterEach(() => {
    updateOneSupProgram.restore();
    createStep.restore();
  });

  it('should create a step', async () => {
    const subProgram = { _id: new ObjectID() };
    const newStep = { name: 'c\'est une étape !', type: 'lesson' };
    const stepId = new ObjectID();
    createStep.returns({ _id: stepId });

    await StepHelper.addStep(subProgram._id, newStep);

    sinon.assert.calledOnceWithExactly(updateOneSupProgram, { _id: subProgram._id }, { $push: { steps: stepId } });
    sinon.assert.calledOnceWithExactly(createStep, newStep);
  });
});

describe('reuseActivity', () => {
  let updateOne;
  beforeEach(() => {
    updateOne = sinon.stub(Step, 'updateOne');
  });
  afterEach(() => {
    updateOne.restore();
  });

  it('should push a reused activity', async () => {
    const step = { _id: new ObjectID() };
    const payload = { activities: new ObjectID() };

    await StepHelper.reuseActivity(step._id, payload);

    sinon.assert.calledOnceWithExactly(updateOne, { _id: step._id }, { $push: payload });
  });
});

describe('detachStep', () => {
  let SubProgramUpdate;

  beforeEach(() => {
    SubProgramUpdate = sinon.stub(SubProgram, 'updateOne');
  });

  afterEach(() => {
    SubProgramUpdate.restore();
  });

  it('remove stepId of subProgram', async () => {
    const stepId = new ObjectID();
    const subProgramId = new ObjectID();

    await StepHelper.detachStep(subProgramId, stepId);

    sinon.assert.calledWithExactly(SubProgramUpdate, { _id: subProgramId }, { $pull: { steps: stepId } });
  });
});

describe('elearningStepProgress', () => {
  it('should get elearning steps progress', async () => {
    const step = {
      _id: '5fa159a1795723a10b12825a',
      activities: [{ activityHistories: [{}, {}] }],
      name: 'Développement personnel full stack',
      type: E_LEARNING,
      areActivitiesValid: false,
    };

    const result = await StepHelper.elearningStepProgress(step);
    expect(result).toBe(1);
  });

  it('should return 0 if no activityHistories', async () => {
    const step = {
      _id: '5fa159a1795723a10b12825a',
      activities: [],
      name: 'Développement personnel full stack',
      type: E_LEARNING,
      areActivitiesValid: false,
    };

    const result = await StepHelper.elearningStepProgress(step);
    expect(result).toBe(0);
  });
});

describe('onSiteStepProgress', () => {
  let eLearningStepProgressStub;
  beforeEach(() => {
    eLearningStepProgressStub = sinon.stub(StepHelper, 'elearningStepProgress');
  });

  afterEach(() => {
    eLearningStepProgressStub.restore();
  });

  it('should get on site steps progress', async () => {
    const stepId = new ObjectID();
    const step = {
      _id: stepId,
      activities: [],
    };

    const slots = [
      { endDate: '2020-11-03T09:00:00.000Z', step: stepId },
      { endDate: '2020-11-04T16:01:00.000Z', step: stepId },
    ];

    const result = await StepHelper.onSiteStepProgress(step, slots);
    expect(result).toBe(1);
    sinon.assert.notCalled(eLearningStepProgressStub);
  });

  it('should get on site steps progress with progress of elearning activities', async () => {
    const stepId = new ObjectID();
    const step = {
      _id: stepId,
      activities: [{ _id: new ObjectID() }],
    };

    const slots = [
      { endDate: '2020-11-03T09:00:00.000Z', step: stepId },
      { endDate: '2020-11-04T16:01:00.000Z', step: stepId },
    ];

    eLearningStepProgressStub.returns(0.5);

    const result = await StepHelper.onSiteStepProgress(step, slots);
    expect(result).toBe(0.95);
    sinon.assert.calledOnceWithExactly(eLearningStepProgressStub, step);
  });

  it('should return 0 if no slots', async () => {
    const stepId = new ObjectID();
    const step = {
      _id: stepId,
      activities: [{ _id: new ObjectID() }],
    };

    const slots = [];
    eLearningStepProgressStub.returns(0.5);

    const result = await StepHelper.onSiteStepProgress(step, slots);

    expect(result).toBe(0.05);
    sinon.assert.calledOnceWithExactly(eLearningStepProgressStub, step);
  });
});

describe('getProgress', () => {
  let elearningStepProgress;
  let onSiteStepProgress;
  beforeEach(() => {
    elearningStepProgress = sinon.stub(StepHelper, 'elearningStepProgress');
    onSiteStepProgress = sinon.stub(StepHelper, 'onSiteStepProgress');
  });
  afterEach(() => {
    elearningStepProgress.restore();
    onSiteStepProgress.restore();
  });
  it('should get progress for elearning step', async () => {
    const step = {
      _id: new ObjectID(),
      activities: [{ activityHistories: [{}, {}] }],
      name: 'Développement personnel full stack',
      type: E_LEARNING,
      areActivitiesValid: false,
    };
    const slots = [];
    elearningStepProgress.returns(1);

    const result = await StepHelper.getProgress(step, slots);
    expect(result).toBe(1);
    sinon.assert.calledOnceWithExactly(elearningStepProgress, step);
  });

  it('should get progress for on site step', async () => {
    const stepId = new ObjectID();
    const step = {
      _id: stepId,
      activities: [],
      name: 'Développer des équipes agiles et autonomes',
      type: 'on_site',
      areActivitiesValid: true,
    };
    const slots = [
      { endDate: '2020-11-03T09:00:00.000Z', step: stepId },
      { endDate: '2020-11-04T16:01:00.000Z', step: stepId },
    ];
    onSiteStepProgress.returns(1);

    const result = await StepHelper.getProgress(step, slots);
    expect(result).toBe(1);
    sinon.assert.calledOnceWithExactly(onSiteStepProgress, step, slots);
  });
});
