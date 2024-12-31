// Constants and Global Variables
const socket = io();
const RECORD_LIMIT = 30;
const TEXT_LIMIT = 500;

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let timerInterval;
let currentUsername = localStorage.getItem('username') || '';

// DOM Elements
const elements = {
  welcomeScreen: () => document.getElementById('welcomeScreen'),
  mainApp: () => document.getElementById('mainApp'),
  usernameInput: () => document.getElementById('usernameInput'),
  startButton: () => document.getElementById('startButton'),
  themeToggle: () => document.getElementById('themeToggle'),
  logoutButton: () => document.getElementById('logoutButton'),
  postModal: () => document.getElementById('postModal'),
  closePostModal: () => document.getElementById('closePostModal'),
  postForm: () => document.getElementById('postForm'),
  postContent: () => document.getElementById('postContent'),
  recordButton: () => document.getElementById('recordButton'),
  audioPreview: () => document.getElementById('audioPreview'),
  audioPreviewContainer: () => document.getElementById('audioPreviewContainer'),
  postsContainer: () => document.getElementById('postsContainer'),
  userAvatar: () => document.getElementById('userAvatar'),
  username: () => document.getElementById('username'),
  newPostButton: () => document.getElementById('newPostButton')
};

// Theme Management
function initializeTheme() {
  const isDark = localStorage.getItem('darkTheme') === 'true';
  document.body.classList.toggle('dark-theme', isDark);
  updateThemeIcon();
}

function toggleTheme() {
  document.body.classList.toggle('dark-theme');
  localStorage.setItem('darkTheme', document.body.classList.contains('dark-theme'));
  updateThemeIcon();
}

function updateThemeIcon() {
  const toggle = elements.themeToggle();
  if (toggle) {
    const isDark = document.body.classList.contains('dark-theme');
    toggle.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}"></i>`;
  }
}

// User Management
function handleStart(e) {
  e.preventDefault();
  const username = elements.usernameInput().value.trim();
  if (username) {
    currentUsername = username;
    localStorage.setItem('username', username);
    elements.welcomeScreen().style.display = 'none';
    elements.mainApp().style.display = 'block';
    updateUserDisplay();
  }
}

function updateUserDisplay() {
  const userDisplay = elements.username();
  const avatar = elements.userAvatar();
  if (userDisplay && avatar) {
    userDisplay.textContent = currentUsername;
    avatar.textContent = currentUsername.charAt(0).toUpperCase();
  }
}

function handleLogout() {
  localStorage.removeItem('username');
  localStorage.removeItem('darkTheme');
  window.location.reload();
}

// Audio Recording
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      elements.audioPreview().src = URL.createObjectURL(audioBlob);
      elements.audioPreviewContainer().style.display = 'block';
      validateForm();
    };

    mediaRecorder.start();
    isRecording = true;
    elements.recordButton().classList.add('recording');
    startTimer();
    
    setTimeout(() => {
      if (isRecording) stopRecording();
    }, RECORD_LIMIT * 1000);
    
  } catch (err) {
    console.error('Error accessing microphone:', err);
    showNotification('Could not access microphone', 'error');
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    stopTimer();
    elements.recordButton().classList.remove('recording');
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
}

function startTimer() {
  let seconds = 0;
  const timerDisplay = document.querySelector('.recording-timer');
  if (timerDisplay) {
    timerDisplay.style.display = 'inline';
    
    timerInterval = setInterval(() => {
      seconds++;
      const remaining = RECORD_LIMIT - seconds;
      timerDisplay.textContent = `${remaining}s`;
      timerDisplay.classList.toggle('warning', remaining <= 5);
      
      if (seconds >= RECORD_LIMIT) {
        stopRecording();
      }
    }, 1000);
  }
}

function stopTimer() {
  clearInterval(timerInterval);
  const timerDisplay = document.querySelector('.recording-timer');
  if (timerDisplay) {
    timerDisplay.style.display = 'none';
  }
}

