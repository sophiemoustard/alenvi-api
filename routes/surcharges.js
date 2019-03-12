'use strict';

const Joi = require('joi');
Joi.objectId = require('joi-objectid')(Joi);

const {
  create,
  list,
  update,
  remove
} = require('../controllers/surchargeController');

exports.plugin = {
  name: 'routes-surcharges',
  register: async (server) => {
    server.route({
      method: 'POST',
      path: '/',
      handler: create,
      options: {
        auth: { strategy: 'jwt' },
        validate: {
          payload: Joi.object().keys({
            name: Joi.string().required(),
            saturday: Joi.number().allow('', null),
            sunday: Joi.number().allow('', null),
            publicHoliday: Joi.number().allow('', null),
            twentyFifthOfDecember: Joi.number().allow('', null),
            firstOfMay: Joi.number().allow('', null),
            evening: Joi.number().allow('', null),
            eveningStartTime: Joi.string().allow('', null).when('evenings', { is: Joi.number().allow('', null), then: Joi.required() }),
            eveningEndTime: Joi.string().allow('', null).when('evenings', { is: Joi.number().allow('', null), then: Joi.required() }),
            custom: Joi.number().allow('', null),
            customStartTime: Joi.string().allow('', null).when('customs', { is: Joi.number().allow('', null), then: Joi.required() }),
            customEndTime: Joi.string().allow('', null).when('customs', { is: Joi.number().allow('', null), then: Joi.required() }),
            company: Joi.required()
          })
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/',
      handler: list,
      options: {
        auth: { strategy: 'jwt' },
        validate: {
          query: {
            company: Joi.objectId(),
          }
        }
      },
    });

    server.route({
      method: 'DELETE',
      path: '/{_id}',
      handler: remove,
      options: {
        auth: { strategy: 'jwt' },
        validate: {
          params: {
            _id: Joi.objectId().required(),
          }
        },
      },
    });

    server.route({
      method: 'PUT',
      path: '/{_id}',
      handler: update,
      options: {
        auth: { strategy: 'jwt' },
        validate: {
          params: {
            _id: Joi.objectId().required(),
          },
          payload: Joi.object().keys({
            name: Joi.string(),
            saturday: Joi.number().allow('', null),
            sunday: Joi.number().allow('', null),
            publicHoliday: Joi.number().allow('', null),
            twentyFifthOfDecember: Joi.number().allow('', null),
            firstOfMay: Joi.number().allow('', null),
            evening: Joi.number().allow('', null),
            eveningStartTime: Joi.string().allow('', null).when('evening', { is: Joi.exist(), then: Joi.required() }),
            eveningEndTime: Joi.string().allow('', null).when('evening', { is: Joi.exist(), then: Joi.required() }),
            custom: Joi.number().allow('', null),
            customStartTime: Joi.string().allow('', null).when('custom', { is: Joi.exist(), then: Joi.required() }),
            customEndTime: Joi.string().allow('', null).when('custom', { is: Joi.exist(), then: Joi.required() }),
          })
        },
      },
    });
  }
};
