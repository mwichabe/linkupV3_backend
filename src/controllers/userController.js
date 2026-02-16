const User = require('../models/User');
const Post = require('../models/Post');
const { Notification, FollowRequest } = require('../models/Social');

// ─── GET /users/:username ──────────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  const user = await User.findOne({ username: req.params.username, isActive: true });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const isOwnProfile = req.user?._id.toString() === user._id.toString();
  const isFollowing = req.user?.following.includes(user._id);
  const isBlocked = req.user?.blockedUsers.includes(user._id);

  if (isBlocked) return res.status(403).json({ success: false, message: 'User not found' });

  const profile = user.toPublicJSON();
  profile.isFollowing = isFollowing;
  profile.isOwnProfile = isOwnProfile;

  // Check follow request if private
  if (user.isPrivate && !isFollowing && !isOwnProfile) {
    const request = await FollowRequest.findOne({ requester: req.user?._id, target: user._id });
    profile.followRequestStatus = request?.status || null;
    profile.posts = [];
    res.json({ success: true, user: profile });
    return;
  }

  res.json({ success: true, user: profile });
};

// ─── GET /users/:username/posts ───────────────────────────────────────────────
exports.getUserPosts = async (req, res) => {
  const { page = 1, limit = 12, type = 'post' } = req.query;
  const user = await User.findOne({ username: req.params.username });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const isOwnProfile = req.user?._id.toString() === user._id.toString();
  const isFollowing = req.user?.following.includes(user._id);

  if (user.isPrivate && !isFollowing && !isOwnProfile) {
    return res.status(403).json({ success: false, message: 'This account is private' });
  }

  const visibilityFilter = isOwnProfile
    ? {}
    : { visibility: { $in: ['public', 'followers'] } };

  const posts = await Post.find({
    author: user._id,
    type,
    isDeleted: false,
    isArchived: false,
    ...visibilityFilter,
  })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .select('media type likesCount commentsCount viewsCount createdAt')
    .lean();

  res.json({ success: true, posts });
};

// ─── POST /users/:id/follow ───────────────────────────────────────────────────
exports.toggleFollow = async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    return res.status(400).json({ success: false, message: 'Cannot follow yourself' });
  }

  const targetUser = await User.findById(req.params.id);
  if (!targetUser || !targetUser.isActive) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const isFollowing = req.user.following.includes(req.params.id);

  if (isFollowing) {
    // Unfollow
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { following: req.params.id },
      $inc: { followingCount: -1 },
    });
    await User.findByIdAndUpdate(req.params.id, {
      $pull: { followers: req.user._id },
      $inc: { followersCount: -1 },
    });
    await Notification.deleteOne({ actor: req.user._id, recipient: req.params.id, type: 'follow' });
    return res.json({ success: true, isFollowing: false });
  }

  // Private account: send request
  if (targetUser.isPrivate) {
    const existingRequest = await FollowRequest.findOne({
      requester: req.user._id,
      target: req.params.id,
    });

    if (existingRequest) {
      // Cancel request
      await existingRequest.deleteOne();
      await Notification.deleteOne({
        actor: req.user._id,
        recipient: req.params.id,
        type: 'follow_request',
      });
      return res.json({ success: true, requestStatus: null });
    }

    await FollowRequest.create({ requester: req.user._id, target: req.params.id });
    await Notification.create({
      recipient: req.params.id,
      actor: req.user._id,
      type: 'follow_request',
    });
    return res.json({ success: true, requestStatus: 'pending' });
  }

  // Public account: follow directly
  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { following: req.params.id },
    $inc: { followingCount: 1 },
  });
  await User.findByIdAndUpdate(req.params.id, {
    $addToSet: { followers: req.user._id },
    $inc: { followersCount: 1 },
  });
  await Notification.create({
    recipient: req.params.id,
    actor: req.user._id,
    type: 'follow',
  });

  res.json({ success: true, isFollowing: true });
};