// Form Validation
function validateForm(form = elements.postForm()) {
  if (!form) return;
  
  const textarea = form.querySelector('textarea');
  const submitButton = form.querySelector('[type="submit"]');
  const content = textarea.value.trim();
  
  submitButton.disabled = !content && audioChunks.length === 0;
  submitButton.classList.toggle('active', !submitButton.disabled);
}

function updateCharacterCount(textarea) {
  const counter = textarea.parentElement.querySelector('.character-counter');
  if (counter) {
    const remaining = TEXT_LIMIT - textarea.value.length;
    counter.textContent = `${remaining}`;
    counter.classList.toggle('limit-near', remaining < 50);
    counter.classList.toggle('limit-reached', remaining < 10);
  }
}

// Post Management
async function handlePostSubmit(e) {
  e.preventDefault();
  const content = elements.postContent().value.trim();
  
  if (!content && audioChunks.length === 0) return;

  const formData = new FormData();
  formData.append('username', currentUsername);
  if (content) formData.append('content', content);
  
  if (audioChunks.length > 0) {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    formData.append('audio', audioBlob, 'recording.wav');
  }

  try {
    const response = await fetch('/post', {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      closeModal();
      showNotification('Post created successfully', 'success');
    }
  } catch (err) {
    console.error('Error creating post:', err);
    showNotification('Error creating post', 'error');
  }
}

// Comments
function createCommentModal(postId) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Comments</h3>
        <button class="close-button">&times;</button>
      </div>
      <div class="comments-container" id="comments-${postId}"></div>
      <form class="comment-form">
        <div class="input-wrapper">
          <textarea placeholder="Add a comment..." maxlength="${TEXT_LIMIT}"></textarea>
          <div class="character-counter"></div>
        </div>
        <div class="form-actions">
          <button type="button" class="record-button">
            <i class="fas fa-microphone"></i>
          </button>
          <button type="submit" class="submit-button" disabled>Post</button>
        </div>
      </form>
    </div>
  `;
  return modal;
}

function handleCommentClick(postId) {
  const modal = createCommentModal(postId);
  document.body.appendChild(modal);

  const form = modal.querySelector('form');
  const textarea = form.querySelector('textarea');
  const recordBtn = form.querySelector('.record-button');
  const closeBtn = modal.querySelector('.close-button');

  textarea.addEventListener('input', function() {
    updateCharacterCount(this);
    validateForm(form);
  });

  recordBtn.addEventListener('click', () => {
    if (!isRecording) {
      audioChunks = [];
      startRecording();
    } else {
      stopRecording();
    }
  });

  form.addEventListener('submit', (e) => handleCommentSubmit(e, postId));
  closeBtn.addEventListener('click', () => modal.remove());

  loadComments(postId);
}

async function handleCommentSubmit(e, postId) {
  e.preventDefault();
  const form = e.target;
  const content = form.querySelector('textarea').value.trim();
  
  if (!content && audioChunks.length === 0) return;

  const formData = new FormData();
  formData.append('username', currentUsername);
  formData.append('content', content);
  
  if (audioChunks.length > 0) {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    formData.append('audio', audioBlob, 'recording.wav');
  }

  try {
    const response = await fetch(`/comment/${postId}`, {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      const comment = await response.json();
      addCommentToDisplay(postId, comment);
      form.reset();
      showNotification('Comment added', 'success');
    }
  } catch (err) {
    console.error('Error adding comment:', err);
    showNotification('Error adding comment', 'error');
  }
}

// Interactions (Likes, Share)
async function toggleLike(postId) {
  try {
    const response = await fetch(`/like/${postId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUsername })
    });
    
    if (response.ok) {
      const { likes } = await response.json();
      updateLikeDisplay(postId, likes);
    }
  } catch (err) {
    console.error('Error toggling like:', err);
    showNotification('Error updating like', 'error');
  }
}

