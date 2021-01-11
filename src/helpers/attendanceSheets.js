const omit = require('lodash/omit');
const get = require('lodash/get');
const AttendanceSheet = require('../models/AttendanceSheet');
const Course = require('../models/Course');
const GCloudStorageHelper = require('./gCloudStorage');

exports.create = async (payload) => {
  const fileUploaded = await GCloudStorageHelper.uploadCourseFile({
    fileName: get(payload, 'file.hapi.filename') || '',
    file: payload.file,
  });
  const newAttendanceSheet = await AttendanceSheet.create({ ...omit(payload, 'file'), file: fileUploaded });
  await Course.updateOne({ _id: payload.course }, { $push: { attendanceSheets: newAttendanceSheet._id } });
};

exports.list = async (query) => {
  const course = await Course.findOne({ _id: query.course }).populate({ path: 'attendanceSheets' }).lean();
  return get(course, 'attendanceSheets', []);
};
