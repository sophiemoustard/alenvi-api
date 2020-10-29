const Program = require('../models/Program');
const SubProgram = require('../models/SubProgram');
const Step = require('../models/Step');
const Activity = require('../models/Activity');
const Course = require('../models/Course');
const { INTER_B2C, STRICTLY_E_LEARNING, E_LEARNING, DRAFT } = require('./constants');

exports.addSubProgram = async (programId, payload) => {
  const subProgram = await SubProgram.create(payload);
  await Program.updateOne({ _id: programId }, { $push: { subPrograms: subProgram._id } });
};

exports.updateSubProgram = async (subProgramId, payload) => {
  if (!payload.status) return SubProgram.updateOne({ _id: subProgramId }, { $set: payload });

  const subProgram = await SubProgram
    .findOneAndUpdate({ _id: subProgramId }, { $set: payload })
    .populate({ path: 'steps', select: 'activities type' })
    .lean();

  const isStrictlyElearning = subProgram.steps.every(step => step.type === E_LEARNING);
  if (isStrictlyElearning) {
    await Course.create({ subProgram: subProgramId, type: INTER_B2C, format: STRICTLY_E_LEARNING });
  }

  await Step.updateMany({ _id: { $in: subProgram.steps.map(step => step._id) } }, { status: payload.status });
  const activities = subProgram.steps.map(step => step.activities).flat();
  return Activity.updateMany({ _id: { $in: activities } }, { status: payload.status });
};

exports.listELearningDraft = async () => {
  const subPrograms = await SubProgram.find({ status: DRAFT })
    .populate({ path: 'program', select: '_id name' })
    .populate({ path: 'steps', select: 'type' })
    .lean({ virtuals: true });
  return subPrograms
    .filter(subProgram => subProgram.steps.length && subProgram.steps
      .every(step => step.type === E_LEARNING));
};

exports.getSubProgram = async subProgramId => SubProgram
  .findOne({ _id: subProgramId })
  .populate({ path: 'program', select: 'name image' })
  .populate({ path: 'steps', populate: { path: 'activities' } })
  .lean({ virtuals: true });
