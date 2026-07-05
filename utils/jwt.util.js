const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT secrets are not configured. Check your .env file.');
}

function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
    issuer: 'auth-module',
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
    issuer: 'auth-module',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET, { issuer: 'auth-module' });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET, { issuer: 'auth-module' });
}

/**
 * We never store raw refresh tokens in the DB — only a SHA-256 hash.
 * This way, a DB leak alone can't be replayed as a valid token.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshExpiryDate() {
  // Converts values like '7d', '15m' into a concrete Date
  const match = /^(\d+)([smhd])$/.exec(REFRESH_EXPIRES_IN);
  const now = new Date();
  if (!match) return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return new Date(now.getTime() + value * multipliers[unit]);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  refreshExpiryDate,
};
