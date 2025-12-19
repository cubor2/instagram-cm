/* ================================================
   INSTAGRAM COMMUNITY MANAGER - APPLICATION LOGIC
   ================================================ */

// ================================================
// STATE MANAGEMENT
// ================================================
const AppState = {
  currentScreen: 'nouveau-post',
  currentTab: 'image',
  currentPost: {
    id: null,
    image: null,
    imageData: null,
    imageName: null,
    text: null,
    tone: '',
    publicationOption: 'queue',
    scheduledDate: null,
    status: 'draft',
    brightness: 0,
    contrast: 0,
    cropOffsetX: 0,
    cropOffsetY: 0
  },
  posts: [],
  settings: {
    instagramAccount: '',
    frequency: 'daily',
    timeStart: '09:00',
    timeEnd: '18:00',
    defaultTone: '',
    apiKey: ''
  },
  usedImages: []
};

// ================================================
// INIT APP
// ================================================
document.addEventListener('DOMContentLoaded', () => {
  try {
    console.log('App initializing...');
    loadFromStorage();
    initNavigation();
    initTabs();
    initImageUpload();
    initTextGeneration();
    initPublication();
    initSettings();
    renderPostList();

    // Initialize form with defaults
    resetPostForm();

    console.log('App initialized successfully.');
  } catch (err) {
    console.error('CRITICAL APP ERROR:', err);
    alert('Erreur grave lors du chargement de l\'application :\n' + err.message + '\n\nVérifiez la console pour plus de détails.');
  }
});

// ================================================
// LOAD FROM SERVER (was LocalStorage)
// ================================================
async function loadFromStorage() {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) throw new Error('Failed to load data from server');

    const data = await response.json();

    if (data.posts) AppState.posts = data.posts;
    if (data.settings) {
      AppState.settings = { ...AppState.settings, ...data.settings };
      populateSettings();
    }
    if (data.usedImages) AppState.usedImages = data.usedImages;

    // Refresh UI if necessary (e.g., if posts loaded after initial render)
    renderPostList();
  } catch (err) {
    console.error('Error loading from server:', err);
    // Silent fail or alert?
  }
}

// ================================================
// SAVE TO SERVER (was LocalStorage)
// ================================================
async function saveToStorage() {
  try {
    const payload = {
      posts: AppState.posts,
      settings: AppState.settings,
      usedImages: AppState.usedImages
    };

    const response = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Failed to save to server');
  } catch (e) {
    console.error('Error saving to server:', e);
    alert('⚠️ Erreur de sauvegarde vers le serveur ! Vérifiez la connexion.');
  }
}

// ================================================
// NAVIGATION BETWEEN SCREENS
// ================================================
function initNavigation() {
  const menuButtons = document.querySelectorAll('.sidebar-menu button');

  menuButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetScreen = btn.getAttribute('data-screen');

      // Reset form when clicking "Nouveau post"
      if (targetScreen === 'nouveau-post') {
        resetPostForm();
      }

      switchScreen(targetScreen);

      // Update active button
      menuButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function switchScreen(screenId) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  // Show target screen
  document.getElementById(screenId).classList.add('active');
  AppState.currentScreen = screenId;

  // Refresh post list if needed
  if (screenId === 'file') {
    renderPostList();
  }
}

// ================================================
// TABS MANAGEMENT
// ================================================
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Back buttons
  document.getElementById('text-back-btn').addEventListener('click', () => {
    switchTab('image');
  });

  document.getElementById('pub-back-btn').addEventListener('click', () => {
    switchTab('texte');
  });

  // Next buttons
  document.getElementById('image-next-btn').addEventListener('click', () => {
    if (AppState.currentPost.imageData) {
      switchTab('texte');
      markTabCompleted('image');
    }
  });

  document.getElementById('text-next-btn').addEventListener('click', () => {
    if (AppState.currentPost.text) {
      switchTab('publication');
      markTabCompleted('texte');
    }
  });
}

