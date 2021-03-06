const has = require('lodash/has');
const ActivityHistory = require('../models/ActivityHistory');
const UserCompany = require('../models/UserCompany');
const { STRICTLY_E_LEARNING } = require('./constants');

exports.addActivityHistory = async payload => ActivityHistory.create(payload);

const filterCourses = activityHistory => ({
  ...activityHistory,
  activity: {
    ...activityHistory.activity,
    steps: activityHistory.activity.steps.map(step => ({
      ...step,
      subProgram: has(step, 'subProgram.courses')
        ? {
          ...step.subProgram,
          courses: step.subProgram.courses.filter(course => course.trainees.map(trainee => trainee.toHexString())
            .includes(activityHistory.user._id.toHexString())),
        }
        : { ...step.subProgram },
    })),
  },
});

const filterSteps = activityHistory => ({
  ...activityHistory,
  activity: {
    ...activityHistory.activity,
    steps: activityHistory.activity.steps.filter(step =>
      (has(step, 'subProgram.courses') ? step.subProgram.courses.length : 0)),
  },
});

exports.list = async (query, credentials) => {
  const userCompanies = await UserCompany.find({ company: credentials.company._id }, { user: 1 }).lean();

  const activityHistories = await ActivityHistory
    .find({
      date: { $lte: new Date(query.endDate), $gte: new Date(query.startDate) },
      user: { $in: userCompanies.map(uc => uc.user) },
    })
    .populate({
      path: 'activity',
      select: '_id',
      populate: {
        path: 'steps',
        select: '_id',
        populate: {
          path: 'subProgram',
          select: '_id',
          populate: [
            { path: 'courses', select: 'misc format trainees', match: { format: STRICTLY_E_LEARNING } },
            { path: 'program', select: 'name' }],
        },
      },
    })
    .populate({ path: 'user', select: '_id identity picture' })
    .lean();

  return activityHistories.map(h => filterSteps(filterCourses(h)))
    .filter(h => (has(h, 'activity.steps') ? h.activity.steps.length : 0));
};
