const { Notification } = require('../models/Social');
const User = require('../models/User');

// ─── GET /notifications ───────────────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const notifications = await Notification.find({ recipient: req.user._id })
    .populate('actor', 'username displayName avatar isVerified')
    .populate('post', 'media type')
    .populate('comment', 'text')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });

  res.json({ success: true, notifications, unreadCount });
};

// ─── PUT /notifications/mark-read ─────────────────────────────────────────────
exports.markAllRead = async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  res.json({ success: true, message: 'All notifications marked as read' });
};

// ─── PUT /notifications/:id/read ──────────────────────────────────────────────
exports.markOneRead = async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { isRead: true, readAt: new Date() }
  );
  res.json({ success: true });
};

// ─── GET /notifications/count ─────────────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  const count = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });
  res.json({ success: true, count });
};

// ─── POST /notifications/push-token ───────────────────────────────────────────
exports.registerPushToken = async (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'Token required' });

  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: {
      fcmTokens: { token, platform: platform || 'unknown', addedAt: new Date() },
    },
  });

  res.json({ success: true, message: 'Push token registered' });
};
