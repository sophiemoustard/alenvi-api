const path = require('path');
const get = require('lodash/get');
const pick = require('lodash/pick');
const omit = require('lodash/omit');
const groupBy = require('lodash/groupBy');
const fs = require('fs');
const os = require('os');
const moment = require('moment');
const flat = require('flat');
const Course = require('../models/Course');
const Questionnaire = require('../models/Questionnaire');
const CourseSmsHistory = require('../models/CourseSmsHistory');
const CourseRepository = require('../repositories/CourseRepository');
const UsersHelper = require('./users');
const PdfHelper = require('./pdf');
const UtilsHelper = require('./utils');
const ZipHelper = require('./zip');
const SmsHelper = require('./sms');
const DocxHelper = require('./docx');
const StepsHelper = require('./steps');
const EmailHelper = require('./email');
const drive = require('../models/Google/Drive');
const { INTRA, INTER_B2B, COURSE_SMS, WEBAPP, STRICTLY_E_LEARNING, DRAFT, TRAINEE } = require('./constants');
const CourseHistoriesHelper = require('./courseHistories');
const NotificationHelper = require('./notifications');
const InterAttendanceSheet = require('../data/pdf/attendanceSheet/interAttendanceSheet');
const IntraAttendanceSheet = require('../data/pdf/attendanceSheet/intraAttendanceSheet');
const CourseConvocation = require('../data/pdf/courseConvocation');

exports.createCourse = payload => (new Course(payload)).save();

exports.list = async (query) => {
  if (query.company) {
    if (query.format === STRICTLY_E_LEARNING) {
      const courses = await CourseRepository.findCourseAndPopulate({
        format: query.format,
        accessRules: { $in: [query.company, []] },
      });

      return courses.map(course => ({ ...course,
        trainees: course.trainees.filter(t =>
          (t.company ? UtilsHelper.areObjectIdsEquals(t.company._id, query.company) : false)) }));
    }
    const intraCourse = await CourseRepository.findCourseAndPopulate({ ...query, type: INTRA });
    const interCourse = await CourseRepository.findCourseAndPopulate(
      { ...omit(query, ['company']), type: INTER_B2B },
      true
    );

    return [
      ...intraCourse,
      ...interCourse.filter(course => course.companies && course.companies.includes(query.company))
        .map(course => ({
          ...omit(course, ['companies']),
          trainees: course.trainees.filter(t =>
            (t.company ? UtilsHelper.areObjectIdsEquals(t.company._id, query.company) : false)),
        })),
    ];
  }

  return CourseRepository.findCourseAndPopulate(query);
};

exports.getCourseProgress = (steps) => {
  if (!steps || !steps.length) return 0;

  return steps.map(step => step.progress).reduce((acc, value) => acc + value, 0) / steps.length;
};

exports.formatCourseWithProgress = (course) => {
  const steps = course.subProgram.steps
    .map(step => ({ ...step, progress: StepsHelper.getProgress(step, course.slots) }));

  return {
    ...course,
    subProgram: { ...course.subProgram, steps },
    progress: exports.getCourseProgress(steps),
  };
};

exports.listUserCourses = async (trainee) => {
  const courses = await Course.find(
    { trainees: trainee._id, $or: [{ accessRules: [] }, { accessRules: trainee.company }] },
    { format: 1 }
  )
    .populate({
      path: 'subProgram',
      select: 'program steps',
      populate: [
        { path: 'program', select: 'name image description' },
        {
          path: 'steps',
          select: 'name type activities',
          populate: {
            path: 'activities',
            select: 'name type cards activityHistories',
            populate: [
              { path: 'activityHistories', match: { user: trainee._id } },
              { path: 'cards', select: 'template' },
            ],
          },
        },
      ],
    })
    .populate({ path: 'slots', select: 'startDate endDate step', populate: { path: 'step', select: 'type' } })
    .select('_id misc')
    .lean({ autopopulate: true, virtuals: true });

  return courses.map(course => exports.formatCourseWithProgress(course));
};

