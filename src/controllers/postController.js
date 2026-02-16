const Post = require('../models/Post');
const User = require('../models/User');
const { Comment, Notification, Hashtag, SavedCollection } = require('../models/Social');
const { uploadToCloudinary, uploadVideo, deleteFromCloudinary } = require('../config/cloudinary');
const AIService = require('../services/aiService');
const logger = require('../utils/logger');
const fs = require('fs');

// Helper: process & upload media files
const processMedia = async (files) => {
  const mediaItems = [];
  for (const file of files) {
    try {
      const isVideo = file.mimetype.startsWith('video/');
      let result;
      if (isVideo) {
        result = await uploadVideo(file.path, 'posts/videos');
      } else {
        result = await uploadToCloudinary(file.path, 'posts/images', {
          transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
        });
      }
      mediaItems.push({
        url: result.secure_url,
        publicId: result.public_id,
        type: isVideo ? 'video' : 'image',
        width: result.width,
        height: result.height,
        duration: result.duration,
        aspectRatio: result.width / result.height,
        thumbnail: isVideo ? result.eager?.[0]?.secure_url : undefined,
      });
      fs.unlinkSync(file.path);
    } catch (err) {
      logger.error(`Media upload error: ${err.message}`);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
  }
  return mediaItems;
};

// Helper: extract and upsert hashtags
const processHashtags = async (caption, type = 'post') => {
  const matches = caption.match(/#[a-zA-Z0-9_]+/g) || [];
  const tags = [...new Set(matches.map(t => t.slice(1).toLowerCase()))];

  const updateField = type === 'reel' ? 'reelsCount' : 'postsCount';
  for (const tag of tags) {
    await Hashtag.findOneAndUpdate(
      { name: tag },
      { $inc: { [updateField]: 1 }, $setOnInsert: { name: tag } },
      { upsert: true }
    );
  }
  return tags;
};

// ─── POST /posts ──────────────────────────────────────────────────────────────
exports.createPost = async (req, res) => {
  const { caption, location, visibility, commentsEnabled, likesVisible, type } = req.body;
  const files = req.files || [];

  if (files.length === 0 && type !== 'story') {
    return res.status(400).json({ success: false, message: 'At least one media file is required' });
  }

  const media = await processMedia(files);
  const hashtags = caption ? await processHashtags(caption, type) : [];

  // Extract @mentions
  const mentionMatches = caption?.match(/@[a-zA-Z0-9._]+/g) || [];
  const mentionUsernames = mentionMatches.map(m => m.slice(1));
  const mentionedUsers = await User.find({ username: { $in: mentionUsernames } }).select('_id');

  // AI features (async, non-blocking for UX)
  let aiTags = [], aiSentiment, aiCaption;
  if (media[0]?.url && media[0].type === 'image') {
    const aiData = await AIService.detectImageTags(media[0].url).catch(() => null);
    if (aiData) {
      aiTags = aiData.tags || [];
      aiSentiment = aiData.mood;
    }
  }

  const postData = {
    author: req.user._id,
    media,
    caption: caption || '',
    hashtags,
    mentions: mentionedUsers.map(u => u._id),
    visibility: visibility || 'public',
    commentsEnabled: commentsEnabled !== false,
    likesVisible: likesVisible !== false,
    type: type || 'post',
    aiTags,
    aiSentiment,
    location: location ? JSON.parse(location) : undefined,
  };

  if (type === 'story') {
    postData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  const post = await Post.create(postData);
  await Post.populate(post, { path: 'author', select: 'username displayName avatar isVerified verificationBadge' });

  // Update post count
  await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: 1 } });

  // Notify mentioned users
  for (const userId of mentionedUsers.map(u => u._id)) {
    if (!userId.equals(req.user._id)) {
      await Notification.create({
        recipient: userId,
        actor: req.user._id,
        type: 'mention',
        post: post._id,
      });
    }
  }

  logger.info(`Post created by ${req.user.username}: ${post._id}`);
  res.status(201).json({ success: true, post });
};

// ─── GET /posts/feed ──────────────────────────────────────────────────────────
exports.getFeed = async (req, res) => {
  const { page = 1, limit = 12 } = req.query;
  const skip = (page - 1) * limit;
  const followingIds = req.user.following;

  // Algorithm: mix of following + explore
  const posts = await Post.find({
    $or: [
      { author: { $in: followingIds }, type: 'post' },
      { type: 'post', visibility: 'public', likesCount: { $gte: 50 } }, // trending
    ],
    isDeleted: false,
    isArchived: false,
    author: { $nin: req.user.blockedUsers },
  })
    .populate('author', 'username displayName avatar isVerified verificationBadge isOnline')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  // Add isLiked / isSaved flags
  const userId = req.user._id.toString();
  const postsWithFlags = posts.map(p => ({
    ...p,
    isLiked: p.likes?.some(id => id.toString() === userId),
    isSaved: p.saves?.some(id => id.toString() === userId),
    likes: undefined, // don't send full array
    saves: undefined,
  }));

  res.json({ success: true, posts: postsWithFlags, page: Number(page) });
};

