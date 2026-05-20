let conversationHistory = [];
let currentChatId = null;
let allChats = [];
const MAX_HISTORY = 50;
let pendingImages = [];
let isStreaming = false;

const messagesEl = document.getElementById('messages');
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const summarizeBtn = document.getElementById('summarize-btn');
const translateBtn = document.getElementById('translate-btn');
const settingsBtn = document.getElementById('settings-btn');
const historyBtn = document.getElementById('history-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const settingsPanel = document.getElementById('settings-panel');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const closeHistoryBtn = document.getElementById('close-history');
const apiKeyInput = document.getElementById('api-key');
const modelIdInput = document.getElementById('model-id');
const endpointUrlInput = document.getElementById('endpoint-url');
const systemPromptInput = document.getElementById('system-prompt');
const saveSettingsBtn = document.getElementById('save-settings');
const cancelSettingsBtn = document.getElementById('cancel-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const toggleKeyBtn = document.getElementById('toggle-key');

// --- Markdown Renderer ---
function renderMarkdown(text) {
  if (!text) return '';
  let html = text;

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre><code class="lang-${lang || 'text'}">${escaped}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Unordered lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Line breaks (but not inside pre)
  html = html.replace(/\n/g, '<br>');

  // Clean up extra <br> inside block elements
  html = html.replace(/<br><\/(h[1-6]|ul|ol|li|pre|blockquote)>/g, '</$1>');
  html = html.replace(/<(h[1-6]|ul|ol|li|pre|blockquote)><br>/g, '<$1>');

  return html;
}

// --- Utils ---
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function getChatTitle(messages) {
  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = Array.isArray(msg.content)
        ? (msg.content.find(c => c.type === 'text')?.text || '')
        : msg.content;
      if (text) return text.slice(0, 40) + (text.length > 40 ? '...' : '');
    }
  }
  return 'New Chat';
}

// --- Dark Mode ---
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    // auto
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  const { theme } = await sendToBackground({ type: 'GET_SETTINGS' });
  if (theme === 'auto') applyTheme('auto');
});

// --- Welcome ---
async function showWelcome() {
  const settings = await sendToBackground({ type: 'GET_SETTINGS' });
  const model = settings.modelId || 'AI';
  messagesEl.innerHTML = `
    <div class="welcome">
      <div class="welcome-icon">AI</div>
      <h3>Hi, I'm AI Sidebar</h3>
      <p>Powered by ${model}. Ask me anything or summarize the current page.</p>
    </div>
  `;
}

function hideWelcome() {
  const welcome = messagesEl.querySelector('.welcome');
  if (welcome) welcome.remove();
}

// --- Init ---
(async function init() {
  const settings = await sendToBackground({ type: 'GET_SETTINGS' });
  applyTheme(settings.theme || 'auto');
  if (!settings.apiKey) {
    settingsPanel.classList.remove('hidden');
  }

  const { chats } = await sendToBackground({ type: 'GET_CHATS' });
  allChats = chats || [];

  if (allChats.length > 0) {
    const latest = allChats[0];
    currentChatId = latest.id;
    conversationHistory = latest.messages;
    renderMessages();
  } else {
    startNewChat();
  }
})();

// --- Chat management ---
function startNewChat() {
  currentChatId = genId();
  conversationHistory = [];
  messagesEl.innerHTML = '';
  showWelcome();
}

async function saveCurrentChat() {
  if (conversationHistory.length === 0) return;

  const existingIdx = allChats.findIndex(c => c.id === currentChatId);
  const chatData = {
    id: currentChatId,
    title: getChatTitle(conversationHistory),
    timestamp: Date.now(),
    messages: [...conversationHistory]
  };

  if (existingIdx >= 0) {
    allChats[existingIdx] = chatData;
  } else {
    allChats.unshift(chatData);
  }

  allChats.sort((a, b) => b.timestamp - a.timestamp);
  await sendToBackground({ type: 'SAVE_CHATS', chats: allChats });
}

