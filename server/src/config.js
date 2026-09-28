const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/library',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
};

if (!config.jwtSecret) {
  throw new Error('JWT_SECRET is not set. Copy server/.env.example to server/.env first.');
}

module.exports = config;
