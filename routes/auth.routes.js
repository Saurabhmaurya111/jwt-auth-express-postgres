const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  signupValidationRules,
  signinValidationRules,
  handleValidationErrors,
} = require('../middleware/validate.middleware');

// Throttle brute-force attempts on signin/signup specifically
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

router.post(
  '/signup',
  authLimiter,
  signupValidationRules,
  handleValidationErrors,
  authController.signup
);

router.post(
  '/signin',
  authLimiter,
  signinValidationRules,
  handleValidationErrors,
  authController.signin
);

router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.getProfile);

module.exports = router;
