/**
 * This file is used to run the server locally for testing.
 * It imports the same Express app that is used in functions/index.js.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { app } = require('./functions/index');

// Environment variables can be set here for local testing
process.env.NODE_ENV = 'development';

// Port to listen on
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
  console.log(`Local development server is running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the server`);
});
