const bcrypt = require('bcrypt');
const translate = require('../helpers/translate');
const _ = require('lodash');
const tokenProcess = require('../helpers/tokenProcess');

const User = require('../models/User');
const { redirectToBot } = require('../models/Bot/bot');

const language = translate.language;

module.exports = {
  authorize: async (req, res) => {
    if (!req.query.email || !req.query.password) {
      return res.status(400).send({ success: false, message: `Erreur: ${translate[language].missingParameters}` });
      // return response.error(res, 400, translate[language].missingParameters);
    }
    if (!req.query && !req.query.redirect_uri) {
      return res.status(400).send({ success: false, message: `Erreur: ${translate[language].missingParameters}` });
      // return response.error(res, 400, translate[language].missingParameters);
    }
    // Get by local email
    let user = {};
    try {
      user = await User.findOne({ 'local.email': req.query.email });
      if (!user) {
        return res.status(404).send({ success: false, message: `Erreur: ${translate[language].userAuthNotFound}` });
        // return response.error(res, 404, translate[language].userAuthNotFound);
      }
      // check if password matches
      if (!await bcrypt.compare(req.query.password, user.local.password)) {
        return res.status(401).json({ success: false, message: `Erreur: ${translate[language].userAuthFailed}` });
      }
      const payload = {
        firstname: user.firstname,
        lastname: user.lastname,
        _id: user.id,
        'local.email': user.local.email,
        role: user.role,
        customer_id: user.customer_id,
        employee_id: user.employee_id,
        sector: user.sector
      };
      const newPayload = _.pickBy(payload);
      const token = tokenProcess.encode(newPayload);
      console.log(`${req.query.email} connected`);
      // return the information including token as JSON
      console.log('REDIRECT_URI =');
      console.log(req.query.redirect_uri);
      const redirectUri = `${req.query.redirect_uri}&authorization_code=${token}`;
      return res.redirect(302, redirectUri);
      // return response.success(res, translate[language].userAuthentified, { user: user, token: token } );
    } catch (e) {
      return res.status(500).send({ success: false, message: `Erreur: ${translate[language].unexpectedBehavior}` });
      // return response.error(res, 500, translate[language].unexpectedBehavior);
    }
  },
  getUserByParamId: async (req, res) => {
    try {
      const user = await User.findOne({ _id: req.params._id });
      if (!user) {
        return res.status(404).send({ success: false, message: translate[language].userNotFound });
      }
      const payload = {
        firstname: user.firstname,
        lastname: user.lastname,
        _id: user.id,
        'local.email': user.local.email,
        role: user.role,
        customer_id: user.customer_id,
        employee_id: user.employee_id,
        sector: user.sector
      };
      const newPayload = _.pickBy(payload);
      res.status(200).send({ success: true, message: translate[language].userFound, data: { user: newPayload } });
    } catch (e) {
      return res.status(404).send({ success: false, message: translate[language].userNotFound });
    }
  },
  sendMessageToBotUser: async (req, res) => {
    try {
      if (!req.body.message || !req.params._id) {
        return res.status(400).send({ success: false, message: `Erreur: ${translate[language].missingParameters}` });
      }
      const userAddressRaw = await User.findById(req.params._id).select('facebook.address');
      const userAddress = userAddressRaw.facebook.address;
      const sentMessage = await redirectToBot(userAddress, req.body.message);
      return res.status(200).send({ success: true, message: translate[language].sentMessageToUserBot, data: { user: sentMessage } });
    } catch (e) {
      console.error(e.message);
      return res.status(500).send({ success: false, message: `Erreur: ${translate[language].unexpectedBehavior}` });
    }
  }
};