function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tabId}`).classList.add('active');

  AppState.currentTab = tabId;

  // Auto-fill Default Tone if entering Texte tab and it's empty
  if (tabId === 'texte') {
    const toneInput = document.getElementById('tone-of-voice');
    if (toneInput && !toneInput.value.trim() && AppState.settings.defaultTone) {
      toneInput.value = AppState.settings.defaultTone;
      AppState.currentPost.tone = AppState.settings.defaultTone; // Sync state
    }
  }
}

function markTabCompleted(tabId) {
  const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
  if (tab && !tab.classList.contains('completed')) {
    tab.classList.add('completed');
  }
}

// ================================================
// IMAGE UPLOAD & EDITING
// ================================================
function initImageUpload() {
  const imageInput = document.getElementById('image-input');
  const selectBtn = document.getElementById('select-image-btn');
  const imagePreview = document.getElementById('image-preview');
  const imageControls = document.getElementById('image-controls');
  const canvas = document.getElementById('image-canvas');
  const ctx = canvas.getContext('2d');
  const nextBtn = document.getElementById('image-next-btn');
  const imageStatus = document.getElementById('image-status');

  // Image sliders
  const brightnessSlider = document.getElementById('brightness');
  const contrastSlider = document.getElementById('contrast');
  const brightnessValue = document.getElementById('brightness-value');
  const contrastValue = document.getElementById('contrast-value');

  // Drag state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  // Click to select file
  selectBtn.addEventListener('click', () => {
    imageInput.click();
  });

  // Handle file selection
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      // Compress image to fix LocalStorage quota
      compressImage(event.target.result, 1080, 0.7).then(compressedDataUrl => {
        const img = new Image();
        img.onload = () => {
          // Store image
          AppState.currentPost.image = img;
          AppState.currentPost.imageName = file.name;
          AppState.currentPost.imageData = compressedDataUrl;
          AppState.currentPost.cropOffsetX = 0;
          AppState.currentPost.cropOffsetY = 0;

          // Check if image already used
          const status = getImageStatus(file.name);
          imageStatus.textContent = `Status: ${status}`;

          // Draw on canvas (crop square)
          const size = 400;
          canvas.width = size;
          canvas.height = size;

          drawImageOnCanvas();

          // Show controls
          imagePreview.classList.add('hidden');
          imageControls.classList.remove('hidden');
          nextBtn.disabled = false;
        };
        img.src = compressedDataUrl;
      }).catch(err => {
        console.error('Compression error:', err);
        alert('Erreur lors de la compression de l\'image');
      });
    };
    reader.readAsDataURL(file);
  });

  // Canvas drag to reposition crop
  canvas.addEventListener('mousedown', (e) => {
    if (!AppState.currentPost.image) return;
    isDragging = true;
    dragStartX = e.offsetX;
    dragStartY = e.offsetY;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaX = e.offsetX - dragStartX;
    const deltaY = e.offsetY - dragStartY;

    // Calculate new offsets
    let newOffsetX = AppState.currentPost.cropOffsetX + deltaX;
    let newOffsetY = AppState.currentPost.cropOffsetY + deltaY;

    // Calculate bounds to prevent empty space
    const img = AppState.currentPost.image;
    if (img) {
      const size = 400;
      const scale = Math.max(size / img.width, size / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;

      // Max offsets (prevent left/top empty space)
      const maxOffsetX = (scaledWidth - size) / 2;
      const maxOffsetY = (scaledHeight - size) / 2;

      // Min offsets (prevent right/bottom empty space)
      const minOffsetX = -(scaledWidth - size) / 2;
      const minOffsetY = -(scaledHeight - size) / 2;

      // Clamp offsets within bounds
      newOffsetX = Math.max(minOffsetX, Math.min(maxOffsetX, newOffsetX));
      newOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, newOffsetY));
    }

    AppState.currentPost.cropOffsetX = newOffsetX;
    AppState.currentPost.cropOffsetY = newOffsetY;

    dragStartX = e.offsetX;
    dragStartY = e.offsetY;

    drawImageOnCanvas();
  });

  canvas.addEventListener('mouseup', () => {
    isDragging = false;
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
  });

  // Brightness slider
  brightnessSlider.addEventListener('input', (e) => {
    AppState.currentPost.brightness = parseInt(e.target.value);
    brightnessValue.textContent = e.target.value;
    applyImageFilters();
  });

  // Contrast slider
  contrastSlider.addEventListener('input', (e) => {
    AppState.currentPost.contrast = parseInt(e.target.value);
    contrastValue.textContent = e.target.value;
    applyImageFilters();
  });

  // Reset Button
  const resetBtn = document.getElementById('reset-image-btn');
  resetBtn.addEventListener('click', () => {
    // Reset State
    AppState.currentPost.brightness = 0;
    AppState.currentPost.contrast = 0;

    // Reset Inputs
    brightnessSlider.value = 0;
    contrastSlider.value = 0;
    brightnessValue.textContent = '0';
    contrastValue.textContent = '0';

    // Apply
    applyImageFilters();
  });
}

function drawImageOnCanvas() {
  const canvas = document.getElementById('image-canvas');
  const ctx = canvas.getContext('2d');
  const img = AppState.currentPost.image;

  if (!img) return;

  const size = 400;
  const scale = Math.max(size / img.width, size / img.height);
  const x = (size / 2) - (img.width / 2) * scale + AppState.currentPost.cropOffsetX;
  const y = (size / 2) - (img.height / 2) * scale + AppState.currentPost.cropOffsetY;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
}

function applyImageFilters() {
  const canvas = document.getElementById('image-canvas');
  const ctx = canvas.getContext('2d');
  const img = AppState.currentPost.image;

  if (!img) return;

  const size = 400;
  const scale = Math.max(size / img.width, size / img.height);
  const x = (size / 2) - (img.width / 2) * scale + AppState.currentPost.cropOffsetX;
  const y = (size / 2) - (img.height / 2) * scale + AppState.currentPost.cropOffsetY;

  ctx.clearRect(0, 0, size, size);
  ctx.filter = `brightness(${100 + AppState.currentPost.brightness}%) contrast(${100 + AppState.currentPost.contrast}%)`;
  ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
  ctx.filter = 'none';
}

function getImageStatus(imageName) {
  if (!imageName) return 'Libre';

  const isUsed = AppState.usedImages.includes(imageName);
  const isPlanned = AppState.posts.some(post => post.imageName === imageName);

  if (isUsed) return 'Image déjà utilisée';
  if (isPlanned) return 'Image planifiée';
  return 'Image libre';
}

// ================================================
// TEXT GENERATION (SIMULATED)
// ================================================
function initTextGeneration() {
  const toneInput = document.getElementById('tone-of-voice');
  const generateBtn = document.getElementById('generate-text-btn');
  const proposalsContainer = document.getElementById('text-proposals');
  const textEdit = document.getElementById('text-edit');
  const finalText = document.getElementById('final-text');
  const nextBtn = document.getElementById('text-next-btn');

  generateBtn.addEventListener('click', async () => {
    const tone = toneInput.value || 'neutre';
    AppState.currentPost.tone = tone;

    // UI Loading state
    generateBtn.disabled = true;
    generateBtn.textContent = 'Analyse de l\'image et rédaction en cours...';
    proposalsContainer.classList.add('hidden');

    let proposals = [];

    // Check for API Key
    if (AppState.settings.apiKey && AppState.settings.apiKey.startsWith('sk-')) {
      try {
        // Real Generation
        proposals = await generateRealTexts(tone);
      } catch (e) {
        console.error('API Error:', e);
        alert('Erreur API: ' + e.message + '. Passage en mode simulation.');
        proposals = generateSimulatedTexts(tone);
      }
    } else {
      // Fallback Simulation
      console.log('No valid API Key, using simulation.');
      proposals = generateSimulatedTexts(tone);
    }

    // Reset UI
    generateBtn.disabled = false;
    generateBtn.textContent = 'Générer des propositions';

    // Display proposals
    proposalsContainer.innerHTML = '';
    proposals.forEach((text, index) => {
      const proposalEl = document.createElement('div');
      proposalEl.className = 'text-proposal';
      proposalEl.innerHTML = `
        <div class="text-proposal-label">Proposition ${index + 1}</div>
        <div class="text-proposal-content">${text}</div>
      `;

      proposalEl.addEventListener('click', () => {
        // Deselect all
        document.querySelectorAll('.text-proposal').forEach(p => {
          p.classList.remove('selected');
        });

        // Select this one
        proposalEl.classList.add('selected');
        AppState.currentPost.text = text;

        // Show edit field
        finalText.value = text;
        textEdit.classList.remove('hidden');
        nextBtn.disabled = false;
      });

      proposalsContainer.appendChild(proposalEl);
    });

    proposalsContainer.classList.remove('hidden');
  });

  // Allow manual editing
  finalText.addEventListener('input', (e) => {
    AppState.currentPost.text = e.target.value;
  });
}

// Real API Call
async function generateRealTexts(tone) {
  const canvas = document.getElementById('image-canvas');
  const base64Image = canvas.toDataURL('image/jpeg', 0.7); // Compress slightly for speed

  const prompt = `Tu es un Community Manager expert pour Instagram. Analyse cette image et rédige 3 propositions complètes de légendes.

