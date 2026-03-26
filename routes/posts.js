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
