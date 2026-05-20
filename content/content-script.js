chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_PAGE_CONTENT') {
    sendResponse({ content: extractPageContent() });
  }
  return true;
});

function extractPageContent() {
  const clone = document.body.cloneNode(true);
  ['script', 'style', 'nav', 'footer', 'header', 'iframe', 'svg', 'noscript', 'aside',
   '.sidebar', '.ad', '.advertisement', '.cookie-banner'].forEach(sel => {
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

  if (text.length > 8000) text = text.substring(0, 8000) + '\n\n[Content truncated...]';

  return { title: document.title, url: window.location.href, text };
}
