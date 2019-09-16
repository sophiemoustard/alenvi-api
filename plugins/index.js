const good = require('./good');
const hapiSentry = require('./hapiSentry');
const hapiAuthJwt2 = require('./hapiAuthJwt2');
const cron = require('./cron');
const { invoiceDispatch } = require('../jobs/invoiceDispatch');

const plugins = [
  {
    plugin: require('good'),
    options: { reporters: good.reporters },
  },
  { plugin: hapiAuthJwt2 },
  { plugin: require('inert') },
  {
    plugin: cron,
    options: {
      jobs: [
        {
          name: 'test',
          time: '*/10 * * * * *',
          method: invoiceDispatch.method,
          onComplete: invoiceDispatch.onComplete,
        },
      ],
    },
  },
];

if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  plugins.push({
    plugin: require('hapi-sentry'),
    options: hapiSentry.options,
  });
}

exports.plugins = plugins;
