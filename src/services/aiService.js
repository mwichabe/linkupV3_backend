const OpenAI = require('openai');
const logger = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class AIService {

  // ─── Generate smart captions for posts ──────────────────────────────────
  static async generateCaption(imageUrl, userBio = '', hashtags = []) {
    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'low' },
            },
            {
              type: 'text',
              text: `Generate 3 creative, engaging social media captions for this image.
              ${userBio ? `User bio context: "${userBio}"` : ''}
              ${hashtags.length ? `Suggested hashtags: ${hashtags.join(', ')}` : ''}
              Format as JSON array: [{"caption": "...", "hashtags": [...], "mood": "..."}]
              Captions should be authentic, platform-appropriate (150-200 chars ideal), and include 5-8 relevant hashtags.`,
            },
          ],
        }],
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const content = JSON.parse(response.choices[0].message.content);
      return content.captions || content;
    } catch (err) {
      logger.error(`AI caption generation failed: ${err.message}`);
      return null;
    }
  }

  // ─── Auto-tag objects in images ──────────────────────────────────────────
  static async detectImageTags(imageUrl) {
    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            {
              type: 'text',
              text: 'Identify the main objects, scenes, activities, emotions, and themes in this image. Return as JSON: {"tags": [...], "scene": "...", "mood": "...", "isNSFW": false}. Keep tags concise, lowercase, no spaces.',
            },
          ],
        }],
        max_tokens: 200,
        response_format: { type: 'json_object' },
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (err) {
      logger.error(`AI tag detection failed: ${err.message}`);
      return { tags: [], scene: '', mood: 'neutral', isNSFW: false };
    }
  }

  // ─── Content moderation ──────────────────────────────────────────────────
  static async moderateContent(text) {
    try {
      const response = await openai.moderations.create({ input: text });
      const result = response.results[0];
      return {
        isFlagged: result.flagged,
        categories: result.categories,
        score: Math.max(...Object.values(result.category_scores)),
      };
    } catch (err) {
      logger.error(`Content moderation failed: ${err.message}`);
      return { isFlagged: false, categories: {}, score: 0 };
    }
  }

  // ─── Comment sentiment analysis ──────────────────────────────────────────
  static async analyzeSentiment(text) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Analyze the sentiment of this social media comment and return JSON: {"sentiment": "positive|neutral|negative|mixed", "score": 0.0-1.0, "isToxic": false, "emotions": [...]}
Comment: "${text}"`,
        }],
        max_tokens: 100,
        response_format: { type: 'json_object' },
      });
      return JSON.parse(response.choices[0].message.content);
    } catch (err) {
      return { sentiment: 'neutral', score: 0.5, isToxic: false, emotions: [] };
    }
  }

  // ─── Smart hashtag suggestions ────────────────────────────────────────────
  static async suggestHashtags(caption, imageUrl = null) {
    try {
      const messages = [{
        role: 'user',
        content: imageUrl
          ? [
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
              { type: 'text', text: `Caption: "${caption}"\nSuggest 20 relevant hashtags for this post. Mix popular and niche tags. Return JSON: {"hashtags": [...], "trending": [...], "niche": [...]}` },
            ]
          : `Caption: "${caption}"\nSuggest 20 relevant hashtags. Return JSON: {"hashtags": [...], "trending": [...], "niche": [...]}`,
      }];

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (err) {
      return { hashtags: [], trending: [], niche: [] };
    }
  }

  // ─── Smart reply suggestions for DMs ──────────────────────────────────────
  static async suggestReplies(conversationContext, lastMessage) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Given this conversation context: "${conversationContext.slice(-200)}"
Last message: "${lastMessage}"
Suggest 3 short, natural reply options. Return JSON: {"suggestions": ["reply1", "reply2", "reply3"]}
Keep replies casual, friendly, and under 50 characters each.`,
        }],
        max_tokens: 150,
        response_format: { type: 'json_object' },
      });
      return JSON.parse(response.choices[0].message.content).suggestions;
    } catch (err) {
      return [];
    }
  }

  // ─── User interest profiling for feed personalization ─────────────────────
  static async buildInterestProfile(recentInteractions) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Based on these user interactions: ${JSON.stringify(recentInteractions.slice(0, 20))}
Build a content interest profile. Return JSON: {"interests": [...], "contentStyle": "...", "preferredTopics": [...], "engagementPattern": "..."}`,
        }],
        max_tokens: 200,
        response_format: { type: 'json_object' },
      });
      return JSON.parse(response.choices[0].message.content);
    } catch (err) {
      return { interests: [], contentStyle: 'general', preferredTopics: [] };
    }
  }

  // ─── Generate alt text for accessibility ─────────────────────────────────
  static async generateAltText(imageUrl) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            { type: 'text', text: 'Write a concise alt text description for this image for accessibility (max 125 chars). Just the description, no prefix.' },
          ],
        }],
        max_tokens: 80,
      });
      return response.choices[0].message.content.trim();
    } catch (err) {
      return '';
    }
  }

  // ─── Detect spam / bot behavior ──────────────────────────────────────────
  static async detectSpam(commentText, userHistory = []) {
    try {
      const modResult = await this.moderateContent(commentText);
      if (modResult.isFlagged) return { isSpam: true, reason: 'flagged_content', confidence: 0.9 };

      // Simple heuristics
      const spamPatterns = [
        /follow.{0,10}back/i,
        /check.{0,5}my.{0,5}profile/i,
        /earn.{0,10}\$/i,
        /click.{0,5}link/i,
      ];
      const isSpamPattern = spamPatterns.some(p => p.test(commentText));
      return {
        isSpam: isSpamPattern,
        reason: isSpamPattern ? 'spam_pattern' : 'clean',
        confidence: isSpamPattern ? 0.85 : 0.1,
      };
    } catch (err) {
      return { isSpam: false, reason: 'error', confidence: 0 };
    }
  }
}

module.exports = AIService;
