const Boom = require('@hapi/boom');
const translate = require('../helpers/translate');
const CourseHistoriesHelper = require('../helpers/courseHistories');

const { language } = translate;

const list = async (req) => {
  try {
    const courseHistories = await CourseHistoriesHelper.list(req.query);

    return {
      data: { courseHistories },
      message: translate[language].courseHistoriesFound,
    };
  } catch (e) {
    req.log('error', e);
    return Boom.isBoom(e) ? e : Boom.badImplementation(e);
  }
};

module.exports = {
  list,
};