INSTRUCTIONS DE STYLE ET FORMATAGE (A RESPECTER IMPERATIVEMENT) :
"""
${tone}
"""

IMPORTANT :
1. Si des sauts de ligne sont demandés (ex: "Ligne vide avant les hashtags"), tu DOIS insérer des caractères "\\n" dans la chaîne JSON.
2. Les hashtags doivent être inclus DANS la chaîne de caractères.

FORMAT DE SORTIE : Un tableau JSON de 3 chaînes. Exemple valide : ["Caption...\\n\\n#tag1", "Caption...", "Caption..."].`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AppState.settings.apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: base64Image } }
          ]
        }
      ],
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Unknown API Error');
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Clean and parse JSON
  try {
    // Attempt 1: naive clean
    let cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();

    // Attempt 2: find array bounds
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    }

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      // Pad with error messages if fewer than 3
      while (parsed.length < 3) parsed.push("...");
      return parsed.slice(0, 3);
    }
  } catch (e) {
    console.warn('JSON Parse Error, attempting line split', content);
    // Fallback: Split by newlines and filter empty lines
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 20); // filter short noise
    if (lines.length >= 3) return lines.slice(0, 3);
  }

  // Final fallback if everything fails
  return [content, "Erreur de formatage du tableau JSON.", "L'IA n'a pas renvoyé le format attendu."];
}

function generateSimulatedTexts(tone) {
  const templates = [
    `🌿 Nouvelle création ${tone}. Fait main avec passion. Disponible dès maintenant. #artisan #${tone}`,
    `Derrière chaque pièce, des heures de travail minutieux. C'est ça, l'artisanat ${tone}. ✨`,
    `${tone.charAt(0).toUpperCase() + tone.slice(1)} et authentique. C'est notre signature. Découvrez notre dernière création. 🔨`
  ];

  return templates;
}

