const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String },
  type: { type: String, enum: ['image', 'video'], required: true },
  width: Number,
  height: Number,
  duration: Number, // seconds for video
  thumbnail: String, // for video
  aspectRatio: Number,
  altText: { type: String, default: '' },
  filters: { type: String, default: 'none' },
}, { _id: false });

const taggedUserSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  x: Number, // position percentage 0-100
  y: Number,
}, { _id: false });

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  media: [mediaSchema],
  caption: { type: String, maxlength: [2200, 'Caption cannot exceed 2200 characters'], default: '' },
  
  // AI-generated caption suggestion
  aiCaption: { type: String, default: '' },
  
  // Location
  location: {
    name: String,
    lat: Number,
    lng: Number,
    placeId: String,
  },
  
  // Tags
  hashtags: [{ type: String, lowercase: true }],
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  taggedUsers: [taggedUserSchema],
  
  // Engagement
  likesCount: { type: Number, default: 0 },
  commentsCount: { type: Number, default: 0 },
  sharesCount: { type: Number, default: 0 },
  savesCount: { type: Number, default: 0 },
  viewsCount: { type: Number, default: 0 },
  
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  saves: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Settings
  type: { type: String, enum: ['post', 'reel', 'story'], default: 'post' },
  visibility: { type: String, enum: ['public', 'followers', 'closefriends', 'private'], default: 'public' },
  commentsEnabled: { type: Boolean, default: true },
  likesVisible: { type: Boolean, default: true },
  
  // AI Features
  aiTags: [String], // auto-generated object/scene tags
  aiModerationScore: { type: Number, default: 0 }, // 0-1 safety score
  aiSentiment: { type: String, enum: ['positive', 'neutral', 'negative', 'mixed'] },
  
  // Reel-specific
  audioTrack: {
    name: String,
    artist: String,
    url: String,
    startTime: Number,
  },
  
  // Story-specific
  expiresAt: Date, // 24h for stories
  storyBackground: {
    type: { type: String, enum: ['color', 'gradient', 'image'] },
    value: String,
  },
  storySticker: [{
    type: { type: String },
    value: String,
    x: Number,
    y: Number,
    scale: Number,
  }],
  
  // Status
  isArchived: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  
  // Boosted/Sponsored
  isBoosted: { type: Boolean, default: false },
  boostExpiry: Date,
  
}, { timestamps: true });

// ─── Indexes ──────────────────────────────────────────────────────────────────
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ type: 1, createdAt: -1 });
postSchema.index({ 'location.name': 'text', caption: 'text', hashtags: 'text' });
postSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { type: 'story' } });
postSchema.index({ likesCount: -1, createdAt: -1 });
postSchema.index({ isDeleted: 1, isArchived: 1 });

module.exports = mongoose.model('Post', postSchema);