function sharePost(postId) {
  const url = `${window.location.origin}/post/${postId}`;
  navigator.clipboard.writeText(url)
    .then(() => showNotification('Link copied!', 'success'))
    .catch(() => showNotification('Failed to copy link', 'error'));
}

// UI Updates
function updateLikeDisplay(postId, likes) {
  const post = document.querySelector(`[data-post-id="${postId}"]`);
  if (post) {
    const likeButton = post.querySelector('.like-button');
    const likeCount = post.querySelector('.like-count');
    const icon = likeButton.querySelector('i');
    
    icon.className = likes.includes(currentUsername) ? 'fas fa-heart' : 'far fa-heart';
    likeButton.classList.toggle('liked', likes.includes(currentUsername));
    likeCount.textContent = likes.length;
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function closeModal() {
  const modal = elements.postModal();
  if (modal) {
    modal.style.display = 'none';
    elements.postForm().reset();
    audioChunks = [];
    elements.audioPreviewContainer().style.display = 'none';
    stopRecording();
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Initialize app state
  initializeTheme();
  
  createSnowflakes();
  createFireworks();
  
  // Setup event listeners
  const startBtn = elements.startButton();
  if (startBtn) startBtn.addEventListener('click', handleStart);

  const themeToggle = elements.themeToggle();
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  const logoutBtn = elements.logoutButton();
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  const postContent = elements.postContent();
  if (postContent) {
    postContent.addEventListener('input', function() {
      updateCharacterCount(this);
      validateForm();
    });
  }

  const recordBtn = elements.recordButton();
  if (recordBtn) {
    recordBtn.addEventListener('click', () => {
      if (!isRecording) {
        audioChunks = [];
        startRecording();
      } else {
        stopRecording();
      }
    });
  }

  const postForm = elements.postForm();
  if (postForm) postForm.addEventListener('submit', handlePostSubmit);

  const newPostBtn = elements.newPostButton();
  if (newPostBtn && elements.postModal()) {
    newPostBtn.addEventListener('click', () => {
      elements.postModal().style.display = 'flex';
    });
  }

  const closeModalBtn = elements.closePostModal();
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

  // Handle post actions
  document.addEventListener('click', (e) => {
    if (e.target.closest('.like-button')) {
      const post = e.target.closest('.post');
      if (post) toggleLike(post.dataset.postId);
    } else if (e.target.closest('.comment-button')) {
      const post = e.target.closest('.post');
      if (post) handleCommentClick(post.dataset.postId);
    } else if (e.target.closest('.share-button')) {
      const post = e.target.closest('.post');
      if (post) sharePost(post.dataset.postId);
    }
  });

  // Check for logged in user
  if (currentUsername) {
    const welcomeScreen = elements.welcomeScreen();
    const mainApp = elements.mainApp();
    if (welcomeScreen && mainApp) {
      welcomeScreen.style.display = 'none';
      mainApp.style.display = 'block';
      updateUserDisplay();
    }
  }
});

// Socket.IO Event Handlers
socket.on('new-post', (post) => {
  const postElement = createPostElement(post);
  const container = elements.postsContainer();
  if (container) {
    container.insertBefore(postElement, container.firstChild);
  }
});

socket.on('new-comment', ({ postId, comment }) => {
  addCommentToDisplay(postId, comment);
  showNotification('New comment added');
});

socket.on('likes-updated', ({ postId, likes }) => {
  updateLikeDisplay(postId, likes);
});

// Helper Functions
function createPostElement(post) {
    const article = document.createElement('article');
    article.className = 'post';
    article.dataset.postId = post.id;
    
    article.innerHTML = `
      <div class="post-header">
        <div class="avatar">${post.username.charAt(0).toUpperCase()}</div>
        <div class="post-meta">
          <div class="username">${post.username}</div>
          <div class="timestamp">${new Date(post.timestamp).toLocaleString()}</div>
        </div>
      </div>
      ${post.content ? `<div class="post-content">${post.content}</div>` : ''}
      ${post.audio ? `
        <div class="audio-player">
          <audio controls src="${post.audio}"></audio>
        </div>
      ` : ''}
      <div class="post-actions">
        <button class="action-button like-button">
          <i class="far fa-heart"></i>
          <span class="like-count">0</span>
        </button>

        <button class="action-button share-button">
          <i class="far fa-share-square"></i>
          <span class="tooltip">Share post</span>
        </button>
      </div>
    `;
    
    return article;
   }
   
   function createCommentElement(comment) {
    const div = document.createElement('div');
    div.className = 'comment';
    div.innerHTML = `
      <div class="comment-header">
        <div class="avatar">${comment.username.charAt(0).toUpperCase()}</div>
        <div class="comment-meta">
          <div class="username">${comment.username}</div>
          <div class="timestamp">${new Date(comment.timestamp).toLocaleString()}</div>
        </div>
      </div>
      ${comment.content ? `<div class="comment-content">${comment.content}</div>` : ''}
      ${comment.audio ? `<audio controls src="${comment.audio}" class="comment-audio"></audio>` : ''}
    `;
    return div;
   }
   
   function addCommentToDisplay(postId, comment) {
    const container = document.querySelector(`#comments-${postId}`);
    if (container) {
      const commentElement = createCommentElement(comment);
      container.insertBefore(commentElement, container.firstChild);
    }
   }
   
   async function loadComments(postId) {
    try {
      const response = await fetch(`/comments/${postId}`);
      if (response.ok) {
        const comments = await response.json();
        const container = document.querySelector(`#comments-${postId}`);
        if (container && comments.length) {
          container.innerHTML = comments.map(comment => createCommentElement(comment).outerHTML).join('');
        }
      }
    } catch (err) {
      console.error('Error loading comments:', err);
      showNotification('Error loading comments', 'error');
    }
   }

   function createSnowflakes() {
    const snowflakes = ['❄', '❅', '❆'];
    const app = document.querySelector('.app');
    
    setInterval(() => {
      const snowflake = document.createElement('div');
      snowflake.className = 'snowflake';
      snowflake.style.left = Math.random() * 100 + 'vw';
      snowflake.style.animationDuration = Math.random() * 3 + 2 + 's';
      snowflake.style.opacity = Math.random();
      snowflake.innerHTML = snowflakes[Math.floor(Math.random() * snowflakes.length)];
      
      document.body.appendChild(snowflake);
      
      setTimeout(() => snowflake.remove(), 5000);
    }, 200);
  }
  
  function createFireworks() {
    setInterval(() => {
      const firework = document.createElement('div');
      firework.className = 'firework';
      firework.style.left = Math.random() * 100 + 'vw';
      document.body.appendChild(firework);
      
      setTimeout(() => firework.remove(), 1500);
    }, 2000);
  }


  function createFirework(x, y) {
    const firework = document.createElement('div');
    firework.className = 'firework';
    firework.style.left = x + 'px';
    firework.style.top = y + 'px';
    
    const colors = ['#FFD700', '#FF4D4D', '#4CAF50', '#FF1493', '#00FFFF'];
    
    for (let i = 0; i < 30; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      
      const angle = (i / 30) * 360;
      const velocity = 50 + Math.random() * 50;
      const fallDistance = Math.random() * 100;
      
      particle.style.setProperty('--fall-distance', fallDistance + 'px');
      particle.style.transform = `rotate(${angle}deg) translate(${velocity}px)`;
      
      firework.appendChild(particle);
    }
    
    document.body.appendChild(firework);
    setTimeout(() => firework.remove(), 1000);
  }
  
  // Trigger fireworks randomly
  setInterval(() => {
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * (window.innerHeight / 2);
    createFirework(x, y);
  }, 2000);