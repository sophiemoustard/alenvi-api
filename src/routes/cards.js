'use-strict';

const Joi = require('joi');
Joi.objectId = require('joi-objectid')(Joi);
const { update, remove, uploadMedia } = require('../controllers/cardController');
const { formDataPayload } = require('./validations/utils');
const { authorizeCardUpdate, authorizeCardDeletion } = require('./preHandlers/cards');
const {
  SINGLE_CHOICE_QUESTION_MAX_FALSY_ANSWERS_COUNT,
  FILL_THE_GAPS_MAX_ANSWERS_COUNT,
  MULTIPLE_CHOICE_QUESTION_MAX_ANSWERS_COUNT,
  ORDER_THE_SEQUENCE_MAX_ANSWERS_COUNT,
  SURVEY_LABEL_MAX_LENGTH,
  QC_ANSWER_MAX_LENGTH,
  QUESTION_MAX_LENGTH,
} = require('../helpers/constants');

exports.plugin = {
  name: 'routes-cards',
  register: async (server) => {
    server.route({
      method: 'PUT',
      path: '/{_id}',
      options: {
        validate: {
          params: Joi.object({ _id: Joi.objectId().required() }),
          payload: Joi.object({
            title: Joi.string(),
            text: Joi.string(),
            backText: Joi.string(),
            media: Joi.object().keys({
              link: Joi.string().allow(null),
              publicId: Joi.string().allow(null),
            }),
            gappedText: Joi.string(),
            question: Joi.string().max(QUESTION_MAX_LENGTH),
            qcuGoodAnswer: Joi.string().max(QC_ANSWER_MAX_LENGTH),
            qcmAnswers: Joi.array().items(Joi.object({
              label: Joi.string().max(QC_ANSWER_MAX_LENGTH).required(),
              correct: Joi.boolean().required(),
            })).min(1).max(MULTIPLE_CHOICE_QUESTION_MAX_ANSWERS_COUNT),
            orderedAnswers: Joi.array().items(Joi.string()).min(1).max(ORDER_THE_SEQUENCE_MAX_ANSWERS_COUNT),
            qcuFalsyAnswers: Joi.array().items(
              Joi.string().max(QC_ANSWER_MAX_LENGTH)
            ).min(1).max(SINGLE_CHOICE_QUESTION_MAX_FALSY_ANSWERS_COUNT),
            falsyGapAnswers: Joi.array().items(
              Joi.string().max(QC_ANSWER_MAX_LENGTH)
            ).min(1).max(FILL_THE_GAPS_MAX_ANSWERS_COUNT),
            explanation: Joi.string(),
            label: Joi.object().keys({
              right: Joi.string().allow('', null).max(SURVEY_LABEL_MAX_LENGTH),
              left: Joi.string().allow('', null).max(SURVEY_LABEL_MAX_LENGTH),
            }),
          }),
        },
        auth: { scope: ['programs:edit'] },
        pre: [{ method: authorizeCardUpdate }],
      },
      handler: update,
    });
    server.route({
      method: 'DELETE',
      path: '/{_id}',
      options: {
        validate: {
          params: Joi.object({ _id: Joi.objectId().required() }),
        },
        auth: { scope: ['programs:edit'] },
        pre: [{ method: authorizeCardDeletion }],
      },
      handler: remove,
    });

    server.route({
      method: 'POST',
      path: '/{_id}/cloudinary/upload',
      handler: uploadMedia,
      options: {
        payload: formDataPayload,
        validate: {
          payload: Joi.object({
            fileName: Joi.string().required(),
            file: Joi.any().required(),
            media: Joi.object().keys({
              link: Joi.string().allow(null),
              publicId: Joi.string().allow(null),
            }),
          }),
          params: Joi.object({
            _id: Joi.objectId().required(),
          }),
        },
        auth: { scope: ['programs:edit'] },
      },
    });
  },
};