function compressImage(base64Str, maxWidth = 1080, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width *= maxWidth / height;
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (err) => reject(err);
  });
}

// ================================================
// PUBLICATION
// ================================================
function initPublication() {
  const radioOptions = document.querySelectorAll('input[name="pub-option"]');
  const scheduleOptions = document.getElementById('schedule-options');
  const publishBtn = document.getElementById('publish-btn');

  // Show/hide schedule options
  radioOptions.forEach(radio => {
    radio.addEventListener('change', (e) => {
      AppState.currentPost.publicationOption = e.target.value;

      if (e.target.value === 'schedule') {
        scheduleOptions.classList.remove('hidden');
      } else {
        scheduleOptions.classList.add('hidden');
      }

      // Update button text
      if (e.target.value === 'now') {
        publishBtn.textContent = 'Publier maintenant';
      } else if (e.target.value === 'queue') {
        publishBtn.textContent = 'Ajouter à la file';
      } else {
        publishBtn.textContent = 'Planifier';
      }
    });
  });

  // Handle datetime
  document.getElementById('schedule-datetime').addEventListener('change', (e) => {
    AppState.currentPost.scheduledDate = e.target.value;
  });

  // Publish button
  publishBtn.addEventListener('click', () => {
    handlePublish();
  });
}

function handlePublish() {
  const post = AppState.currentPost;

  // Validation
  if (!post.imageData || !post.text) {
    alert('Veuillez compléter l\'image et le texte.');
    return;
  }

  // Get canvas data
  const canvas = document.getElementById('image-canvas');
  const imageDataUrl = canvas.toDataURL('image/jpeg');

  // Create post object
  const newPost = {
    id: post.id || Date.now(),
    imageData: imageDataUrl,
    imageName: post.imageName.replace(/\.[^.]+$/, '') + '.jpg',
    text: post.text,
    tone: post.tone,
    publicationOption: post.publicationOption,
    scheduledDate: post.scheduledDate || getNextScheduledDate(),
    status: post.publicationOption === 'now' ? 'published' : 'scheduled',
    createdAt: new Date().toISOString(),
    brightness: post.brightness,
    contrast: post.contrast,
    cropOffsetX: post.cropOffsetX,
    cropOffsetY: post.cropOffsetY,
    originalImageData: post.imageData
  };

  // Handle different publication options
  if (post.publicationOption === 'now') {
    simulateInstagramPublish(newPost);
    alert('✓ Post publié (simulé)');

    // Reset form
    resetPostForm();
  } else {
    // Add to queue
    AppState.posts.push(newPost);
    AppState.posts.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
    saveToStorage();

    // Show alert
    alert('✓ Post ajouté à la file de publication');

    // Go to queue
    switchScreen('file');
    document.querySelectorAll('.sidebar-menu button').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-screen') === 'file') {
        btn.classList.add('active');
      }
    });

    // Don't reset form - user will click "Nouveau post" when ready
  }

  // Mark image as used if published
  if (post.publicationOption === 'now' && !AppState.usedImages.includes(post.imageName)) {
    AppState.usedImages.push(post.imageName);
    saveToStorage();
  }
}

