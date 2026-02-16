const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9._]+$/, 'Username can only contain letters, numbers, dots and underscores'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false,
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true,
    maxlength: [50, 'Display name cannot exceed 50 characters'],
  },
  bio: { type: String, maxlength: [150, 'Bio cannot exceed 150 characters'], default: '' },
  website: { type: String, default: '' },
  avatar: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
  },
  phone: { type: String, default: '' },
  gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'], default: 'prefer_not_to_say' },
  dateOfBirth: { type: Date },
  
  // Social
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  closeFriends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Counts (denormalized for performance)
  followersCount: { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
  postsCount: { type: Number, default: 0 },
  
  // Verification
  isVerified: { type: Boolean, default: false },
  verificationBadge: { type: String, enum: ['none', 'official', 'creator', 'business'], default: 'none' },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  // Auth
  passwordResetToken: String,
  passwordResetExpires: Date,
  otp: String,
  otpExpires: Date,
  refreshTokens: [{ token: String, createdAt: Date }],
  
  // Privacy & Settings
  isPrivate: { type: Boolean, default: false },
  allowMessagesFrom: { type: String, enum: ['everyone', 'following', 'nobody'], default: 'following' },
  showActivityStatus: { type: Boolean, default: true },
  allowTagging: { type: String, enum: ['everyone', 'following', 'nobody'], default: 'everyone' },
  
  // Account Status
  isActive: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  banReason: String,
  deactivatedAt: Date,
  
  // AI Features
  aiPersonalityProfile: {
    interests: [String],
    contentStyle: String,
    engagementPattern: String,
  },
  
  // Last active
  lastActive: { type: Date, default: Date.now },
  isOnline: { type: Boolean, default: false },
  
  // Device tokens for push notifications
  fcmTokens: [{ token: String, platform: String, addedAt: Date }],
  
  // Suggested
  suggestedHidden: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Social Authentication
  socialAuth: {
    googleId: String,
    provider: String,
  },
  
}, { timestamps: true });

// ─── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ followers: 1 });
userSchema.index({ following: 1 });
userSchema.index({ displayName: 'text', username: 'text', bio: 'text' });
userSchema.index({ lastActive: -1 });

// ─── Pre-save: Hash password ──────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ─── Methods ─────────────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign({ id: this._id, username: this.username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  });
};

userSchema.methods.toPublicJSON = function () {
  return {
    _id: this._id,
    username: this.username,
    displayName: this.displayName,
    bio: this.bio,
    website: this.website,
    avatar: this.avatar,
    followersCount: this.followersCount,
    followingCount: this.followingCount,
    postsCount: this.postsCount,
    isVerified: this.isVerified,
    verificationBadge: this.verificationBadge,
    isPrivate: this.isPrivate,
    isOnline: this.isOnline,
    lastActive: this.lastActive,
  };
};

userSchema.methods.generateOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;
  this.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return otp;
};

module.exports = mongoose.model('User', userSchema);
