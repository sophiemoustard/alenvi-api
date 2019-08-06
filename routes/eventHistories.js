'use strict';

const Joi = require('joi');
Joi.objectId = require('joi-objectid')(Joi);
const { list } = require('../controllers/eventHistoryController');

exports.plugin = {
  name: 'routes-event-history',
  register: async (server) => {
    server.route({
      method: 'GET',
      path: '/',
      options: {
        validate: {
          query: {
            auxiliaries: [Joi.array().items(Joi.string()), Joi.string()],
            sectors: [Joi.array().items(Joi.string()), Joi.string()],
          },
        },
      },
      handler: list,
    });
  },
};