function getNextScheduledDate() {
  const now = new Date();
  const settings = AppState.settings;

  // Simple logic: tomorrow at start time
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(parseInt(settings.timeStart.split(':')[0]));
  tomorrow.setMinutes(parseInt(settings.timeStart.split(':')[1]));

  return tomorrow.toISOString();
}

function simulateInstagramPublish(post) {
  console.log('📸 SIMULATION: Publication Instagram');
  console.log('Texte:', post.text);
  console.log('Image:', post.imageName);
  console.log('Date:', new Date().toLocaleString('fr-FR'));
}

function resetPostForm() {
  AppState.currentPost = {
    id: null,
    image: null,
    imageData: null,
    imageName: null,
    text: null,
    tone: '',
    publicationOption: 'queue',
    scheduledDate: null,
    status: 'draft',
    brightness: 0,
    contrast: 0,
    cropOffsetX: 0,
    cropOffsetY: 0
  };

  // Reset UI - safely check if elements exist
  try {
    const imageInput = document.getElementById('image-input');
    const imagePreview = document.getElementById('image-preview');
    const imageControls = document.getElementById('image-controls');
    const imageNextBtn = document.getElementById('image-next-btn');
    const toneInput = document.getElementById('tone-of-voice');
    const textProposals = document.getElementById('text-proposals');
    const textEdit = document.getElementById('text-edit');
    const textNextBtn = document.getElementById('text-next-btn');
    const brightness = document.getElementById('brightness');
    const contrast = document.getElementById('contrast');
    const brightnessValue = document.getElementById('brightness-value');
    const contrastValue = document.getElementById('contrast-value');
    const imageStatus = document.getElementById('image-status');

    if (imageInput) imageInput.value = '';
    if (imagePreview) imagePreview.classList.remove('hidden');
    if (imageControls) imageControls.classList.add('hidden');
    if (imageNextBtn) imageNextBtn.disabled = true;

    // Set default tone from settings
    if (toneInput) {
      toneInput.value = AppState.settings.defaultTone || '';
    }

    if (textProposals) textProposals.classList.add('hidden');
    if (textEdit) textEdit.classList.add('hidden');
    if (textNextBtn) textNextBtn.disabled = true;
    if (brightness) brightness.value = 0;
    if (contrast) contrast.value = 0;
    if (brightnessValue) brightnessValue.textContent = '0';
    if (contrastValue) contrastValue.textContent = '0';
    if (imageStatus) imageStatus.textContent = '';

    // Clear canvas
    const canvas = document.getElementById('image-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Reset tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active', 'completed');
    });
    const imageTab = document.querySelector('.tab[data-tab="image"]');
    if (imageTab) imageTab.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    const tabImage = document.getElementById('tab-image');
    if (tabImage) tabImage.classList.add('active');
  } catch (error) {
    console.error('Error in resetPostForm:', error);
  }
}

