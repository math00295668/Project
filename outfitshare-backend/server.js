require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Post = require('./models/Post');
const User = require('./models/User');
const auth = require('./middleware/auth');
const Notification = require('./models/Notification');

const app = express();
const SECRET = 'outfitshare_secret_2026';

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("DB connectée"))
  .catch((err) => console.log("Erreur DB:", err));

// ─── AUTH ───────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) return res.status(400).json({ message: 'Username ou email déjà utilisé' });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashed });
    await user.save();
    const token = jwt.sign({ userId: user._id, username: user.username }, SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, username: user.username, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Utilisateur introuvable' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: 'Mot de passe incorrect' });
    const token = jwt.sign({ userId: user._id, username: user.username }, SECRET, { expiresIn: '7d' });
    res.status(200).json({ token, username: user.username, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

// ─── POSTS ──────────────────────────────────────────


// edit : i implemented algorithmic thing to sort my home component by the algorithm u see below
// i cant explain how i found out how to do that but it works 
//formula : Score = (Likes + Comments×2) / (HoursAge + 2)^1.5
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.find();
    const now = Date.now();
    const sorted = posts.sort((a, b) => {
      const scoreA = (a.likes + a.comments.length * 2) / Math.pow((now - new Date(a.createdAt).getTime()) / 3600000 + 2, 1.5);
      const scoreB = (b.likes + b.comments.length * 2) / Math.pow((now - new Date(b.createdAt).getTime()) / 3600000 + 2, 1.5);
      return scoreB - scoreA;
    });
    res.status(200).json(sorted);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

//--------------- Searchbar-------------------------------
app.get('/api/posts/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(200).json([]);
    const posts = await Post.find({
      $or: [
        { author: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ]
    }).sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    res.status(200).json(post);
  } catch (err) {
    res.status(404).json({ error: err });
  }
});

app.post('/api/posts', auth, async (req, res) => {
  try {
    const post = new Post({
      author: req.user.username,
      authorId: req.user.userId,
      description: req.body.description,
      imageUrl: req.body.imageUrl,
      items: req.body.items || []
    });
    await post.save();
    res.status(201).json({ message: 'Post créé !' });
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

// ---- LIKES ----------------------------------------------
app.post('/api/posts/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    const userId = req.user.userId;
    const alreadyLiked = post.likedBy.includes(userId);
    if (alreadyLiked) {
      post.likes--;
      post.likedBy = post.likedBy.filter(id => id.toString() !== userId);
    } else {
      post.likes++;
      post.likedBy.push(userId);
      if (post.author !== req.user.username) {
        await Notification.create({
          recipient: post.author,
          sender: req.user.username,
          type: 'like',
          postId: post._id
        });
      }
    }
    await post.save();
    res.status(200).json({ likes: post.likes, liked: !alreadyLiked });
  } catch (err) {
    res.status(400).json({ error: err });
  }
});
//-- comments ----------------------------------------------------------
app.post('/api/posts/:id/comments', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    post.comments.push({ author: req.user.username, text: req.body.text });
    await post.save();
    if (post.author !== req.user.username) {
      await Notification.create({
        recipient: post.author,
        sender: req.user.username,
        type: 'comment',
        postId: post._id
      });
    }
    res.status(201).json(post.comments);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

//--Notifications ----------------------------------------------------------------
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const notifs = await Notification.find({ recipient: req.user.username }).sort({ createdAt: -1 });
    res.status(200).json(notifs);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

app.patch('/api/notifications/read', auth, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user.username }, { read: true });
    res.status(200).json({ message: 'ok' });
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

//-------- postrs----------------------------------------------------------------------
app.get('/api/users/:username/posts', async (req, res) => {
  try {
    const posts = await Post.find({ author: req.params.username }).sort({ createdAt: -1 });
    res.status(200).json(posts);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

// ---- Profile page
app.get('/api/users/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json(user);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

//-- editing profile page --------------------------
app.patch('/api/users/me', auth, async (req, res) => {
  try {
    const { bio } = req.body;
    await User.findByIdAndUpdate(req.user.userId, { bio });
    res.status(200).json({ message: 'Profile updated' });
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

//---- app logic to create follow request--------------
app.post('/api/users/:username/follow', auth, async (req, res) => {
  try {
    const target = await User.findOne({ username: req.params.username });
    const me = await User.findById(req.user.userId);
    if (!target || !me) return res.status(404).json({ message: 'User not found' });
    if (req.params.username === req.user.username) return res.status(400).json({ message: "Can't follow yourself" });

    const isFollowing = me.following.includes(req.params.username);
    if (isFollowing) {
      me.following = me.following.filter(u => u !== req.params.username);
      target.followers = target.followers.filter(u => u !== req.user.username);
    } else {
      me.following.push(req.params.username);
      target.followers.push(req.user.username);
      await Notification.create({
        recipient: req.params.username,
        sender: req.user.username,
        type: 'follow',
        postId: new mongoose.Types.ObjectId()
      });
    }
    await me.save();
    await target.save();
    res.status(200).json({ following: !isFollowing, followersCount: target.followers.length });
  } catch (err) {
    res.status(400).json({ error: err });
  }
});



app.listen(3000, () => console.log("Serveur démarré sur http://localhost:3000"));