exports.getCourse = async (course, loggedUser) => {
  const userHasVendorRole = !!get(loggedUser, 'role.vendor');
  const userCompanyId = get(loggedUser, 'company._id') || null;
  // A coach/client_admin is not supposed to read infos on trainees from other companies
  // espacially for INTER_B2B courses.
  const traineesCompanyMatch = userHasVendorRole ? {} : { company: userCompanyId };

  return Course.findOne({ _id: course._id })
    .populate({ path: 'company', select: 'name' })
    .populate({
      path: 'subProgram',
      select: 'program steps',
      populate: [
        { path: 'program', select: 'name learningGoals' },
        {
          path: 'steps',
          select: 'name type',
          populate: {
            path: 'activities',
            select: 'name type',
            populate: { path: 'activityHistories', select: 'user' },
          },
        },
      ],
    })
    .populate({ path: 'slots', populate: { path: 'step', select: 'name' } })
    .populate({ path: 'slotsToPlan', select: '_id' })
    .populate({
      path: 'trainees',
      match: traineesCompanyMatch,
      select: 'identity.firstname identity.lastname local.email company contact picture.link',
      populate: { path: 'company', select: 'name' },
    })
    .populate({ path: 'trainer', select: 'identity.firstname identity.lastname' })
    .populate({ path: 'accessRules', select: 'name' })
    .populate({ path: 'salesRepresentative', select: 'identity.firstname identity.lastname' })
    .lean();
};

exports.selectUserHistory = (histories) => {
  const groupedHistories = Object.values(groupBy(histories, 'user'));

  return groupedHistories.map(userHistories => UtilsHelper.getLastVersion(userHistories, 'createdAt'));
};

exports.formatActivity = (activity) => {
  const followUp = {};
  const filteredHistories = exports.selectUserHistory(activity.activityHistories);
  for (const history of filteredHistories) {
    for (const answer of history.questionnaireAnswersList) {
      const { answerList } = answer;
      if (answerList.length === 1 && !answerList[0].trim()) continue;

      if (!followUp[answer.card._id]) followUp[answer.card._id] = { ...answer.card, answers: [] };
      followUp[answer.card._id].answers.push(...answerList);
    }
  }

  return {
    ...activity,
    followUp: Object.values(followUp),
    activityHistories: activity.activityHistories.map(a => a._id),
  };
};

exports.formatStep = step => ({ ...step, activities: step.activities.map(a => exports.formatActivity(a)) });

exports.getCourseFollowUp = async (course, company) => {
  const courseWithTrainees = await Course.findOne({ _id: course._id }).select('trainees').lean();
  const traineeCompanyMatch = company ? { company } : {};

  const courseFollowUp = await Course.findOne({ _id: course._id })
    .select('subProgram')
    .populate({
      path: 'subProgram',
      select: 'name steps program',
      populate: [
        { path: 'program', select: 'name' },
        {
          path: 'steps',
          select: 'name activities type',
          populate: {
            path: 'activities',
            select: 'name type',
            populate: {
              path: 'activityHistories',
              match: { user: { $in: courseWithTrainees.trainees } },
              populate: { path: 'questionnaireAnswersList.card', select: '-createdAt -updatedAt' },
            },
          },
        },
      ],
    })
    .populate({
      path: 'trainees',
      select: 'identity.firstname identity.lastname firstMobileConnection',
      match: traineeCompanyMatch,
    })
    .populate({ path: 'slots', populate: { path: 'step', select: '_id' } })
    .lean();

  return {
    ...courseFollowUp,
    subProgram: {
      ...courseFollowUp.subProgram,
      steps: courseFollowUp.subProgram.steps.map(s => exports.formatStep(s)),
    },
    trainees: courseFollowUp.trainees.map(t => ({
      ...t,
      ...exports.getTraineeProgress(t._id, courseFollowUp.subProgram.steps, courseFollowUp.slots),
    })),
  };
};

exports.getQuestionnaireAnswers = async (courseId) => {
  const course = await Course.findOne({ _id: courseId })
    .populate({
      path: 'subProgram',
      select: 'steps',
      populate: [
        {
          path: 'steps',
          select: 'activities',
          populate: {
            path: 'activities',
            populate: {
              path: 'activityHistories',
              populate: { path: 'questionnaireAnswersList.card', select: '-createdAt -updatedAt' },
            },
          },
        },
      ],
    })
    .lean();

  const courseActivities = get(course, 'subProgram.steps', []).map(step => step.activities).flat();
  const activitiesWithFollowUp = courseActivities.map(activity => exports.formatActivity(activity));

  return activitiesWithFollowUp.filter(act => act.followUp.length).map(act => act.followUp).flat();
};