// ─── GET /posts/:id ───────────────────────────────────────────────────────────
exports.getPost = async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, isDeleted: false })
    .populate('author', 'username displayName avatar isVerified verificationBadge isOnline followersCount')
    .populate('mentions', 'username avatar');

  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

  // Increment views
  await Post.findByIdAndUpdate(req.params.id, { $inc: { viewsCount: 1 } });

  const userId = req.user?._id?.toString();
  const postObj = post.toObject();
  postObj.isLiked = userId ? post.likes?.some(id => id.toString() === userId) : false;
  postObj.isSaved = userId ? post.saves?.some(id => id.toString() === userId) : false;
  postObj.likes = undefined;
  postObj.saves = undefined;

  res.json({ success: true, post: postObj });
};

// ─── DELETE /posts/:id ────────────────────────────────────────────────────────
exports.deletePost = async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, author: req.user._id });
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

  // Soft delete
  post.isDeleted = true;
  post.deletedAt = new Date();
  await post.save();

  // Delete media from cloudinary (async)
  for (const media of post.media) {
    if (media.publicId) {
      deleteFromCloudinary(media.publicId, media.type === 'video' ? 'video' : 'image').catch(() => {});
    }
  }

  await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: -1 } });
  res.json({ success: true, message: 'Post deleted' });
};

// ─── POST /posts/:id/like ─────────────────────────────────────────────────────
exports.toggleLike = async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

  const userId = req.user._id;
  const isLiked = post.likes.includes(userId);

  if (isLiked) {
    await Post.findByIdAndUpdate(post._id, {
      $pull: { likes: userId },
      $inc: { likesCount: -1 },
    });
    // Remove notification
    await Notification.deleteOne({ actor: userId, post: post._id, type: 'like' });
  } else {
    await Post.findByIdAndUpdate(post._id, {
      $addToSet: { likes: userId },
      $inc: { likesCount: 1 },
    });
    // Create notification (not for own post)
    if (!post.author.equals(userId)) {
      await Notification.create({
        recipient: post.author,
        actor: userId,
        type: post.type === 'reel' ? 'reel_like' : 'like',
        post: post._id,
      });
    }
  }

  res.json({ success: true, isLiked: !isLiked, likesCount: post.likesCount + (isLiked ? -1 : 1) });
};

// ─── POST /posts/:id/save ─────────────────────────────────────────────────────
exports.toggleSave = async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

  const userId = req.user._id;
  const isSaved = post.saves.includes(userId);

  await Post.findByIdAndUpdate(post._id, isSaved
    ? { $pull: { saves: userId }, $inc: { savesCount: -1 } }
    : { $addToSet: { saves: userId }, $inc: { savesCount: 1 } }
  );

  // Add to default collection
  const collection = await SavedCollection.findOne({ user: userId, isDefault: true });
  if (collection) {
    if (isSaved) {
      collection.posts.pull(post._id);
    } else {
      collection.posts.addToSet(post._id);
    }
    await collection.save();
  }

  res.json({ success: true, isSaved: !isSaved });
};