// ================================================
// POST LIST / FILE DE PUBLICATION
// ================================================

// Define these functions globally BEFORE renderPostList uses them
window.editPost = function (postId) {
  const post = AppState.posts.find(p => p.id === postId);
  if (!post) return;

  // Remove from queue temporarily
  AppState.posts = AppState.posts.filter(p => p.id !== postId);
  saveToStorage();

  // Load into currentPost
  AppState.currentPost = {
    id: post.id,
    image: null,
    imageData: post.originalImageData || post.imageData,
    imageName: post.imageName,
    text: post.text,
    tone: post.tone,
    publicationOption: post.publicationOption,
    scheduledDate: post.scheduledDate,
    status: 'draft',
    brightness: post.brightness || 0,
    contrast: post.contrast || 0,
    cropOffsetX: post.cropOffsetX || 0,
    cropOffsetY: post.cropOffsetY || 0
  };

  populatePostForm(post);

  switchScreen('nouveau-post');
  document.querySelectorAll('.sidebar-menu button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-screen') === 'nouveau-post') {
      btn.classList.add('active');
    }
  });
};

function populatePostForm(post) {
  // Restore image
  if (post.imageData || post.originalImageData) {
    const imgSrc = post.originalImageData || post.imageData;
    const img = new Image();
    img.onload = () => {
      AppState.currentPost.image = img;

      const canvas = document.getElementById('image-canvas');
      const size = 400;
      canvas.width = size;
      canvas.height = size;

      // Show controls
      document.getElementById('image-preview').classList.add('hidden');
      document.getElementById('image-controls').classList.remove('hidden');
      document.getElementById('image-next-btn').disabled = false;

      // Restore filters
      document.getElementById('brightness').value = post.brightness || 0;
      document.getElementById('contrast').value = post.contrast || 0;
      document.getElementById('brightness-value').textContent = post.brightness || 0;
      document.getElementById('contrast-value').textContent = post.contrast || 0;

      // Draw with saved offsets
      drawImageOnCanvas();
      applyImageFilters();

      // Mark tab as completed
      markTabCompleted('image');
    };
    img.src = imgSrc;
  }

  // Restore text
  if (post.text) {
    document.getElementById('tone-of-voice').value = post.tone || '';

    // Setup text edit UI
    const textEdit = document.getElementById('text-edit');
    const proposals = document.getElementById('text-proposals');

    textEdit.classList.remove('hidden');
    proposals.classList.add('hidden');

    const textArea = document.querySelector('#text-edit textarea');
    if (textArea) {
      textArea.value = post.text;
    }

    document.getElementById('text-next-btn').disabled = false;
    markTabCompleted('texte');
  }

  // Switch to first tab
  switchTab('image');
}