exports.getTraineeProgress = (traineeId, steps, slots) => {
  const formattedSteps = steps.map((s) => {
    const traineeStep = {
      ...s,
      activities: s.activities.map(a => ({
        ...a,
        activityHistories: a.activityHistories.filter(ah => UtilsHelper.areObjectIdsEquals(ah.user, traineeId)),
      })),
    };

    return { ...traineeStep, progress: StepsHelper.getProgress(traineeStep, slots) };
  });

  return { steps: formattedSteps, progress: exports.getCourseProgress(formattedSteps) };
};

exports.getTraineeCourse = async (courseId, credentials) => {
  const course = await Course.findOne({ _id: courseId })
    .populate({
      path: 'subProgram',
      select: 'program steps',
      populate: [
        { path: 'program', select: 'name image description learningGoals' },
        {
          path: 'steps',
          select: 'name type activities',
          populate: {
            path: 'activities',
            select: 'name type cards activityHistories',
            populate: [
              { path: 'activityHistories', match: { user: credentials._id } },
              { path: 'cards', select: 'template' },
            ],
          },
        },
      ],
    })
    .populate({ path: 'slots', select: 'startDate endDate step address' })
    .populate({ path: 'trainer', select: 'identity.firstname identity.lastname biography picture' })
    .select('_id misc contact')
    .lean({ autopopulate: true, virtuals: true });

  return exports.formatCourseWithProgress(course);
};

exports.updateCourse = async (courseId, payload) =>
  Course.findOneAndUpdate({ _id: courseId }, { $set: flat(payload) }).lean();

exports.deleteCourse = async courseId => Promise.all([
  Course.deleteOne({ _id: courseId }),
  CourseSmsHistory.deleteMany({ course: courseId }),
]);

exports.sendSMS = async (courseId, payload, credentials) => {
  const course = await Course.findById(courseId)
    .populate({ path: 'trainees', select: '_id contact' })
    .lean();

  const promises = [];
  const missingPhones = [];
  for (const trainee of course.trainees) {
    if (!get(trainee, 'contact.phone')) missingPhones.push(trainee._id);
    else {
      promises.push(SmsHelper.send({
        recipient: `+33${trainee.contact.phone.substring(1)}`,
        sender: 'Compani',
        content: payload.content,
        tag: COURSE_SMS,
      }));
    }
  }

  promises.push(CourseSmsHistory.create({
    type: payload.type,
    course: courseId,
    message: payload.content,
    sender: credentials._id,
    missingPhones,
  }));

  await Promise.all(promises);
};

exports.getSMSHistory = async courseId => CourseSmsHistory.find({ course: courseId })
  .populate({ path: 'sender', select: 'identity.firstname identity.lastname' })
  .populate({ path: 'missingPhones', select: 'identity.firstname identity.lastname' })
  .lean();

exports.addCourseTrainee = async (courseId, payload, trainee, credentials) => {
  const addedTrainee = trainee || await UsersHelper.createUser({ ...payload, origin: WEBAPP }, credentials);

  if (trainee && !trainee.company) await UsersHelper.updateUser(trainee._id, pick(payload, 'company'), null);

  await Course.updateOne({ _id: courseId }, { $addToSet: { trainees: addedTrainee._id } });

  const promises = [
    CourseHistoriesHelper.createHistoryOnTraineeAddition(
      { course: courseId, traineeId: addedTrainee._id },
      credentials._id
    ),
    NotificationHelper.sendBlendedCourseRegistrationNotification(trainee, courseId),
  ];

  if (!trainee) promises.push(EmailHelper.sendWelcome(TRAINEE, payload.local.email));

  await Promise.all(promises);
};

exports.registerToELearningCourse = async (courseId, credentials) =>
  Course.updateOne({ _id: courseId }, { $addToSet: { trainees: credentials._id } });