// ─── GET /posts/:id/comments ──────────────────────────────────────────────────
exports.getComments = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const comments = await Comment.find({
    post: req.params.id,
    parentComment: null,
    isDeleted: false,
  })
    .populate('author', 'username avatar isVerified')
    .sort({ isPinned: -1, likesCount: -1, createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  // Add isLiked flag
  const userId = req.user?._id?.toString();
  const commentsWithFlags = comments.map(c => ({
    ...c,
    isLiked: userId ? c.likes?.some(id => id.toString() === userId) : false,
    likes: undefined,
  }));

  res.json({ success: true, comments: commentsWithFlags });
};

// ─── POST /posts/:id/comments ─────────────────────────────────────────────────
exports.addComment = async (req, res) => {
  const { text, parentCommentId } = req.body;
  if (!text?.trim()) return res.status(400).json({ success: false, message: 'Comment text required' });

  // AI spam & moderation check
  const modResult = await AIService.moderateContent(text);
  if (modResult.isFlagged && modResult.score > 0.8) {
    return res.status(400).json({ success: false, message: 'Comment violates community guidelines' });
  }

  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
  if (!post.commentsEnabled) return res.status(403).json({ success: false, message: 'Comments disabled' });

  const comment = await Comment.create({
    post: req.params.id,
    author: req.user._id,
    text: text.trim(),
    parentComment: parentCommentId || null,
    aiModerated: modResult.isFlagged,
    aiModerationReason: modResult.isFlagged ? 'auto_review' : undefined,
  });

  await Post.findByIdAndUpdate(req.params.id, { $inc: { commentsCount: 1 } });

  if (parentCommentId) {
    await Comment.findByIdAndUpdate(parentCommentId, { $inc: { repliesCount: 1 } });
  }

  await comment.populate('author', 'username avatar isVerified');

  // Notifications
  if (!post.author.equals(req.user._id)) {
    await Notification.create({
      recipient: post.author,
      actor: req.user._id,
      type: parentCommentId ? 'comment_reply' : 'comment',
      post: post._id,
      comment: comment._id,
    });
  }

  res.status(201).json({ success: true, comment });
};

// ─── GET /posts/explore ───────────────────────────────────────────────────────
exports.explore = async (req, res) => {
  const { page = 1, limit = 30, category } = req.query;
  const skip = (page - 1) * limit;

  const query = {
    type: { $in: ['post', 'reel'] },
    visibility: 'public',
    isDeleted: false,
    isArchived: false,
  };

  if (category && category !== 'all') {
    query.aiTags = category;
  }

  const posts = await Post.find(query)
    .populate('author', 'username avatar isVerified')
    .sort({ viewsCount: -1, likesCount: -1, createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .select('media type likesCount commentsCount viewsCount author aiTags')
    .lean();

  res.json({ success: true, posts });
};

// ─── GET /posts/reels ─────────────────────────────────────────────────────────
exports.getReels = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const reels = await Post.find({
    type: 'reel',
    visibility: 'public',
    isDeleted: false,
    author: { $nin: req.user?.blockedUsers || [] },
  })
    .populate('author', 'username displayName avatar isVerified verificationBadge isOnline')
    .sort({ viewsCount: -1, createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const userId = req.user?._id?.toString();
  const reelsWithFlags = reels.map(r => ({
    ...r,
    isLiked: userId ? r.likes?.some(id => id.toString() === userId) : false,
    isSaved: userId ? r.saves?.some(id => id.toString() === userId) : false,
    isFollowing: userId ? req.user.following?.some(id => id.toString() === r.author._id.toString()) : false,
    likes: undefined,
    saves: undefined,
  }));

  res.json({ success: true, reels: reelsWithFlags });
};

// ─── GET /posts/stories ───────────────────────────────────────────────────────
exports.getStories = async (req, res) => {
  const followingIds = req.user.following;

  const stories = await Post.find({
    author: { $in: [...followingIds, req.user._id] },
    type: 'story',
    isDeleted: false,
    expiresAt: { $gt: new Date() },
  })
    .populate('author', 'username avatar isVerified')
    .sort({ author: 1, createdAt: 1 })
    .lean();

  // Group by author
  const grouped = {};
  for (const story of stories) {
    const authorId = story.author._id.toString();
    if (!grouped[authorId]) {
      grouped[authorId] = { author: story.author, stories: [], hasUnviewed: false };
    }
    grouped[authorId].stories.push(story);
  }

  res.json({ success: true, stories: Object.values(grouped) });
};

// ─── POST /posts/:id/ai-caption ───────────────────────────────────────────────
exports.getAICaption = async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

  const imageUrl = post.media[0]?.url;
  if (!imageUrl) return res.status(400).json({ success: false, message: 'No image found' });

  const user = await User.findById(req.user._id);
  const suggestions = await AIService.generateCaption(imageUrl, user.bio);
  res.json({ success: true, suggestions });
};

// ─── POST /posts/ai-hashtags ──────────────────────────────────────────────────
exports.getAIHashtags = async (req, res) => {
  const { caption, imageUrl } = req.body;
  const hashtags = await AIService.suggestHashtags(caption, imageUrl);
  res.json({ success: true, hashtags });
};

// ─── GET /posts/trending ──────────────────────────────────────────────────────
exports.getTrending = async (req, res) => {
  const trending = await Post.find({
    type: { $in: ['post', 'reel'] },
    visibility: 'public',
    isDeleted: false,
    createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
  })
    .sort({ viewsCount: -1, likesCount: -1 })
    .limit(20)
    .populate('author', 'username avatar isVerified')
    .lean();

  res.json({ success: true, posts: trending });
};
