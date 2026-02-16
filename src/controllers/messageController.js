const { Message, Conversation } = require('../models/Social');
const User = require('../models/User');
const AIService = require('../services/aiService');
const { uploadToCloudinary } = require('../config/cloudinary');
const fs = require('fs');

// ─── GET /conversations ────────────────────────────────────────────────────────
exports.getConversations = async (req, res) => {
  const conversations = await Conversation.find({
    participants: req.user._id,
    archivedBy: { $ne: req.user._id },
  })
    .populate('participants', 'username displayName avatar isOnline lastActive isVerified')
    .populate({
      path: 'lastMessage',
      select: 'text type sender createdAt readBy media',
      populate: { path: 'sender', select: 'username' },
    })
    .sort({ lastActivity: -1 })
    .lean();

  // Add unread count per conversation
  const enriched = conversations.map(conv => {
    const unread = conv.unreadCounts?.find(u => u.user?.toString() === req.user._id.toString());
    return { ...conv, myUnreadCount: unread?.count || 0 };
  });

  res.json({ success: true, conversations: enriched });
};

// ─── GET /conversations/:id/messages ─────────────────────────────────────────
exports.getMessages = async (req, res) => {
  const { page = 1, limit = 30 } = req.query;

  const conversation = await Conversation.findOne({
    _id: req.params.id,
    participants: req.user._id,
  });

  if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });

  const messages = await Message.find({
    conversation: req.params.id,
    isDeleted: false,
    deletedFor: { $ne: req.user._id },
  })
    .populate('sender', 'username avatar')
    .populate('replyTo', 'text sender type')
    .populate('sharedPost', 'media caption author')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  // Mark as read
  await Message.updateMany(
    { conversation: req.params.id, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );
  await Conversation.findByIdAndUpdate(req.params.id, {
    $set: { 'unreadCounts.$[elem].count': 0 },
  }, { arrayFilters: [{ 'elem.user': req.user._id }] });

  res.json({ success: true, messages: messages.reverse() });
};

// ─── POST /conversations ───────────────────────────────────────────────────────
exports.createOrGetConversation = async (req, res) => {
  const { participantId, isGroup, groupName, participantIds } = req.body;

  if (isGroup) {
    const allParticipants = [req.user._id, ...participantIds];
    const conversation = await Conversation.create({
      participants: allParticipants,
      isGroup: true,
      groupName,
      admin: req.user._id,
      unreadCounts: allParticipants.map(u => ({ user: u, count: 0 })),
    });
    await conversation.populate('participants', 'username avatar isOnline');
    return res.status(201).json({ success: true, conversation });
  }

  // DM: find existing
  let conversation = await Conversation.findOne({
    participants: { $all: [req.user._id, participantId], $size: 2 },
    isGroup: false,
  }).populate('participants', 'username avatar isOnline isVerified');

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [req.user._id, participantId],
      unreadCounts: [
        { user: req.user._id, count: 0 },
        { user: participantId, count: 0 },
      ],
    });
    await conversation.populate('participants', 'username avatar isOnline isVerified');
  }

  res.json({ success: true, conversation });
};

// ─── POST /conversations/:id/messages ────────────────────────────────────────
exports.sendMessage = async (req, res) => {
  const { text, type = 'text', replyToId, sharedPostId } = req.body;

  const conversation = await Conversation.findOne({
    _id: req.params.id,
    participants: req.user._id,
  });

  if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });

  const messageData = {
    conversation: req.params.id,
    sender: req.user._id,
    type,
    text,
    replyTo: replyToId || null,
    sharedPost: sharedPostId || null,
  };

  if (req.file) {
    const isVideo = req.file.mimetype.startsWith('video/');
    const result = isVideo
      ? await uploadToCloudinary(req.file.path, 'messages/videos')
      : await uploadToCloudinary(req.file.path, 'messages/images');
    messageData.media = { url: result.secure_url, type: isVideo ? 'video' : 'image' };
    messageData.type = isVideo ? 'video' : 'image';
    fs.unlinkSync(req.file.path);
  }

  const message = await Message.create(messageData);
  await message.populate('sender', 'username avatar');
  if (replyToId) await message.populate('replyTo', 'text sender type');

  // Update conversation
  await Conversation.findByIdAndUpdate(req.params.id, {
    lastMessage: message._id,
    lastActivity: new Date(),
    $inc: { 'unreadCounts.$[elem].count': 1 },
  }, { arrayFilters: [{ 'elem.user': { $ne: req.user._id } }] });

  // Emit via Socket.io (done in socket handler)
  req.app.get('io')?.to(req.params.id).emit('new_message', message);

  res.status(201).json({ success: true, message });
};

// ─── GET /conversations/:id/ai-suggestions ───────────────────────────────────
exports.getAISuggestions = async (req, res) => {
  const messages = await Message.find({
    conversation: req.params.id,
    isDeleted: false,
  })
    .populate('sender', 'username')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  if (messages.length === 0) return res.json({ success: true, suggestions: [] });

  const context = messages
    .reverse()
    .map(m => `${m.sender.username}: ${m.text}`)
    .join('\n');

  const lastMessage = messages[messages.length - 1].text;
  const suggestions = await AIService.suggestReplies(context, lastMessage);

  res.json({ success: true, suggestions });
};

// ─── DELETE /messages/:id ─────────────────────────────────────────────────────
exports.deleteMessage = async (req, res) => {
  const { deleteFor } = req.query; // 'me' or 'everyone'

  const message = await Message.findOne({ _id: req.params.id, sender: req.user._id });
  if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

  if (deleteFor === 'everyone') {
    message.isDeleted = true;
    message.text = 'This message was deleted';
  } else {
    message.deletedFor.push(req.user._id);
  }

  await message.save();
  res.json({ success: true, message: 'Message deleted' });
};

// ─── POST /messages/:id/react ─────────────────────────────────────────────────
exports.reactToMessage = async (req, res) => {
  const { emoji } = req.body;
  const message = await Message.findById(req.params.id);
  if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

  const existingReaction = message.reactions.find(
    r => r.user.toString() === req.user._id.toString()
  );

  if (existingReaction) {
    if (existingReaction.emoji === emoji) {
      message.reactions.pull({ user: req.user._id });
    } else {
      existingReaction.emoji = emoji;
    }
  } else {
    message.reactions.push({ user: req.user._id, emoji });
  }

  await message.save();
  res.json({ success: true, reactions: message.reactions });
};