exports.removeCourseTrainee = async (courseId, traineeId, user) => Promise.all([
  CourseHistoriesHelper.createHistoryOnTraineeDeletion({ course: courseId, traineeId }, user._id),
  Course.updateOne({ _id: courseId }, { $pull: { trainees: traineeId } }),
]);

exports.formatIntraCourseSlotsForPdf = slot => ({
  startHour: UtilsHelper.formatHourWithMinutes(slot.startDate),
  endHour: UtilsHelper.formatHourWithMinutes(slot.endDate),
});

exports.formatInterCourseSlotsForPdf = (slot) => {
  const duration = moment.duration(moment(slot.endDate).diff(slot.startDate));

  return {
    address: get(slot, 'address.fullAddress') || null,
    date: moment(slot.startDate).format('DD/MM/YYYY'),
    startHour: moment(slot.startDate).format('HH:mm'),
    endHour: moment(slot.endDate).format('HH:mm'),
    duration: UtilsHelper.formatDuration(duration),
  };
};

exports.getCourseDuration = (slots) => {
  const duration = slots.reduce(
    (acc, slot) => acc.add(moment.duration(moment(slot.endDate).diff(slot.startDate))),
    moment.duration()
  );

  return UtilsHelper.formatDuration(duration);
};

exports.groupSlotsByDate = (slots) => {
  const group = groupBy(slots, slot => moment(slot.startDate).format('DD/MM/YYYY'));

  return Object.values(group).sort((a, b) => new Date(a[0].startDate) - new Date(b[0].startDate));
};

exports.formatIntraCourseForPdf = (course) => {
  const possibleMisc = course.misc ? ` - ${course.misc}` : '';
  const name = course.subProgram.program.name + possibleMisc;
  const courseData = {
    name,
    duration: exports.getCourseDuration(course.slots),
    company: course.company.name,
    trainer: course.trainer ? UtilsHelper.formatIdentity(course.trainer.identity, 'FL') : '',
  };

  const slotsGroupedByDate = exports.groupSlotsByDate(course.slots);

  return {
    dates: slotsGroupedByDate.map(groupedSlots => ({
      course: { ...courseData },
      address: get(groupedSlots[0], 'address.fullAddress') || '',
      slots: groupedSlots.map(slot => exports.formatIntraCourseSlotsForPdf(slot)),
      date: moment(groupedSlots[0].startDate).format('DD/MM/YYYY'),
    })),
  };
};

exports.formatInterCourseForPdf = (course) => {
  const possibleMisc = course.misc ? ` - ${course.misc}` : '';
  const name = course.subProgram.program.name + possibleMisc;
  const slots = course.slots ? course.slots.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)) : [];

  const courseData = {
    name,
    slots: slots.map(exports.formatInterCourseSlotsForPdf),
    trainer: course.trainer ? UtilsHelper.formatIdentity(course.trainer.identity, 'FL') : '',
    firstDate: slots.length ? moment(slots[0].startDate).format('DD/MM/YYYY') : '',
    lastDate: slots.length ? moment(slots[slots.length - 1].startDate).format('DD/MM/YYYY') : '',
    duration: exports.getCourseDuration(slots),
  };

  return {
    trainees: course.trainees.map(trainee => ({
      traineeName: UtilsHelper.formatIdentity(trainee.identity, 'FL'),
      company: get(trainee, 'company.name') || '',
      course: { ...courseData },
    })),
  };
};

exports.generateAttendanceSheets = async (courseId) => {
  const course = await Course.findOne({ _id: courseId })
    .populate('company')
    .populate('slots')
    .populate({ path: 'trainees', populate: { path: 'company', select: 'name' } })
    .populate('trainer')
    .populate({ path: 'subProgram', select: 'program', populate: { path: 'program', select: 'name' } })
    .lean();

  const template = course.type === INTRA
    ? await IntraAttendanceSheet.getPdfContent(exports.formatIntraCourseForPdf(course))
    : await InterAttendanceSheet.getPdfContent(exports.formatInterCourseForPdf(course));
  const pdf = await PdfHelper.generatePdf(template);

  return { fileName: 'emargement.pdf', pdf };
};

