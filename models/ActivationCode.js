const mongoose = require('mongoose');

const ActivationCodeSchema = mongoose.Schema({
  code: {
    type: Number,
    required: true
  },
  mobile_phone: {
    type: Number,
    required: true
  },
  // employee_id: {
  //   type: Number,
  //   required: true
  // },
  // token: String,
  created_at: {
    type: Date,
    default: Date.now,
    expires: 172800 // 2 days expire
  }
});

module.exports = mongoose.model('ActivationCode', ActivationCodeSchema);
