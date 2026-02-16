const express = require('express');
const router = express.Router();

const authCtrl = require('../controllers/authController');
const userCtrl = require('../controllers/userController');
const postCtrl = require('../controllers/postController');
const msgCtrl = require('../controllers/messageController');
const notifCtrl = require('../controllers/notificationController');
const searchCtrl = require('../controllers/searchController');

const { protect, optionalAuth } = require('../middleware/auth');
const { uploadAvatar, uploadPostMedia, uploadSingleMedia, uploadMessageMedia } = require('../middleware/upload');

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.post('/auth/google', authCtrl.googleAuth);
router.post('/auth/refresh', authCtrl.refreshToken);
router.post('/auth/logout', protect, authCtrl.logout);
router.post('/auth/send-otp', authCtrl.sendOTP);
router.post('/auth/verify-otp', authCtrl.verifyOTP);
router.post('/auth/forgot-password', authCtrl.forgotPassword);
router.post('/auth/reset-password-otp', authCtrl.resetPasswordWithOTP);
router.post('/auth/reset-password/:token', authCtrl.resetPassword);
router.get('/auth/me', protect, authCtrl.getMe);
router.put('/auth/profile', protect, uploadAvatar, authCtrl.updateProfile);
router.put('/auth/change-password', protect, authCtrl.changePassword);
router.put('/auth/privacy', protect, authCtrl.updatePrivacy);

// ─── Posts ────────────────────────────────────────────────────────────────────
router.get('/posts/feed', protect, postCtrl.getFeed);
router.get('/posts/reels', optionalAuth, postCtrl.getReels);
router.get('/posts/stories', protect, postCtrl.getStories);
router.get('/posts/explore', optionalAuth, postCtrl.explore);
router.get('/posts/trending', optionalAuth, postCtrl.getTrending);
router.post('/posts', protect, uploadPostMedia, postCtrl.createPost);
router.get('/posts/:id', optionalAuth, postCtrl.getPost);
router.delete('/posts/:id', protect, postCtrl.deletePost);
router.post('/posts/:id/like', protect, postCtrl.toggleLike);
router.post('/posts/:id/save', protect, postCtrl.toggleSave);
router.get('/posts/:id/comments', optionalAuth, postCtrl.getComments);
router.post('/posts/:id/comments', protect, postCtrl.addComment);
router.post('/posts/:id/ai-caption', protect, postCtrl.getAICaption);
router.post('/posts/ai-hashtags', protect, postCtrl.getAIHashtags);

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/users/suggestions', protect, userCtrl.getSuggestions);
router.get('/users/search', optionalAuth, userCtrl.searchUsers);
router.get('/users/:username', optionalAuth, userCtrl.getProfile);
router.get('/users/:username/posts', optionalAuth, userCtrl.getUserPosts);
router.get('/users/:username/followers', optionalAuth, userCtrl.getFollowers);
router.get('/users/:username/following', optionalAuth, userCtrl.getFollowing);
router.post('/users/:id/follow', protect, userCtrl.toggleFollow);
router.post('/users/:id/block', protect, userCtrl.blockUser);
router.post('/users/follow-requests/:id/accept', protect, userCtrl.acceptFollowRequest);

// ─── Messages ─────────────────────────────────────────────────────────────────
router.get('/conversations', protect, msgCtrl.getConversations);
router.post('/conversations', protect, msgCtrl.createOrGetConversation);
router.get('/conversations/:id/messages', protect, msgCtrl.getMessages);
router.post('/conversations/:id/messages', protect, uploadMessageMedia, msgCtrl.sendMessage);
router.get('/conversations/:id/ai-suggestions', protect, msgCtrl.getAISuggestions);
router.delete('/messages/:id', protect, msgCtrl.deleteMessage);
router.post('/messages/:id/react', protect, msgCtrl.reactToMessage);

// ─── Notifications ────────────────────────────────────────────────────────────
router.get('/notifications', protect, notifCtrl.getNotifications);
router.get('/notifications/count', protect, notifCtrl.getUnreadCount);
router.put('/notifications/mark-read', protect, notifCtrl.markAllRead);
router.put('/notifications/:id/read', protect, notifCtrl.markOneRead);
router.post('/notifications/push-token', protect, notifCtrl.registerPushToken);

// ─── Search ───────────────────────────────────────────────────────────────────
router.get('/search', optionalAuth, searchCtrl.globalSearch);
router.get('/search/hashtag/:tag', optionalAuth, searchCtrl.getHashtagPosts);
router.get('/search/trending', optionalAuth, searchCtrl.getTrendingHashtags);

// ─── Health ───────────────────────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({
  success: true,
  status: 'UP',
  service: 'LinkUp API',
  timestamp: new Date().toISOString(),
  version: '1.0.0',
}));

module.exports = router;