function populatePostForm(post) {
  // Restore image
  if (post.imageData || post.originalImageData) {
    const imgSrc = post.originalImageData || post.imageData;
    const img = new Image();
    img.onload = () => {
      AppState.currentPost.image = img;

      const canvas = document.getElementById('image-canvas');
      const size = 400;
      canvas.width = size;
      canvas.height = size;

      // Show controls
      document.getElementById('image-preview').classList.add('hidden');
      document.getElementById('image-controls').classList.remove('hidden');
      document.getElementById('image-next-btn').disabled = false;

      // Restore filters
      document.getElementById('brightness').value = post.brightness || 0;
      document.getElementById('contrast').value = post.contrast || 0;
      document.getElementById('brightness-value').textContent = post.brightness || 0;
      document.getElementById('contrast-value').textContent = post.contrast || 0;

      // Draw with saved offsets
      drawImageOnCanvas();
      applyImageFilters();

      // Mark tab as completed
      markTabCompleted('image');
    };
    img.src = imgSrc;
  }

  // Restore text
  if (post.text) {
    document.getElementById('tone-of-voice').value = post.tone || '';
    // If text was generated/edited, put it in the final text area
    // Note: We might need to handle the 'proposals' state if meaningful, 
    // but putting it in final-text is safer for editing.
    // Ensure the textarea exists or use the div logic? 
    // Checking earlier code: 'text-edit' div contains textarea?
    // Let's check view_file. Assuming standard structure:
    const textEdit = document.getElementById('text-edit');
    const proposals = document.getElementById('text-proposals');

    // We skip generation step and go straight to edit
    textEdit.classList.remove('hidden');
    proposals.classList.add('hidden');

    // We need to inject the text into the textarea if it exists, 
    // or create the edit UI if it's dynamic.
    // Based on app.js, we usually select a proposal which populates the textarea.

    const textArea = document.querySelector('#text-edit textarea');
    if (textArea) {
      textArea.value = post.text;
    }

    document.getElementById('text-next-btn').disabled = false;
    markTabCompleted('texte');
  }

  // Switch to first tab
  switchTab('image');
}

window.updatePostDate = function (newDate, postId) {
  const post = AppState.posts.find(p => p.id === postId);
  if (!post) return;

  post.scheduledDate = new Date(newDate).toISOString();
  AppState.posts.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
  saveToStorage();
  renderPostList();
};

window.togglePausePost = function (postId) {
  console.log('togglePausePost called with ID:', postId);
  const post = AppState.posts.find(p => p.id === postId);
  if (!post) return;

  post.status = post.status === 'paused' ? 'scheduled' : 'paused';
  saveToStorage();
  renderPostList();
};

window.deletePost = function (postId) {
  console.log('Request to delete post. ID:', postId);

  // DIRECT DELETE (Debugging confirm issue)
  // if (!confirm('Voulez-vous vraiment supprimer ce post ?')) return;

  const initialCount = AppState.posts.length;
  console.log('Initial count:', initialCount);

  // Robust filtering using String conversion
  const newPosts = AppState.posts.filter(p => String(p.id) !== String(postId));

  // Update AppState
  AppState.posts = newPosts;

  console.log('New count:', AppState.posts.length);

  if (AppState.posts.length === initialCount) {
    console.error('DELETE FAILED: ID not found. Available IDs:', AppState.posts.map(p => p.id));
    alert('Erreur: Impossible de trouver l\'ID du post à supprimer.');
  } else {
    console.log('SUCCESS: Post deleted.');
    saveToStorage(); // Save immediately
    renderPostList(); // Re-render immediately
  }
};

