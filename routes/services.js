'use strict';

const Joi = require('joi');
Joi.objectId = require('joi-objectid')(Joi);

const { SERVICE_NATURES } = require('../models/Service');
const { CONTRACT_STATUS } = require('../models/Contract');

const {
  list,
  create,
  update,
  remove,
} = require('../controllers/serviceController');

exports.plugin = {
  name: 'routes-services',
  register: async (server) => {
    server.route({
      method: 'POST',
      path: '/',
      handler: create,
      options: {
        auth: { scope: ['config:read'] },
        validate: {
          payload: Joi.object().keys({
            type: Joi.string().required().valid(CONTRACT_STATUS),
            company: Joi.objectId().required(),
            versions: Joi.array().items({
              defaultUnitAmount: Joi.number().required(),
              name: Joi.string().required(),
              vat: Joi.number(),
              surcharge: Joi.objectId(),
              exemptFromCharges: Joi.boolean(),
            }),
            nature: Joi.string().required().valid(SERVICE_NATURES),
          }),
        },
      },
    });

    server.route({
      method: 'GET',
      path: '/',
      handler: list,
      options: {
        auth: { scope: ['config:edit'] },
        validate: {
          query: { company: Joi.objectId() },
        },
      },
    });

    server.route({
      method: 'DELETE',
      path: '/{_id}',
      handler: remove,
      options: {
        auth: { scope: ['config:edit'] },
        validate: {
          params: {
            _id: Joi.objectId().required(),
          },
        },
      },
    });

    server.route({
      method: 'PUT',
      path: '/{_id}',
      handler: update,
      options: {
        auth: { scope: ['config:edit'] },
        validate: {
          params: {
            _id: Joi.objectId().required(),
          },
          payload: Joi.object().keys({
            startDate: Joi.date().required(),
            defaultUnitAmount: Joi.number(),
            name: Joi.string(),
            vat: Joi.number(),
            surcharge: Joi.objectId(),
            exemptFromCharges: Joi.boolean(),
          }),
        },
      },
    });
  },
};
