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

// Plan limits configuration
const PLAN_LIMITS = {
  free: { maxCompressionsPerMonth: 0, canCompress: false },
  pro: { maxCompressionsPerMonth: 50, canCompress: true },
  enterprise: { maxCompressionsPerMonth: 200, canCompress: true }
};

// Compress context
router.post('/', auth, async (req, res) => {
  try {
    const { messages, projectName } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Messages array is required' });
    }

    // Get fresh user data with subscription info
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const plan = user.subscription?.plan || 'free';
    const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // Check if plan allows compression
    if (!planLimits.canCompress) {
      return res.status(403).json({ 
        success: false, 
        message: 'AI compression is a Pro feature. Please upgrade to use compression.',
        code: 'UPGRADE_REQUIRED'
      });
    }

    // Check monthly limit
    const monthlyUsage = user.usage?.monthlyCompressions || 0;
    if (monthlyUsage >= planLimits.maxCompressionsPerMonth) {
      return res.status(403).json({ 
        success: false, 
        message: `Monthly compression limit reached (${planLimits.maxCompressionsPerMonth}). Upgrade for more compressions.`,
        code: 'LIMIT_REACHED',
        usage: {
          used: monthlyUsage,
          limit: planLimits.maxCompressionsPerMonth
        }
      });
    }

    // Format messages for compression
    const conversationText = messages.map((msg, i) => 
      `[${msg.role.toUpperCase()}]: ${msg.content}`
    ).join('\n\n');

    const originalLength = conversationText.length;

    // Use GPT to compress into ultra-compact AI-readable format
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an AI context compression engine. Compress conversation into an ULTRA-COMPACT format optimized for AI parsing, NOT human readability.

OUTPUT FORMAT RULES:
- NO spaces between sections (use | as delimiter)
- NO newlines (single continuous string)
- Use abbreviations: U=user,A=assistant,P=project,S=state,T=task,D=decision,C=code,F=file,V=value,E=error,X=fix
- Use symbols: >=output,<=input,@=path,#=id,*=important,~=approximate,^=version
- Compress variable names to initials
- Remove all articles (a,an,the), filler words
- Use shorthand: fn=function,var=variable,cfg=config,db=database,api=API,auth=authentication,req=request,res=response,err=error,msg=message,btn=button,ctx=context

STRUCTURE: CTX[project-name]|S[current-state]|D[key-decisions;separated;by;semicolon]|T[pending-tasks]|C[code-artifacts]|V[critical-values-key:val]|H[conversation-history-ultra-compressed]

EXAMPLE OUTPUT:
CTX[ecommerce-app]|S[auth-flow-done;payment-pending]|D[use-stripe;jwt-auth;postgres-db]|T[implement-checkout;add-webhooks]|C[@src/api/payment.js:createIntent()]|V[api_ver:v2;env:prod]|H[U:setup-payment>A:use-stripe-sdk>U:show-code>A:*implemented-createPaymentIntent]

The output must be a SINGLE LINE with ZERO unnecessary spaces. AI will parse this to continue the conversation seamlessly.`
        },
        {
          role: 'user',
          content: `Compress this conversation from project "${projectName || 'Unknown'}" into ultra-compact AI-readable format:\n\n${conversationText}`
        }
      ],
      max_tokens: 1500,
      temperature: 0.2
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
