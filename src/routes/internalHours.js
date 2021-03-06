'use strict';

const Joi = require('joi');
Joi.objectId = require('joi-objectid')(Joi);
const {
  authorizeInternalHourDeletion,
  getInternalHour,
  authorizeInternalHourCreation,
} = require('./preHandlers/internalHours');
const {
  create,
  list,
  remove,
} = require('../controllers/internalHourController');

exports.plugin = {
  name: 'routes-internal-hours',
  register: async (server) => {
    server.route({
      method: 'POST',
      path: '/',
      options: {
        auth: { scope: ['config:edit'] },
        validate: {
          payload: Joi.object().keys({ name: Joi.string().required() }),
        },
        pre: [{ method: authorizeInternalHourCreation }],
      },
      handler: create,
    });

    server.route({
      method: 'GET',
      path: '/',
      options: {
        auth: { scope: ['config:read'] },
      },
      handler: list,
    });

    server.route({
      method: 'DELETE',
      path: '/{_id}',
      options: {
        auth: { scope: ['config:edit'] },
        validate: {
          params: Joi.object({ _id: Joi.objectId().required() }),
        },
        pre: [
          { method: getInternalHour, assign: 'internalHour' },
          { method: authorizeInternalHourDeletion },
        ],
      },
      handler: remove,
    });
  },
};
