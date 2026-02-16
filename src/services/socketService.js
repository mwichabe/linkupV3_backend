const { socketAuth } = require('../middleware/auth');
const { Message, Conversation } = require('../models/Social');
const User = require('../models/User');
const logger = require('../utils/logger');

const connectedUsers = new Map(); // userId -> Set of socketIds

const initSocket = (io) => {
  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    logger.info(`Socket connected: ${socket.user.username} (${socket.id})`);

    // Track connection
    if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
    connectedUsers.get(userId).add(socket.id);

    // Mark user online
    await User.findByIdAndUpdate(userId, { isOnline: true, lastActive: new Date() });
    io.emit('user_online', { userId });

    // Join user to their conversation rooms
    const conversations = await Conversation.find({ participants: userId }).select('_id');
    conversations.forEach(c => socket.join(c._id.toString()));
    socket.join(`user:${userId}`); // Personal room for notifications

    // ─── Typing indicators ──────────────────────────────────────────────────
    socket.on('typing_start', ({ conversationId }) => {
      socket.to(conversationId).emit('typing', {
        userId,
        username: socket.user.username,
        conversationId,
      });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(conversationId).emit('stopped_typing', { userId, conversationId });
    });

    // ─── Message read receipt ───────────────────────────────────────────────
    socket.on('message_read', async ({ messageId, conversationId }) => {
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { readBy: userId },
      });
      socket.to(conversationId).emit('message_seen', { messageId, userId });
    });

    // ─── Join conversation room ──────────────────────────────────────────────
    socket.on('join_conversation', (conversationId) => {
      socket.join(conversationId);
    });

    // ─── Leave conversation room ─────────────────────────────────────────────
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
    });

    // ─── Story view ──────────────────────────────────────────────────────────
    socket.on('story_viewed', ({ storyId, authorId }) => {
      io.to(`user:${authorId}`).emit('story_view', { storyId, viewerId: userId });
    });

    // ─── Live streams ────────────────────────────────────────────────────────
    socket.on('start_live', ({ streamId }) => {
      socket.broadcast.emit('live_started', {
        streamId,
        user: { _id: userId, username: socket.user.username, avatar: socket.user.avatar },
      });
    });

    socket.on('end_live', ({ streamId }) => {
      socket.broadcast.emit('live_ended', { streamId, userId });
    });

    // ─── Disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const userSockets = connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(userId);
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastActive: new Date(),
          });
          io.emit('user_offline', { userId });
        }
      }
      logger.info(`Socket disconnected: ${socket.user.username}`);
    });
  });

  return io;
};

// Helper: emit notification to a specific user
const emitToUser = (io, userId, event, data) => {
  io.to(`user:${userId.toString()}`).emit(event, data);
};

module.exports = { initSocket, emitToUser, connectedUsers };
