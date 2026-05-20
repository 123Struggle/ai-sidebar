chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// --- Port-based streaming ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-sidebar') return;

  port.onMessage.addListener(async (message) => {
    try {
      switch (message.type) {
        case 'STREAM_CHAT': {
          const { apiKey, modelId, endpointUrl, systemPrompt } = await chrome.storage.local.get(['apiKey', 'modelId', 'endpointUrl', 'systemPrompt']);
          if (!apiKey || !endpointUrl) {
            port.postMessage({ type: 'error', text: '请先在设置中配置 API Key 和 Endpoint URL' });
            break;
          }
          // Prepend system prompt if configured
          let msgs = message.messages;
          if (systemPrompt && systemPrompt.trim()) {
            msgs = [{ role: 'system', content: systemPrompt.trim() }, ...msgs];
          }
          await streamAPI(msgs, apiKey, modelId, endpointUrl, port);
          break;
        }
        case 'STREAM_SUMMARIZE': {
          const settings = await chrome.storage.local.get(['apiKey', 'modelId', 'endpointUrl']);
          if (!settings.apiKey || !settings.endpointUrl) {
            port.postMessage({ type: 'error', text: '请先在设置中配置 API Key 和 Endpoint URL' });
            break;
          }

          let tab;
          if (message.tabId) {
            tab = await chrome.tabs.get(message.tabId).catch(() => null);
          }
          if (!tab) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            tab = activeTab;
          }
          if (!tab) {
            port.postMessage({ type: 'error', text: '无法获取当前标签页' });
            break;
          }

          if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
            port.postMessage({ type: 'error', text: '无法提取此页面内容（Chrome 内部页面不支持）' });
            break;
          }

          let pageContent;
          try {
            const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_CONTENT' });
            pageContent = response.content;
          } catch (e) {
            try {
              await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content-script.js'] });
              await new Promise(r => setTimeout(r, 100));
              const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_CONTENT' });
              pageContent = response.content;
            } catch (e2) {
              try {
                const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageContentInline });
                pageContent = results[0].result;
              } catch (e3) {
                const errMsg = e3.message || '未知错误';
                if (errMsg.includes('extensions gallery')) {
                  port.postMessage({ type: 'error', text: 'Chrome 扩展商店页面不支持摘要' });
                } else {
                  port.postMessage({ type: 'error', text: `无法提取此页面内容: ${errMsg}` });
                }
                break;
              }
            }
          }

          if (!pageContent || !pageContent.text) {
            port.postMessage({ type: 'error', text: '页面内容为空' });
            break;
          }

          const summaryMessages = [
            {
              role: 'system',
              content: '你是一个专业的网页内容总结助手。请用中文对以下网页内容进行清晰、简洁的总结。包含主要观点、关键论据和重要细节。使用 markdown 格式提升可读性。无论原文是什么语言，你都必须使用中文回复。'
            },
            {
              role: 'user',
              content: `Page title: ${pageContent.title}\nPage URL: ${pageContent.url}\n\nContent:\n${pageContent.text}`
            }
          ];

          await streamAPI(summaryMessages, settings.apiKey, settings.modelId, settings.endpointUrl, port);
          break;
        }
        case 'STREAM_TRANSLATE': {
          const { apiKey, modelId, endpointUrl } = await chrome.storage.local.get(['apiKey', 'modelId', 'endpointUrl']);
          if (!apiKey || !endpointUrl) {
            port.postMessage({ type: 'error', text: '请先在设置中配置 API Key 和 Endpoint URL' });
            break;
          }
          // Translation mode: ignore user's system prompt, use dedicated translation instruction
          const translateMsgs = [
            {
              role: 'system',
              content: '你是一个专业的翻译助手。请翻译用户发送的内容（文字和图片中的文字）。规则：1. 如果原文是中文，翻译为英文；如果原文是其他语言，翻译为中文。2. 保持原文的格式和语气。3. 如果是图片，请识别并翻译图片中的文字内容，先给出翻译结果，再简要描述图片内容。4. 只输出翻译结果，不要添加额外的问候或说明。'
            },
            ...message.messages
          ];
          await streamAPI(translateMsgs, apiKey, modelId, endpointUrl, port);
          break;
        }
      }
    } catch (err) {
      port.postMessage({ type: 'error', text: err.message || 'Unknown error' });
    }
  });
});

// --- Message-based API (settings, history) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_SETTINGS': {
          const data = await chrome.storage.local.get(['apiKey', 'modelId', 'endpointUrl', 'systemPrompt', 'theme']);
          sendResponse({
            apiKey: data.apiKey || '',
            modelId: data.modelId || '',
            endpointUrl: data.endpointUrl || '',
            systemPrompt: data.systemPrompt || '',
            theme: data.theme || 'auto'
          });
          break;
        }
        case 'SAVE_SETTINGS': {
          await chrome.storage.local.set({
            apiKey: message.apiKey,
            modelId: message.modelId,
            endpointUrl: message.endpointUrl,
            systemPrompt: message.systemPrompt || '',
            theme: message.theme || 'auto'
          });
          sendResponse({ success: true });
          break;
        }
        case 'GET_CHATS': {
          const data = await chrome.storage.local.get(['allChats']);
          sendResponse({ chats: data.allChats || [] });
          break;
        }
        case 'SAVE_CHATS': {
          await chrome.storage.local.set({ allChats: message.chats });
          sendResponse({ success: true });
          break;
        }
        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ error: err.message || 'Unknown error' });
    }
  })();
  return true;
});

// --- Streaming API call ---
async function streamAPI(messages, apiKey, modelId, endpointUrl, port) {
  let url = endpointUrl.trim();
  if (url.endsWith('/')) url = url.slice(0, -1);
  if (!url.endsWith('/chat/completions')) {
    if (url.endsWith('/v1')) {
      url += '/chat/completions';
    } else if (!url.includes('/chat/completions')) {
      url += '/v1/chat/completions';
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages: messages,
      stream: true
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') {
        port.postMessage({ type: 'stream_done' });
        return;
      }
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          port.postMessage({ type: 'stream_chunk', text: delta });
        }
      } catch (e) {
        // skip malformed JSON lines
      }
    }
  }

  port.postMessage({ type: 'stream_done' });
}

function extractPageContentInline() {
  const clone = document.body.cloneNode(true);
  const removeSelectors = [
    'script', 'style', 'nav', 'footer', 'header',
    'iframe', 'svg', 'noscript', 'aside',
    '.sidebar', '.ad', '.advertisement', '.cookie-banner'
  ];
  removeSelectors.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  const mainContent =
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('.content') ||
    document.querySelector('#content') ||
    document.body;

  let text = mainContent.innerText || mainContent.textContent || '';
  text = text.replace(/\s+/g, ' ').trim();

  const MAX_CHARS = 8000;
  if (text.length > MAX_CHARS) {
    text = text.substring(0, MAX_CHARS) + '\n\n[Content truncated...]';
  }

  return { title: document.title, url: window.location.href, text };
}
