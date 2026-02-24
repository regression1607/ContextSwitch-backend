const express = require('express');
const OpenAI = require('openai');
const auth = require('../middleware/auth');
const Context = require('../models/Context');
const User = require('../models/User');

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Estimate tokens (rough approximation: 1 token ≈ 4 characters)
const estimateTokens = (text) => Math.ceil(text.length / 4);

// Compress context
router.post('/', auth, async (req, res) => {
  try {
    const { messages, projectName } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Messages array is required' });
    }

    // Format messages for compression
    const conversationText = messages.map((msg, i) => 
      `[${msg.role.toUpperCase()}]: ${msg.content}`
    ).join('\n\n');

    const originalLength = conversationText.length;

    // Use GPT to compress
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a context compression assistant. Your task is to compress conversation history into a compact, AI-readable format that preserves all essential information needed to continue the conversation.

Output a structured summary with:
1. PROJECT_CONTEXT: Brief description of what's being worked on
2. KEY_DECISIONS: Important decisions made during the conversation
3. CURRENT_STATE: Where things currently stand
4. CODE_ARTIFACTS: Any important code snippets or file paths mentioned
5. PENDING_TASKS: What still needs to be done
6. CRITICAL_DETAILS: Any specific values, names, or technical details that must be preserved

Be concise but complete. The output should allow another AI to seamlessly continue this conversation.`
        },
        {
          role: 'user',
          content: `Compress this conversation from project "${projectName || 'Unknown'}":\n\n${conversationText}`
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });

    const compressedContext = completion.choices[0].message.content;
    const compressedLength = compressedContext.length;
    const compressionRatio = Math.round((1 - compressedLength / originalLength) * 100);

    // Calculate token estimates
    const originalTokens = estimateTokens(conversationText);
    const compressedTokens = estimateTokens(compressedContext);
    const tokensSaved = originalTokens - compressedTokens;

    // Save compression record to database
    const context = await Context.create({
      user: req.user._id,
      projectName: projectName || 'Untitled',
      platform: req.body.platform || 'other',
      original: {
        messageCount: messages.length,
        characterCount: originalLength,
        tokenEstimate: originalTokens
      },
      compressed: {
        characterCount: compressedLength,
        tokenEstimate: compressedTokens,
        compressionRatio: Math.max(0, compressionRatio)
      },
      compressedContext: compressedContext,
      status: 'compressed'
    });

    // Update user usage stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: {
        'usage.totalCompressions': 1,
        'usage.monthlyCompressions': 1,
        'usage.totalTokensSaved': tokensSaved,
        'usage.totalCharactersCompressed': originalLength
      },
      $set: {
        'usage.lastCompressionAt': new Date()
      }
    });

    res.json({
      success: true,
      data: {
        compressedContext,
        contextId: context._id,
        stats: {
          originalLength,
          compressedLength,
          compressionRatio: Math.max(0, compressionRatio),
          messageCount: messages.length,
          tokensSaved
        }
      }
    });
  } catch (error) {
    console.error('Compression error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save context (without compression)
router.post('/save', auth, async (req, res) => {
  try {
    const { projectName, platform, messageCount, characterCount } = req.body;

    const context = await Context.create({
      user: req.user._id,
      projectName: projectName || 'Untitled',
      platform: platform || 'other',
      original: {
        messageCount: messageCount || 0,
        characterCount: characterCount || 0,
        tokenEstimate: estimateTokens(characterCount ? String(characterCount) : '')
      },
      status: 'saved'
    });

    // Update user usage stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: {
        'usage.totalContextsSaved': 1
      }
    });

    res.json({
      success: true,
      data: {
        contextId: context._id
      }
    });
  } catch (error) {
    console.error('Save context error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
