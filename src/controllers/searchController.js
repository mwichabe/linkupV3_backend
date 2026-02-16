const User = require('../models/User');
const Post = require('../models/Post');
const { Hashtag } = require('../models/Social');

// ─── GET /search ──────────────────────────────────────────────────────────────
exports.globalSearch = async (req, res) => {
  const { q, type = 'all', page = 1, limit = 20 } = req.query;
  if (!q?.trim()) return res.json({ success: true, results: {} });

  const skip = (page - 1) * limit;
  const results = {};

  if (type === 'all' || type === 'users') {
    results.users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { displayName: { $regex: q, $options: 'i' } },
      ],
      isActive: true,
      isBanned: false,
    })
      .select('username displayName avatar isVerified followersCount bio')
      .sort({ followersCount: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();
  }

  if (type === 'all' || type === 'tags') {
    results.hashtags = await Hashtag.find({
      name: { $regex: q.replace('#', ''), $options: 'i' },
    })
      .sort({ postsCount: -1 })
      .limit(10)
      .lean();
  }

  if (type === 'all' || type === 'posts') {
    results.posts = await Post.find({
      $or: [
        { caption: { $regex: q, $options: 'i' } },
        { hashtags: q.toLowerCase().replace('#', '') },
      ],
      isDeleted: false,
      visibility: 'public',
    })
      .populate('author', 'username avatar isVerified')
      .sort({ likesCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select('media caption likesCount commentsCount author type')
      .lean();
  }

  if (type === 'places') {
    // Future: integrate Google Places API
    results.places = [];
  }

  res.json({ success: true, query: q, results });
};

// ─── GET /search/hashtag/:tag ─────────────────────────────────────────────────
exports.getHashtagPosts = async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const tag = req.params.tag.toLowerCase().replace('#', '');

  const hashtag = await Hashtag.findOne({ name: tag });
  const posts = await Post.find({
    hashtags: tag,
    isDeleted: false,
    visibility: 'public',
  })
    .populate('author', 'username avatar isVerified')
    .sort({ likesCount: -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .select('media type likesCount commentsCount author')
    .lean();

  res.json({ success: true, hashtag, posts });
};

// ─── GET /search/trending-hashtags ────────────────────────────────────────────
exports.getTrendingHashtags = async (req, res) => {
  const hashtags = await Hashtag.find({ postsCount: { $gte: 5 } })
    .sort({ postsCount: -1, trendingScore: -1 })
    .limit(20)
    .lean();

  res.json({ success: true, hashtags });
};