function loadChat(chatId) {
  const chat = allChats.find(c => c.id === chatId);
  if (!chat) return;

  currentChatId = chatId;
  conversationHistory = [...chat.messages];
  messagesEl.innerHTML = '';
  renderMessages();
  historyPanel.classList.add('hidden');
}

async function deleteChat(chatId) {
  allChats = allChats.filter(c => c.id !== chatId);
  await sendToBackground({ type: 'SAVE_CHATS', chats: allChats });

  if (chatId === currentChatId) {
    if (allChats.length > 0) {
      loadChat(allChats[0].id);
    } else {
      startNewChat();
    }
  }
  renderHistoryList();
}

// --- Render ---
function renderMessages() {
  messagesEl.innerHTML = '';
  if (conversationHistory.length === 0) {
    showWelcome();
    return;
  }
  for (const msg of conversationHistory) {
    if (msg.role === 'user') {
      if (Array.isArray(msg.content)) {
        const textPart = msg.content.find(c => c.type === 'text');
        const imageParts = msg.content.filter(c => c.type === 'image_url');
        const imageUrls = imageParts.map(c => c.image_url.url);
        appendMessage('user', textPart?.text || '', imageUrls.length > 0 ? imageUrls : null);
      } else {
        appendMessage('user', msg.content);
      }
    } else if (msg.role === 'assistant') {
      appendMessage('assistant', msg.content);
    }
  }
  scrollToBottom();
}

function renderHistoryList() {
  if (allChats.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No conversations yet</div>';
    return;
  }
  historyList.innerHTML = allChats.map(chat => `
    <div class="history-item ${chat.id === currentChatId ? 'active' : ''}" data-id="${chat.id}">
      <div class="history-item-info">
        <div class="history-item-title">${escapeHtml(chat.title)}</div>
        <div class="history-item-time">${formatTime(chat.timestamp)}</div>
      </div>
      <button class="history-item-delete" data-id="${chat.id}" title="Delete">&times;</button>
    </div>
  `).join('');

  historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.history-item-delete')) return;
      loadChat(item.dataset.id);
    });
  });

  historyList.querySelectorAll('.history-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChat(btn.dataset.id);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- History panel ---
historyBtn.addEventListener('click', () => {
  renderHistoryList();
  historyPanel.classList.remove('hidden');
});

closeHistoryBtn.addEventListener('click', () => {
  historyPanel.classList.add('hidden');
});

newChatBtn.addEventListener('click', () => {
  startNewChat();
});

// --- Settings ---
settingsBtn.addEventListener('click', async () => {
  const settings = await sendToBackground({ type: 'GET_SETTINGS' });
  endpointUrlInput.value = settings.endpointUrl || '';
  apiKeyInput.value = settings.apiKey || '';
  modelIdInput.value = settings.modelId || '';
  systemPromptInput.value = settings.systemPrompt || '';
  // Highlight current theme
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (settings.theme || 'auto'));
  });
  settingsPanel.classList.remove('hidden');
});

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyTheme(btn.dataset.theme);
  });
});

saveSettingsBtn.addEventListener('click', async () => {
  const endpointUrl = endpointUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const modelId = modelIdInput.value.trim();
  const systemPrompt = systemPromptInput.value.trim();
  const activeTheme = document.querySelector('.theme-btn.active');
  const theme = activeTheme ? activeTheme.dataset.theme : 'auto';

  let hasError = false;
  [endpointUrlInput, apiKeyInput, modelIdInput].forEach(el => el.style.borderColor = '');
  if (!endpointUrl) { endpointUrlInput.style.borderColor = 'var(--error)'; hasError = true; }
  if (!apiKey) { apiKeyInput.style.borderColor = 'var(--error)'; hasError = true; }
  if (!modelId) { modelIdInput.style.borderColor = 'var(--error)'; hasError = true; }
  if (hasError) return;

  await sendToBackground({ type: 'SAVE_SETTINGS', endpointUrl, apiKey, modelId, systemPrompt, theme });
  applyTheme(theme);
  settingsPanel.classList.add('hidden');
  if (messagesEl.querySelector('.welcome')) {
    showWelcome();
  }
});

cancelSettingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

toggleKeyBtn.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyBtn.innerHTML = isPassword ? '&#128064;' : '&#128065;';
});

// --- Image Paste ---
userInput.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        const base64 = dataUrl.split(',')[1];
        pendingImages.push({ base64, mimeType: blob.type, dataUrl });
        renderImagePreview();
      };
      reader.readAsDataURL(blob);
    }
  }
});

function renderImagePreview() {
  removeImagePreview();
  if (pendingImages.length === 0) return;

  const preview = document.createElement('div');
  preview.id = 'image-preview';

  const grid = document.createElement('div');
  grid.className = 'preview-grid';

  pendingImages.forEach((img, idx) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.innerHTML = `
      <img src="${img.dataUrl}" alt="Image ${idx + 1}" />
      <button class="remove-one" data-idx="${idx}" title="Remove">&times;</button>
    `;
    grid.appendChild(item);
  });

  const clearBtn = document.createElement('button');
  clearBtn.id = 'clear-images';
  clearBtn.textContent = `Clear all (${pendingImages.length})`;
  clearBtn.addEventListener('click', () => {
    pendingImages = [];
    removeImagePreview();
  });

  preview.appendChild(grid);
  preview.appendChild(clearBtn);
  userInput.parentElement.insertBefore(preview, userInput.parentElement.firstChild);

  preview.querySelectorAll('.remove-one').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      pendingImages.splice(idx, 1);
      renderImagePreview();
    });
  });
}

function removeImagePreview() {
  const existing = document.getElementById('image-preview');
  if (existing) existing.remove();
}

// --- Port connection ---
function connectPort() {
  return chrome.runtime.connect({ name: 'ai-sidebar' });
}

// --- Chat ---
sendBtn.addEventListener('click', handleSend);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

async function handleSend() {
  const text = userInput.value.trim();
  if ((!text && pendingImages.length === 0) || isStreaming) return;

  hideWelcome();

  let apiContent;
  const imageUrls = pendingImages.map(img => img.dataUrl);

  if (pendingImages.length > 0) {
    apiContent = [];
    if (text) apiContent.push({ type: 'text', text });
    for (const img of pendingImages) {
      apiContent.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
      });
    }
    appendMessage('user', text || '', imageUrls);
  } else {
    apiContent = text;
    appendMessage('user', text);
  }

  conversationHistory.push({ role: 'user', content: apiContent });

  userInput.value = '';
  userInput.style.height = 'auto';
  pendingImages = [];
  removeImagePreview();
  setLoading(true);

  const aiBubble = appendMessage('assistant', '');
  isStreaming = true;

  const port = connectPort();
  let fullReply = '';

  port.onMessage.addListener((msg) => {
    if (msg.type === 'stream_chunk') {
      fullReply += msg.text;
      aiBubble.innerHTML = renderMarkdown(fullReply);
      scrollToBottom();
    } else if (msg.type === 'stream_done') {
      isStreaming = false;
      setLoading(false);
      conversationHistory.push({ role: 'assistant', content: fullReply });
      saveCurrentChat();
      port.disconnect();
    } else if (msg.type === 'error') {
      isStreaming = false;
      setLoading(false);
      aiBubble.textContent = msg.text;
      aiBubble.classList.add('error');
      port.disconnect();
    }
  });

  port.postMessage({ type: 'STREAM_CHAT', messages: conversationHistory });
}