function renderPostList() {
  const listContainer = document.getElementById('post-list');
  const emptyState = document.getElementById('empty-queue');

  if (AppState.posts.length === 0) {
    listContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  listContainer.innerHTML = '';

  AppState.posts.forEach(post => {
    const postEl = document.createElement('div');
    postEl.className = 'post-item';
    if (post.status === 'paused') {
      postEl.classList.add('paused');
    }

    const scheduledDate = new Date(post.scheduledDate);
    const dateForInput = scheduledDate.toISOString().slice(0, 16);

    const pauseButtonText = post.status === 'paused' ? 'Remettre dans la file' : 'Pause';

    postEl.innerHTML = `
      <div class="post-row">
        <img src="${post.imageData}" class="post-thumb" alt="Post thumbnail">
        
        <div class="post-details">
          <p class="post-text" title="${post.text}">${post.text || 'Sans texte...'}</p>
          <div class="post-meta">
            <span>${dateForInput.replace('T', ' ')}</span>
            <span class="status-badge status-${post.status}">${post.status === 'published' ? 'Publié' : post.status === 'paused' ? 'En pause' : 'Planifié'}</span>
          </div>
        </div>

        <div class="post-actions">
          <button class="btn btn-sm" onclick="editPost(${post.id})">Modifier</button>
          <button class="btn btn-sm" data-sync-id="${post.id}" onclick="sendToWebhook(${post.id})" title="Envoyer vers Make/Zapier">Sync/MàJ</button>
          <button class="btn btn-sm" onclick="togglePausePost(${post.id})">${pauseButtonText}</button>
          <button class="btn btn-sm" onclick="deletePost(${post.id})">Supprimer</button>
        </div>
      </div>
    `;

    listContainer.appendChild(postEl);
  });
}



// ================================================
// SETTINGS
// ================================================
function initSettings() {
  const saveBtn = document.getElementById('save-settings-btn');
  const connectBtn = document.getElementById('connect-instagram-btn');

  saveBtn.addEventListener('click', () => {
    // Save settings
    AppState.settings.instagramAccount = document.getElementById('instagram-account').value;
    AppState.settings.frequency = document.getElementById('frequency').value;
    AppState.settings.timeStart = document.getElementById('time-start').value;
    AppState.settings.timeEnd = document.getElementById('time-end').value;
    AppState.settings.defaultTone = document.getElementById('default-tone').value;
    AppState.settings.apiKey = document.getElementById('openai-key').value;
    AppState.settings.webhookUrl = document.getElementById('webhook-url').value;

    saveToStorage();
    alert('✓ Paramètres enregistrés');
  });

  connectBtn.addEventListener('click', () => {
    alert('✓ Connexion Instagram simulée');
    console.log('SIMULATION: Connexion à Instagram');
  });
}

function populateSettings() {
  document.getElementById('instagram-account').value = AppState.settings.instagramAccount || '';
  document.getElementById('frequency').value = AppState.settings.frequency || 'daily';
  document.getElementById('time-start').value = AppState.settings.timeStart || '09:00';
  document.getElementById('time-end').value = AppState.settings.timeEnd || '18:00';
  document.getElementById('default-tone').value = AppState.settings.defaultTone || '';
  document.getElementById('default-tone').value = AppState.settings.defaultTone || '';
  document.getElementById('openai-key').value = AppState.settings.apiKey || '';
  document.getElementById('webhook-url').value = AppState.settings.webhookUrl || '';
}

// ================================================
// WEBHOOK INTEGRATION
// ================================================
async function sendToWebhook(postId) {
  const post = AppState.posts.find(p => p.id === postId);
  if (!post) return;

  const webhookUrl = AppState.settings.webhookUrl;
  if (!webhookUrl || !webhookUrl.startsWith('http')) {
    alert('Veuillez configurer une URL de Webhook valide dans les paramètres.');
    return;
  }

  const btn = document.querySelector(`button[data-sync-id="${postId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Envoi...';
  }

  try {
    const payload = {
      id: post.id,
      text: post.text,
      status: post.status,
      scheduled_date: post.scheduledDate,
      image_name: post.imageName,
      // Send only the base64 part, stripping the header if present
      image_data: post.imageData.includes(',') ? post.imageData.split(',')[1] : post.imageData,
      tone_used: post.tone
    };

    console.log('Sending to Webhook:', webhookUrl); // DEBUG LOG

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      alert('✅ Post envoyé avec succès au Webhook !');
      // Visual feedback
      if (btn) btn.textContent = 'Sync OK';
    } else {
      throw new Error(`Erreur ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Webhook Error:', error);
    alert('Erreur lors de l\'envoi : ' + error.message);
    if (btn) btn.textContent = 'Erreur';
  } finally {
    if (btn) setTimeout(() => {
      btn.disabled = false;
      if (btn.textContent === 'Envoi...') btn.textContent = 'Sync/MàJ'; // Revert if no specific status
    }, 2000);
  }
}
