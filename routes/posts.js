const express = require('express');
const auth = require('../middleware/auth');
const Post = require('../models/Post');

const router = express.Router();

// Optional auth middleware - sets req.user if token present, but doesn't block
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const jwt = require('jsonwebtoken');
      const User = require('../models/User');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (user) req.user = user;
    }
  } catch (e) {
    // Silently continue without auth
  }
  next();
};

// GET /api/posts - Get all published posts (public, with optional auth for like status)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;
    const sort = req.query.sort || 'newest'; // newest, popular, oldest
    const platform = req.query.platform;
    const category = req.query.category;
    const tag = req.query.tag;
    const search = req.query.search;

    // Build filter
    const filter = { status: 'published' };
    if (platform && platform !== 'all') filter.platform = platform;
    if (category && category !== 'all') filter.category = category;
    if (tag) filter.tags = tag;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort
    let sortObj = { createdAt: -1 };
    if (sort === 'popular') sortObj = { likesCount: -1, createdAt: -1 };
    if (sort === 'oldest') sortObj = { createdAt: 1 };

    const posts = await Post.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .populate('author', 'name email')
      .select('-images.data');

    const total = await Post.countDocuments(filter);

    // Add isLiked flag if user is authenticated
    const postsWithLikeStatus = posts.map(post => {
      const postObj = post.toObject();
      postObj.isLiked = req.user ? post.isLikedBy(req.user._id) : false;
      postObj.imageCount = post.images?.length || 0;
      delete postObj.likes;
      return postObj;
    });

    res.json({
      success: true,
      data: {
        posts: postsWithLikeStatus,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Sitemap handler (shared between /sitemap and /sitemap.xml)
async function sitemapHandler(req, res) {
  try {
    const posts = await Post.find({ status: 'published' })
      .sort({ createdAt: -1 })
      .select('_id createdAt updatedAt title');

    const siteUrl = 'https://www.context-switch.dev';
    const urls = [`  <url>\n    <loc>${siteUrl}/posts</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`];

    for (const post of posts) {
      const lastmod = (post.updatedAt || post.createdAt).toISOString().split('T')[0];
      urls.push(`  <url>\n    <loc>${siteUrl}/posts/${post._id}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
    }

    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>';

    res.status(200);
    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.send(xml);
  } catch (error) {
    console.error('Sitemap error:', error);
    const fallback = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://www.context-switch.dev/posts</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>';
    res.status(200);
    res.header('Content-Type', 'application/xml; charset=utf-8');
    return res.send(fallback);
  }
}

// GET /api/posts/sitemap - Dynamic sitemap (public)
router.get('/sitemap', sitemapHandler);
// GET /api/posts/sitemap.xml - Alias with .xml extension
router.get('/sitemap.xml', sitemapHandler);

// GET /api/posts/rss - RSS feed for posts (public)
async function rssHandler(req, res) {
  try {
    const posts = await Post.find({ status: 'published' })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('author', 'name')
      .select('_id title content tags platform category createdAt author');

    const siteUrl = 'https://www.context-switch.dev';
    const escape = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const items = posts.map(post => {
      const desc = escape(post.content.substring(0, 300).replace(/\n/g, ' '));
      const title = escape(post.title);
      const author = escape(post.author?.name || 'Anonymous');
      const cats = (post.tags || []).map(t => `<category>${escape(t)}</category>`).join('');
      return `    <item>
      <title>${title}</title>
      <link>${siteUrl}/posts/${post._id}</link>
      <guid isPermaLink="true">${siteUrl}/posts/${post._id}</guid>
      <description>${desc}</description>
      <author>${author}</author>
      <pubDate>${new Date(post.createdAt).toUTCString()}</pubDate>
      ${cats}
    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ContextSwitch AI Hub</title>
    <link>${siteUrl}/posts</link>
    <description>AI prompts, news, tutorials, and discussions from the ContextSwitch community</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/api/posts/rss.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${siteUrl}/favicon.svg</url>
      <title>ContextSwitch AI Hub</title>
      <link>${siteUrl}/posts</link>
    </image>
${items}
  </channel>
</rss>`;

    res.status(200);
    res.header('Content-Type', 'application/rss+xml; charset=utf-8');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Cache-Control', 'public, max-age=1800, s-maxage=3600');
    return res.send(xml);
  } catch (error) {
    console.error('RSS error:', error);
    res.status(500).header('Content-Type', 'application/rss+xml').send('<?xml version="1.0"?><rss version="2.0"><channel><title>Error</title></channel></rss>');
  }
}

router.get('/rss', rssHandler);
router.get('/rss.xml', rssHandler);

// GET /api/posts/og/:id - OG meta data for a post (used by crawlers/social sharing)
router.get('/og/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'name');

    if (!post || post.status !== 'published') {
      return res.redirect(301, 'https://www.context-switch.dev/posts');
    }

    const siteUrl = 'https://www.context-switch.dev';
    const postUrl = `${siteUrl}/posts/${post._id}`;
    const escape = (str) => str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const title = escape(post.title);
    const description = escape(post.content.substring(0, 200).replace(/\n/g, ' '));
    const authorName = escape(post.author?.name || 'Anonymous');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | ContextSwitch AI Hub</title>
<meta name="description" content="${description}">
<meta name="author" content="${authorName}">
<link rel="canonical" href="${postUrl}">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${postUrl}">
<meta property="og:site_name" content="ContextSwitch AI Hub">
<meta property="og:image" content="${siteUrl}/og-image.png">
<meta property="article:published_time" content="${post.createdAt.toISOString()}">
<meta property="article:author" content="${authorName}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${siteUrl}/og-image.png">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"${title}","description":"${description}","url":"${postUrl}","datePublished":"${post.createdAt.toISOString()}","author":{"@type":"Person","name":"${authorName}"},"publisher":{"@type":"Organization","name":"ContextSwitch","url":"${siteUrl}"}}
</script>
<meta http-equiv="refresh" content="0; url=${postUrl}">
</head>
<body>
<h1>${title}</h1>
<p>By ${authorName}</p>
<p>${description}</p>
<p><a href="${postUrl}">Read full post on ContextSwitch AI Hub</a></p>
</body>
</html>`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('OG meta error:', error);
    res.redirect(301, 'https://www.context-switch.dev/posts');
  }
});

// GET /api/posts/recent - Get recent posts for homepage (public)
router.get('/recent', optionalAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    const posts = await Post.find({ status: 'published' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'name')
      .select('title content prompt tags platform likesCount views createdAt author images');

    const postsData = posts.map(post => {
      const postObj = post.toObject();
      postObj.isLiked = req.user ? post.isLikedBy(req.user._id) : false;
      postObj.imageCount = post.images?.length || 0;
      // Include first image thumbnail if exists
      if (post.images && post.images.length > 0) {
        postObj.thumbnail = {
          data: post.images[0].data,
          contentType: post.images[0].contentType
        };
      }
      delete postObj.images;
      delete postObj.likes;
      return postObj;
    });

    res.json({
      success: true,
      data: { posts: postsData }
    });
  } catch (error) {
    console.error('Get recent posts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/posts/user/my-posts - Get current user's posts (auth required)
router.get('/user/my-posts', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const posts = await Post.find({ author: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name email')
      .select('-images.data');

    const total = await Post.countDocuments({ author: req.user._id });

    const postsData = posts.map(post => {
      const postObj = post.toObject();
      postObj.isLiked = post.isLikedBy(req.user._id);
      postObj.imageCount = post.images?.length || 0;
      delete postObj.likes;
      return postObj;
    });

    res.json({
      success: true,
      data: {
        posts: postsData,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get my posts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/posts/:id - Get single post (public)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'name email');

    if (!post || post.status !== 'published') {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Increment views
    post.views += 1;
    await post.save();

    const postObj = post.toObject();
    postObj.isLiked = req.user ? post.isLikedBy(req.user._id) : false;
    delete postObj.likes;

    res.json({
      success: true,
      data: { post: postObj }
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/posts - Create a new post (auth required)
router.post('/', auth, async (req, res) => {
  try {
    const { title, content, prompt, tags, platform, images, category, template } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }

    // Validate images (max 3, max 2MB each as base64)
    let processedImages = [];
    if (images && Array.isArray(images)) {
      if (images.length > 3) {
        return res.status(400).json({ success: false, message: 'Maximum 3 images allowed' });
      }
      for (const img of images) {
        if (!img.data || !img.contentType) continue;
        // Check base64 size (~1.37x the original, so 2MB original ≈ 2.7MB base64)
        if (img.data.length > 3 * 1024 * 1024) {
          return res.status(400).json({ success: false, message: 'Each image must be under 2MB' });
        }
        processedImages.push({
          data: img.data,
          contentType: img.contentType,
          filename: img.filename || 'image'
        });
      }
    }

    // Process tags
    let processedTags = [];
    if (tags) {
      if (typeof tags === 'string') {
        processedTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
      } else if (Array.isArray(tags)) {
        processedTags = tags.map(t => t.trim().toLowerCase()).filter(t => t);
      }
    }

    const post = await Post.create({
      author: req.user._id,
      title: title.trim(),
      content: content.trim(),
      prompt: prompt?.trim() || null,
      category: category || 'prompt',
      template: template || 'minimal',
      tags: processedTags.slice(0, 10),
      platform: platform || 'general',
      images: processedImages
    });

    await post.populate('author', 'name email');

    const postObj = post.toObject();
    postObj.imageCount = processedImages.length;
    postObj.isLiked = false;
    delete postObj.likes;

    res.status(201).json({
      success: true,
      data: { post: postObj }
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/posts/:id/like - Toggle like on a post (auth required)
router.put('/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const userId = req.user._id;
    const alreadyLiked = post.likes.some(id => id.toString() === userId.toString());

    if (alreadyLiked) {
      post.likes = post.likes.filter(id => id.toString() !== userId.toString());
      post.likesCount = Math.max(0, post.likesCount - 1);
    } else {
      post.likes.push(userId);
      post.likesCount += 1;
    }

    await post.save();

    res.json({
      success: true,
      data: {
        isLiked: !alreadyLiked,
        likesCount: post.likesCount
      }
    });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/posts/:id - Delete own post (auth required)
router.delete('/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
    }

    await Post.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