// --- Summarize ---
summarizeBtn.addEventListener('click', async () => {
  if (isStreaming) return;

  hideWelcome();
  summarizeBtn.disabled = true;
  summarizeBtn.innerHTML = '<span class="btn-spinner"></span> 正在摘要...';
  setLoading(true);

  let tabId = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) tabId = tab.id;
  } catch (e) {}

  const aiBubble = appendMessage('assistant', '');
  isStreaming = true;

  const port = connectPort();
  let fullReply = '';

  port.onMessage.addListener((msg) => {
    if (msg.type === 'stream_chunk') {
      fullReply += msg.text;
      aiBubble.innerHTML = renderMarkdown(fullReply);
      scrollToBottom();
    } else if (msg.type === 'stream_done') {
      isStreaming = false;
      setLoading(false);
      summarizeBtn.disabled = false;
      summarizeBtn.innerHTML = '≡ 摘要';
      conversationHistory.push({ role: 'assistant', content: fullReply });
      saveCurrentChat();
      port.disconnect();
    } else if (msg.type === 'error') {
      isStreaming = false;
      setLoading(false);
      summarizeBtn.disabled = false;
      summarizeBtn.innerHTML = '≡ 摘要';
      aiBubble.textContent = msg.text;
      aiBubble.classList.add('error');
      port.disconnect();
    }
  });

  port.postMessage({ type: 'STREAM_SUMMARIZE', tabId });
});

// --- Translate ---
translateBtn.addEventListener('click', async () => {
  if (isStreaming) return;

  const text = userInput.value.trim();
  if (!text && pendingImages.length === 0) return;

  hideWelcome();
  translateBtn.disabled = true;
  translateBtn.innerHTML = '<span class="btn-spinner"></span> 翻译中...';
  setLoading(true);

  // Build content for translation
  let apiContent;
  const imageUrls = pendingImages.map(img => img.dataUrl);

  if (pendingImages.length > 0) {
    apiContent = [];
    if (text) apiContent.push({ type: 'text', text });
    for (const img of pendingImages) {
      apiContent.push({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
      });
    }
    appendMessage('user', text || '', imageUrls);
  } else {
    apiContent = text;
    appendMessage('user', text);
  }

  conversationHistory.push({ role: 'user', content: apiContent });

  userInput.value = '';
  userInput.style.height = 'auto';
  pendingImages = [];
  removeImagePreview();

  const aiBubble = appendMessage('assistant', '');
  isStreaming = true;

  const port = connectPort();
  let fullReply = '';

  port.onMessage.addListener((msg) => {
    if (msg.type === 'stream_chunk') {
      fullReply += msg.text;
      aiBubble.innerHTML = renderMarkdown(fullReply);
      scrollToBottom();
    } else if (msg.type === 'stream_done') {
      isStreaming = false;
      setLoading(false);
      translateBtn.disabled = false;
      translateBtn.innerHTML = '文A 翻译';
      conversationHistory.push({ role: 'assistant', content: fullReply });
      saveCurrentChat();
      port.disconnect();
    } else if (msg.type === 'error') {
      isStreaming = false;
      setLoading(false);
      translateBtn.disabled = false;
      translateBtn.innerHTML = '文A 翻译';
      aiBubble.textContent = msg.text;
      aiBubble.classList.add('error');
      port.disconnect();
    }
  });

  port.postMessage({ type: 'STREAM_TRANSLATE', messages: conversationHistory });
});

// --- Helpers ---
function appendMessage(role, text, imageDataUrls) {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  if (role === 'assistant') {
    // Render markdown and add copy button
    div.innerHTML = renderMarkdown(text);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = 'Copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    });
    div.appendChild(copyBtn);
  } else if (imageDataUrls && imageDataUrls.length > 0) {
    const imgGrid = document.createElement('div');
    imgGrid.className = 'message-images';
    for (const url of imageDataUrls) {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'message-image';
      img.alt = 'Pasted image';
      imgGrid.appendChild(img);
    }
    div.appendChild(imgGrid);
    if (text) {
      const textNode = document.createElement('div');
      textNode.className = 'message-text';
      textNode.textContent = text;
      div.appendChild(textNode);
    }
  } else {
    div.textContent = text;
  }

  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function setLoading(show) {
  const existing = document.querySelector('.loading');
  if (show && !existing) {
    const div = document.createElement('div');
    div.className = 'loading';
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(div);
    scrollToBottom();
  } else if (!show && existing) {
    existing.remove();
  }
  sendBtn.disabled = show;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

function sendToBackground(msg) {
  return chrome.runtime.sendMessage(msg);
}
