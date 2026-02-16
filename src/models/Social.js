const mongoose = require('mongoose');

// ─── Comment ──────────────────────────────────────────────────────────────────
const commentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: [500, 'Comment too long'] },
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  likesCount: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  repliesCount: { type: Number, default: 0 },
  isPinned: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  aiModerated: { type: Boolean, default: false },
  aiModerationReason: String,
}, { timestamps: true });

commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ parentComment: 1, createdAt: 1 });
commentSchema.index({ author: 1 });

const Comment = mongoose.model('Comment', commentSchema);

// ─── Notification ─────────────────────────────────────────────────────────────
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: [
      'like', 'comment', 'follow', 'follow_request', 'mention',
      'tag', 'reel_like', 'story_reaction', 'story_reply',
      'comment_like', 'comment_reply', 'live_start',
      'post_by_following', 'ai_insight', 'system'
    ],
    required: true,
  },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
  message: String,
  isRead: { type: Boolean, default: false },
  readAt: Date,
  metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 days

const Notification = mongoose.model('Notification', notificationSchema);

// ─── Message ──────────────────────────────────────────────────────────────────
const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'post_share', 'reel_share', 'story_reply', 'link', 'ai_suggestion'],
    default: 'text',
  },
  text: String,
  media: {
    url: String,
    type: String,
    thumbnail: String,
    duration: Number,
  },
  sharedPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String,
  }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isDeleted: { type: Boolean, default: false },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isEdited: { type: Boolean, default: false },
  editHistory: [{ text: String, editedAt: Date }],
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

const Message = mongoose.model('Message', messageSchema);

// ─── Conversation ─────────────────────────────────────────────────────────────
const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isGroup: { type: Boolean, default: false },
  groupName: String,
  groupAvatar: { url: String, publicId: String },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  lastActivity: { type: Date, default: Date.now },
  unreadCounts: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, count: { type: Number, default: 0 } }],
  mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  theme: { type: String, default: 'default' },
  emoji: { type: String, default: '❤️' },
}, { timestamps: true });

conversationSchema.index({ participants: 1, lastActivity: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

// ─── Follow Request ───────────────────────────────────────────────────────────
const followRequestSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  target: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
}, { timestamps: true });

followRequestSchema.index({ requester: 1, target: 1 }, { unique: true });
followRequestSchema.index({ target: 1, status: 1 });

const FollowRequest = mongoose.model('FollowRequest', followRequestSchema);

// ─── Hashtag ──────────────────────────────────────────────────────────────────
const hashtagSchema = new mongoose.Schema({
  name: { type: String, unique: true, lowercase: true, required: true },
  postsCount: { type: Number, default: 0 },
  reelsCount: { type: Number, default: 0 },
  trending: { type: Boolean, default: false },
  trendingScore: { type: Number, default: 0 },
  category: String,
}, { timestamps: true });

hashtagSchema.index({ name: 1 });
hashtagSchema.index({ trendingScore: -1 });
hashtagSchema.index({ name: 'text' });

const Hashtag = mongoose.model('Hashtag', hashtagSchema);

// ─── Report ───────────────────────────────────────────────────────────────────
const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['post', 'user', 'comment', 'reel', 'message'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: {
    type: String,
    enum: ['spam', 'nudity', 'violence', 'hate_speech', 'false_info', 'harassment', 'other'],
    required: true,
  },
  description: String,
  status: { type: String, enum: ['pending', 'reviewed', 'resolved', 'dismissed'], default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  action: String,
}, { timestamps: true });

const Report = mongoose.model('Report', reportSchema);

// ─── SavedCollection ─────────────────────────────────────────────────────────
const savedCollectionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, default: 'All Posts' },
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  coverPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

savedCollectionSchema.index({ user: 1 });
const SavedCollection = mongoose.model('SavedCollection', savedCollectionSchema);

module.exports = {
  Comment,
  Notification,
  Message,
  Conversation,
  FollowRequest,
  Hashtag,
  Report,
  SavedCollection,
};
