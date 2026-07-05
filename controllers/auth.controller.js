const bcrypt = require('bcrypt');
const UserModel = require('../models/user.model');
const RefreshTokenModel = require('../models/refreshToken.model');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshExpiryDate,
} = require('../utils/jwt.util');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'refresh_token';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth', // scope the cookie to auth routes only
};

function publicUser(user) {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
  };
}

async function issueTokenPair(res, user) {
  const payload = { sub: user.id, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await RefreshTokenModel.store({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiryDate(),
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieOptions,
    expires: refreshExpiryDate(),
  });

  return accessToken;
}

/**
 * POST /api/auth/signup
 * body: { firstName, lastName, email, password }
 */
async function signup(req, res, next) {
  try {
    const { firstName, lastName, email, password } = req.body;

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      // Deliberately vague — don't confirm which emails are registered
      return res.status(409).json({
        success: false,
        message: 'Unable to create account with the provided details',
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await UserModel.create({ firstName, lastName, email, passwordHash });

    const accessToken = await issueTokenPair(res, user);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { user: publicUser(user), accessToken },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/signin
 * body: { email, password }
 */
async function signin(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await UserModel.findByEmail(email);
    // Same error for "no user" and "wrong password" — avoid leaking which one failed
    const invalidCredsResponse = () =>
      res.status(401).json({ success: false, message: 'Invalid email or password' });

    if (!user || !user.is_active) return invalidCredsResponse();

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) return invalidCredsResponse();

    const accessToken = await issueTokenPair(res, user);

    return res.status(200).json({
      success: true,
      message: 'Signed in successfully',
      data: { user: publicUser(user), accessToken },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Reads refresh token from httpOnly cookie, rotates it, issues a new access token.
 */
async function refresh(req, res, next) {
  try {
    const tokenFromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!tokenFromCookie) {
      return res.status(401).json({ success: false, message: 'Refresh token missing' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(tokenFromCookie);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const tokenHash = hashToken(tokenFromCookie);
    const storedToken = await RefreshTokenModel.findValidByHash(tokenHash);

    if (!storedToken) {
      // Token reuse or tampering — revoke everything for this user as a precaution
      await RefreshTokenModel.revokeAllForUser(decoded.sub);
      res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
      return res.status(401).json({ success: false, message: 'Refresh token reuse detected' });
    }

    const user = await UserModel.findById(decoded.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'User no longer active' });
    }

    // Rotate: issue a new refresh token, revoke the old one
    const newAccessToken = await issueTokenPair(res, user);
    await RefreshTokenModel.revokeById(storedToken.id);

    return res.status(200).json({
      success: true,
      data: { accessToken: newAccessToken },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res, next) {
  try {
    const tokenFromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
    if (tokenFromCookie) {
      const tokenHash = hashToken(tokenFromCookie);
      const storedToken = await RefreshTokenModel.findValidByHash(tokenHash);
      if (storedToken) await RefreshTokenModel.revokeById(storedToken.id);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me  (protected)
 */
async function getProfile(req, res, next) {
  try {
    const user = await UserModel.findById(req.user.sub);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.status(200).json({ success: true, data: { user: publicUser(user) } });
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, signin, refresh, logout, getProfile };
