const User = require('../models/User');
const { SavedCollection } = require('../models/Social');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { uploadToCloudinary } = require('../config/cloudinary');
const fs = require('fs');
const emailService = require('../services/emailService');
const { OAuth2Client } = require('google-auth-library');

// Initialize Google OAuth client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage'
);

// Helper: send token response
const sendTokens = (user, statusCode, res) => {
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Store refresh token
  user.refreshTokens.push({ token: refreshToken, createdAt: new Date() });
  // Keep only last 5 refresh tokens
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }
  user.save({ validateBeforeSave: false });

  res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user: user.toPublicJSON(),
  });
};

// ─── POST /auth/register ─────────────────────────────────────────────────────
exports.register = async (req, res) => {
  const { username, email, password, displayName, phone } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    const field = existingUser.email === email ? 'Email' : 'Username';
    return res.status(400).json({ success: false, message: `${field} already in use` });
  }

  const user = await User.create({ username, email, password, displayName, phone });

  // Create default saved collection
  await SavedCollection.create({ user: user._id, name: 'All Posts', isDefault: true });

  // Generate and send verification email
  const otp = user.generateOTP();
  await user.save();
  
  try {
    await emailService.sendOTPEmail(user, otp);
  } catch (emailError) {
    logger.error('Failed to send verification email:', emailError);
    // Don't fail registration if email fails
  }

  logger.info(`New user registered: ${username}`);
  sendTokens(user, 201, res);
};

// ─── POST /auth/login ─────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const { emailOrUsername, password } = req.body;

  if (!emailOrUsername || !password) {
    return res.status(400).json({ success: false, message: 'Please provide credentials' });
  }

  const user = await User.findOne({
    $or: [
      { email: emailOrUsername.toLowerCase() },
      { username: emailOrUsername.toLowerCase() },
    ],
  }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (user.isBanned) {
    return res.status(403).json({ success: false, message: `Account suspended: ${user.banReason}` });
  }

  logger.info(`User logged in: ${user.username}`);
  sendTokens(user, 200, res);
};

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'Refresh token required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    // Validate refresh token is in list
    const tokenEntry = user.refreshTokens.find(t => t.token === refreshToken);
    if (!tokenEntry) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const newAccessToken = user.generateAccessToken();
    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

// ─── POST /auth/logout ────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { refreshTokens: { token: refreshToken } },
      isOnline: false,
    });
  }
  res.json({ success: true, message: 'Logged out successfully' });
};

// ─── POST /auth/send-otp ──────────────────────────────────────────────────────
exports.sendOTP = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const otp = user.generateOTP();
    await user.save();

    await emailService.sendOTPEmail(user, otp);

    logger.info(`OTP sent to ${email}`);
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    logger.error('Error sending OTP:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email, otp, otpExpires: { $gt: Date.now() } });

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
  }

  user.isEmailVerified = true;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save({ validateBeforeSave: false });

  sendTokens(user, 200, res);
};

// ─── POST /auth/forgot-password ───────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const otp = user.generateOTP();
    await user.save();

    await emailService.sendPasswordResetOTPEmail(user, otp);

    logger.info(`Password reset OTP sent to ${email}`);
    res.json({ success: true, message: 'Password reset OTP sent successfully' });
  } catch (error) {
    logger.error('Error sending password reset OTP:', error);
    res.status(500).json({ success: false, message: 'Failed to send password reset OTP' });
  }
};

// ─── POST /auth/reset-password ────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });

  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // Invalidate all sessions
  await user.save();

  sendTokens(user, 200, res);
};

// ─── POST /auth/reset-password-otp ───────────────────────────────────────
exports.resetPasswordWithOTP = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  // Validate input
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email, OTP, and new password are required' 
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ 
      success: false, 
      message: 'Password must be at least 8 characters long' 
    });
  }

  // Find user with valid OTP
  const user = await User.findOne({ 
    email, 
    otp, 
    otpExpires: { $gt: Date.now() } 
  });

  if (!user) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid or expired OTP' 
    });
  }

  try {
    // Update password and clear OTP
    user.password = newPassword;
    user.otp = undefined;
    user.otpExpires = undefined;
    user.refreshTokens = []; // Invalidate all sessions
    await user.save();

    logger.info(`Password reset successfully for user: ${email}`);
    
    res.json({ 
      success: true, 
      message: 'Password reset successfully. Please login with your new password.' 
    });
  } catch (error) {
    logger.error('Error resetting password:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset password' 
    });
  }
};

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, user: user.toPublicJSON() });
};

// ─── PUT /auth/update-profile ─────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  const allowedFields = ['displayName', 'bio', 'website', 'phone', 'gender', 'dateOfBirth'];
  const updates = {};
  allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (req.file) {
    const result = await uploadToCloudinary(req.file.path, 'avatars', {
      transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face' }],
    });
    updates.avatar = { url: result.secure_url, publicId: result.public_id };
    fs.unlinkSync(req.file.path);
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  res.json({ success: true, user: user.toPublicJSON() });
};

// ─── PUT /auth/change-password ────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    return res.status(401).json({ success: false, message: 'Current password incorrect' });
  }
  user.password = req.body.newPassword;
  await user.save();
  sendTokens(user, 200, res);
};

// ─── PUT /auth/privacy-settings ───────────────────────────────────────────────
exports.updatePrivacy = async (req, res) => {
  const allowed = ['isPrivate', 'allowMessagesFrom', 'showActivityStatus', 'allowTagging'];
  const updates = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
  res.json({ success: true, user: user.toPublicJSON() });
};

// ─── POST /auth/google ───────────────────────────────────────────────────────
exports.googleAuth = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: 'Google ID token is required' });
  }

  try {
    // Verify Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists
    let user = await User.findOne({ 
      $or: [
        { email },
        { 'socialAuth.googleId': googleId }
      ]
    });

    if (!user) {
      // Create new user
      user = await User.create({
        username: email.split('@')[0] + '_' + Math.random().toString(36).substring(7),
        email,
        displayName: name,
        avatar: picture,
        isEmailVerified: true,
        socialAuth: {
          googleId,
          provider: 'google'
        },
        password: crypto.randomBytes(32).toString('hex'), // Random password for Google users
      });

      // Create default saved collection
      await SavedCollection.create({ user: user._id, name: 'All Posts', isDefault: true });

      logger.info(`New Google user registered: ${email}`);
    } else if (!user.socialAuth?.googleId) {
      // Link Google account to existing user
      user.socialAuth = user.socialAuth || {};
      user.socialAuth.googleId = googleId;
      user.socialAuth.provider = 'google';
      if (!user.avatar && picture) {
        user.avatar = picture;
      }
      await user.save();
      logger.info(`Google account linked to existing user: ${email}`);
    }

    sendTokens(user, 200, res);
  } catch (error) {
    logger.error('Google auth error:', error);
    res.status(400).json({ 
      success: false, 
      message: 'Failed to authenticate with Google',
      error: error.message 
    });
  }
};