// ─── POST /users/follow-requests/:id/accept ────────────────────────────────────
exports.acceptFollowRequest = async (req, res) => {
  const request = await FollowRequest.findOne({
    _id: req.params.id,
    target: req.user._id,
    status: 'pending',
  });

  if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

  request.status = 'accepted';
  await request.save();

  // Create follow relationship
  await User.findByIdAndUpdate(request.requester, {
    $addToSet: { following: req.user._id },
    $inc: { followingCount: 1 },
  });
  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { followers: request.requester },
    $inc: { followersCount: 1 },
  });

  // Notify requester
  await Notification.create({
    recipient: request.requester,
    actor: req.user._id,
    type: 'follow',
    message: 'accepted your follow request',
  });

  res.json({ success: true, message: 'Follow request accepted' });
};

// ─── GET /users/search ─────────────────────────────────────────────────────────
exports.searchUsers = async (req, res) => {
  const { q, page = 1, limit = 20 } = req.query;
  if (!q?.trim()) return res.json({ success: true, users: [] });

  const users = await User.find({
    $or: [
      { username: { $regex: q, $options: 'i' } },
      { displayName: { $regex: q, $options: 'i' } },
    ],
    isActive: true,
    _id: { $nin: req.user?.blockedUsers || [] },
  })
    .select('username displayName avatar isVerified verificationBadge followersCount')
    .sort({ followersCount: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  res.json({ success: true, users });
};

// ─── GET /users/suggestions ───────────────────────────────────────────────────
exports.getSuggestions = async (req, res) => {
  const { limit = 10 } = req.query;

  // Get friends-of-friends
  const following = req.user.following;
  const foF = await User.find({ _id: { $in: following }, isActive: true })
    .select('following')
    .lean();

  const fofIds = foF
    .flatMap(u => u.following)
    .filter(id => !following.includes(id) && !id.equals(req.user._id));

  const fofUnique = [...new Set(fofIds.map(id => id.toString()))];

  // Mix: friends-of-friends + popular accounts
  let suggestions = await User.find({
    _id: { $in: fofUnique },
    isActive: true,
    isBanned: false,
    _id: { $nin: req.user.blockedUsers },
  })
    .select('username displayName avatar isVerified followersCount')
    .limit(Number(limit))
    .lean();

  if (suggestions.length < limit) {
    const popular = await User.find({
      _id: { $nin: [...following, req.user._id, ...suggestions.map(s => s._id)] },
      isActive: true,
      followersCount: { $gte: 100 },
    })
      .select('username displayName avatar isVerified followersCount')
      .sort({ followersCount: -1 })
      .limit(Number(limit) - suggestions.length)
      .lean();

    suggestions = [...suggestions, ...popular];
  }

  res.json({ success: true, suggestions });
};

// ─── GET /users/:username/followers ───────────────────────────────────────────
exports.getFollowers = async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const user = await User.findOne({ username: req.params.username });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const followers = await User.find({ _id: { $in: user.followers } })
    .select('username displayName avatar isVerified followersCount')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  res.json({ success: true, followers, total: user.followersCount });
};

// ─── GET /users/:username/following ───────────────────────────────────────────
exports.getFollowing = async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const user = await User.findOne({ username: req.params.username });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const following = await User.find({ _id: { $in: user.following } })
    .select('username displayName avatar isVerified followersCount')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  res.json({ success: true, following, total: user.followingCount });
};

// ─── POST /users/:id/block ────────────────────────────────────────────────────
exports.blockUser = async (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.user._id.toString()) {
    return res.status(400).json({ success: false, message: 'Cannot block yourself' });
  }

  const isBlocked = req.user.blockedUsers.includes(targetId);

  if (isBlocked) {
    await User.findByIdAndUpdate(req.user._id, { $pull: { blockedUsers: targetId } });
    return res.json({ success: true, isBlocked: false, message: 'User unblocked' });
  }

  // Block: also unfollow
  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { blockedUsers: targetId },
    $pull: { following: targetId, followers: targetId },
  });
  await User.findByIdAndUpdate(targetId, {
    $pull: { following: req.user._id, followers: req.user._id },
  });

  res.json({ success: true, isBlocked: true, message: 'User blocked' });
};