exports.formatCourseForDocx = course => ({
  duration: exports.getCourseDuration(course.slots),
  learningGoals: get(course, 'subProgram.program.learningGoals') || '',
  programName: get(course, 'subProgram.program.name').toUpperCase() || '',
  startDate: moment(course.slots[0].startDate).format('DD/MM/YYYY'),
  endDate: moment(course.slots[course.slots.length - 1].endDate).format('DD/MM/YYYY'),
});

exports.generateCompletionCertificates = async (courseId) => {
  const course = await Course.findOne({ _id: courseId })
    .populate('slots')
    .populate('trainees')
    .populate({ path: 'subProgram', select: 'program', populate: { path: 'program', select: 'name learningGoals' } })
    .lean();

  const courseData = exports.formatCourseForDocx(course);
  const certificateTemplatePath = path.join(os.tmpdir(), 'certificate_template.docx');
  await drive.downloadFileById({
    fileId: process.env.GOOGLE_DRIVE_TRAINING_CERTIFICATE_TEMPLATE_ID,
    tmpFilePath: certificateTemplatePath,
  });

  const fileListPromises = course.trainees.map(async (trainee) => {
    const traineeIdentity = UtilsHelper.formatIdentity(trainee.identity, 'FL');
    const filePath = await DocxHelper.createDocx(
      certificateTemplatePath,
      { ...courseData, traineeIdentity, date: moment().format('DD/MM/YYYY') }
    );

    return { name: `Attestation - ${traineeIdentity}.docx`, file: fs.createReadStream(filePath) };
  });

  return ZipHelper.generateZip('attestations.zip', await Promise.all(fileListPromises));
};

exports.addAccessRule = async (courseId, payload) => Course.updateOne(
  { _id: courseId },
  { $push: { accessRules: payload.company } }
);

exports.deleteAccessRule = async (courseId, accessRuleId) => Course.updateOne(
  { _id: courseId },
  { $pull: { accessRules: accessRuleId } }
);

exports.formatHoursForConvocation = slots => slots.reduce((acc, slot) => {
  const slotHours =
    `${UtilsHelper.formatHourWithMinutes(slot.startDate)} - ${UtilsHelper.formatHourWithMinutes(slot.endDate)}`;

  return acc === '' ? slotHours : `${acc} / ${slotHours}`;
}, '');

exports.formatCourseForConvocationPdf = (course) => {
  const trainerIdentity = UtilsHelper.formatIdentity(get(course, 'trainer.identity'), 'FL');
  const contactPhoneNumber = UtilsHelper.formatPhoneNumber(get(course, 'contact.phone'));
  const slotsGroupedByDate = exports.groupSlotsByDate(course.slots);

  const slots = slotsGroupedByDate.map(groupedSlots => ({
    address: get(groupedSlots[0], 'address.fullAddress') || '',
    hours: exports.formatHoursForConvocation(groupedSlots),
    date: moment(groupedSlots[0].startDate).format('DD/MM/YYYY'),
  }));

  return {
    ...course,
    trainer: { ...course.trainer, formattedIdentity: trainerIdentity },
    contact: { ...course.contact, formattedPhone: contactPhoneNumber },
    slots,
  };
};

exports.generateConvocationPdf = async (courseId) => {
  const course = await Course.findOne({ _id: courseId })
    .populate({
      path: 'subProgram',
      select: 'program',
      populate: { path: 'program', select: 'name description' },
    })
    .populate('slots')
    .populate({ path: 'slotsToPlan', select: '_id' })
    .populate({ path: 'trainer', select: 'identity.firstname identity.lastname biography' })
    .lean();

  const courseName = get(course, 'subProgram.program.name', '').split(' ').join('-') || 'Formation';

  const template = await CourseConvocation.getPdfContent(exports.formatCourseForConvocationPdf(course));

  return {
    pdf: await PdfHelper.generatePdf(template),
    courseName,
  };
};

exports.getQuestionnaires = async (courseId) => {
  const questionnaires = await Questionnaire.find({ status: { $ne: DRAFT } })
    .select('type name')
    .populate({ path: 'historiesCount', match: { course: courseId, questionnaireAnswersList: { $ne: [] } } })
    .lean();

  return questionnaires.filter(questionnaire => questionnaire.historiesCount);
};
