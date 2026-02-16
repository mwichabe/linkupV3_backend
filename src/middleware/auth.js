const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// ─── Protect route (must be logged in) ──────────────────────────────────────
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. Please login.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended.',
        reason: user.banReason,
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated.' });
    }

    // Update last active (throttled)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (!user.lastActive || user.lastActive < fiveMinutesAgo) {
      await User.findByIdAndUpdate(decoded.id, { lastActive: new Date(), isOnline: true });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.', code: 'TOKEN_EXPIRED' });
    }
    logger.error(`Auth error: ${err.message}`);
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// ─── Optional auth (public routes that can use user context) ─────────────────
const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    } catch (_) {
      // Silent fail — public route
    }
  }
  next();
};

// ─── Check if email is verified ──────────────────────────────────────────────
const requireEmailVerified = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email first.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
  next();
};

// ─── Socket.io auth middleware ───────────────────────────────────────────────
const socketAuth = async (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('_id username avatar isOnline');
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
};

module.exports = { protect, optionalAuth, requireEmailVerified, socketAuth };
