/**
 * Seed Script: Creates 5 users and 10 posts each (50 posts total)
 * Usage: node scripts/seed-posts.js
 * Requires: MONGODB_URI and JWT_SECRET in .env
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');

const USERS = [
  { name: 'Arjun Mehta', email: 'arjun.ai@contextswitch.dev', password: 'SecurePass123!' },
  { name: 'Priya Sharma', email: 'priya.tech@contextswitch.dev', password: 'SecurePass123!' },
  { name: 'Rahul Verma', email: 'rahul.dev@contextswitch.dev', password: 'SecurePass123!' },
  { name: 'Sneha Patel', email: 'sneha.writer@contextswitch.dev', password: 'SecurePass123!' },
  { name: 'Vikram Singh', email: 'vikram.ml@contextswitch.dev', password: 'SecurePass123!' },
];

// Load posts data
const ALL_POSTS = require('./seed-data.json');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (let i = 0; i < USERS.length; i++) {
      const u = USERS[i];
      let user = await User.findOne({ email: u.email });
      if (!user) {
        user = await User.create(u);
        console.log(`Created user: ${u.name}`);
      } else {
        console.log(`User exists: ${u.name}`);
      }

      const userPosts = ALL_POSTS[i] || [];
      for (let j = 0; j < userPosts.length; j++) {
        const p = userPosts[j];
        const exists = await Post.findOne({ title: p.title, author: user._id });
        if (exists) { console.log(`  Skip: ${p.title}`); continue; }

        await Post.create({
          author: user._id,
          title: p.title,
          content: p.content,
          prompt: p.prompt || null,
          tags: p.tags || [],
          platform: p.platform || 'general',
          category: p.category || 'prompt',
          template: p.template || 'minimal',
          status: 'published',
        });
        console.log(`  Created: ${p.title}`);
      }
    }

    console.log('\nDone! Seeded all posts.');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
