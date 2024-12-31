const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Express configuration
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());

// Create required directories
['./public/uploads', './data'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize posts.json if it doesn't exist
if (!fs.existsSync('./data/posts.json')) {
  fs.writeFileSync('./data/posts.json', '[]');
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: './public/uploads',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Load posts
let posts = JSON.parse(fs.readFileSync('./data/posts.json', 'utf8'));

function savePosts() {
  fs.writeFileSync('./data/posts.json', JSON.stringify(posts, null, 2));
}

// Routes
app.get('/', (req, res) => {
    res.render('index', { 
      posts: posts.slice(-50),
      username: '' // เพิ่มตรงนี้
    });
  });

app.post('/post', upload.single('audio'), (req, res) => {
  const post = {
    id: uuidv4(),
    username: req.body.username,
    content: req.body.content,
    audio: req.file ? `/uploads/${req.file.filename}` : null,
    timestamp: new Date().toISOString(),
    likes: [],
    comments: []
  };

  posts.push(post);
  savePosts();
  io.emit('new-post', post);
  res.json(post);
});

app.post('/comment/:postId', upload.single('audio'), (req, res) => {
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const comment = {
    id: uuidv4(),
    username: req.body.username,
    content: req.body.content,
    audio: req.file ? `/uploads/${req.file.filename}` : null,
    timestamp: new Date().toISOString()
  };

  post.comments.push(comment);
  savePosts();
  io.emit('new-comment', { postId: post.id, comment });
  res.json(comment);
});

app.post('/like/:postId', (req, res) => {
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const username = req.body.username;
  const likeIndex = post.likes.indexOf(username);
  
  if (likeIndex === -1) {
    post.likes.push(username);
  } else {
    post.likes.splice(likeIndex, 1);
  }

  savePosts();
  io.emit('likes-updated', { postId: post.id, likes: post.likes });
  res.json({ likes: post.likes });
});

app.get('/post/:postId', (req, res) => {
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.status(404).send('Post not found');
  res.render('post', { post });
});

// Cleanup old files (7 days)
setInterval(() => {
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  posts = posts.filter(post => {
    if (new Date(post.timestamp).getTime() < sevenDaysAgo) {
      if (post.audio) {
        try {
          fs.unlinkSync(path.join(__dirname, 'public', post.audio));
        } catch (err) {
          console.error('Error deleting audio:', err);
        }
      }
      return false;
    }
    return true;
  });
  savePosts();
}, 24 * 60 * 60 * 1000);

// Socket.IO
io.on('connection', (socket) => {
  console.log('User connected');
  socket.on('disconnect', () => console.log('User disconnected'));
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});