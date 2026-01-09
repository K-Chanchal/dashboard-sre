const serverless = require('serverless-http');
  const app = require('./server');  // Import the Express app from server.js

  // Export Lambda handler that wraps the Express app
  module.exports.handler = serverless(app);
