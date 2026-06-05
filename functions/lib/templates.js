/**
 * HTML 模板模組
 */

import { escapeHtml } from './utils.js';

/**
 * 基礎 HTML 模板
 * @param {Object} options 
 * @returns {string}
 */
export function baseTemplate({ title, content, styles = '', scripts = '', meta = {} }) {
  const ogTags = meta.og ? `
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${escapeHtml(meta.og.type || 'website')}">
  <meta property="og:url" content="${escapeHtml(meta.og.url || 'https://ntnu.cc/')}">
  <meta property="og:title" content="${escapeHtml(meta.og.title || title)}">
  <meta property="og:description" content="${escapeHtml(meta.og.description || '')}">
  <meta property="og:image" content="${escapeHtml(meta.og.image || 'https://ntnu.cc/og-image.png')}">
  <meta property="og:locale" content="zh_TW">
  <meta property="og:site_name" content="ntnu.cc">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${escapeHtml(meta.og.url || 'https://ntnu.cc/')}">
  <meta name="twitter:title" content="${escapeHtml(meta.og.title || title)}">
  <meta name="twitter:description" content="${escapeHtml(meta.og.description || '')}">
  <meta name="twitter:image" content="${escapeHtml(meta.og.image || 'https://ntnu.cc/og-image.png')}">
  ` : '';
  
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <script>
    (function() {
      var t = localStorage.getItem('theme') || 'auto';
      var r = t === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : t;
      document.documentElement.setAttribute('data-theme', r);
      var c = localStorage.getItem('color') || 'blue';
      document.documentElement.setAttribute('data-color', c);
    })();
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ntnu.cc</title>
  ${ogTags}
  <link rel="icon" type="image/png" href="/NTNU_Blue.png">
  <style>
    :root, [data-color="blue"] {
      --primary: #2E3192;
      --primary-dark: #1A1D5C;
      --primary-light: #5255B0;
      --bg-gradient: linear-gradient(135deg, #2E3192 0%, #3D40A0 50%, #5255B0 100%);
      --bg-white: #ffffff;
      --bg-light: #F2F3FB;
      --text-primary: #1a1a2e;
      --text-secondary: #4a5568;
      --text-muted: #718096;
      --accent: #2E3192;
      --accent-hover: #5255B0;
      --success: #10b981;
      --warning: #f59e0b;
      --error: #ef4444;
      --border: #e2e8f0;
      --shadow-sm: 0 1px 2px rgba(46, 49, 146, 0.08);
      --shadow-md: 0 4px 6px -1px rgba(46, 49, 146, 0.12);
      --shadow-lg: 0 10px 15px -3px rgba(46, 49, 146, 0.12);
    }

    [data-color="red"] {
      --primary: #9B2335;
      --primary-dark: #7A1C2A;
      --primary-light: #C94C5C;
      --bg-gradient: linear-gradient(135deg, #9B2335 0%, #B83A4B 50%, #C94C5C 100%);
      --accent: #9B2335;
      --accent-hover: #C94C5C;
      --shadow-sm: 0 1px 2px rgba(155, 35, 53, 0.08);
      --shadow-md: 0 4px 6px -1px rgba(155, 35, 53, 0.12);
      --shadow-lg: 0 10px 15px -3px rgba(155, 35, 53, 0.12);
    }

    [data-color="blue"][data-theme="dark"] {
      --primary: #7A7DC4;
      --primary-dark: #5255B0;
      --primary-light: #9B9EE0;
      --accent: #7A7DC4;
      --accent-hover: #9B9EE0;
    }

    [data-color="red"][data-theme="dark"] {
      --primary: #D67485;
      --primary-dark: #C94C5C;
      --primary-light: #E59DA8;
      --accent: #D67485;
      --accent-hover: #E59DA8;
    }

    [data-theme="dark"] {
      --bg-gradient: linear-gradient(135deg, #0a0f1a 0%, #111827 50%, #1a2332 100%);
      --bg-white: #1a1f2e;
      --bg-light: #0f1420;
      --text-primary: #e8eaed;
      --text-secondary: #b4b7bd;
      --text-muted: #8a8d93;
      --success: #3ecf8e;
      --warning: #f5b342;
      --error: #f56565;
      --border: #2d3340;
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
    }

    [data-theme="dark"] body {
      background: var(--bg-light);
      color: var(--text-primary);
    }

    [data-theme="dark"] .preview-card,
    [data-theme="dark"] .card {
      background: var(--bg-white);
      color: var(--text-primary);
    }

    [data-theme="dark"] .target-url-box {
      background: var(--bg-light);
      border-color: var(--border);
    }

    [data-theme="dark"] .target-url-box a,
    [data-theme="dark"] .preview-card h1,
    [data-theme="dark"] .preview-card > p strong,
    [data-theme="dark"] .countdown strong {
      color: var(--primary);
    }

    [data-theme="dark"] .lang-switch {
      background: rgba(26, 31, 46, 0.9);
      border-color: var(--border);
      color: var(--text-secondary);
    }

    [data-theme="dark"] .lang-switch:hover {
      border-color: var(--primary);
      color: var(--primary);
    }

    [data-theme="dark"] .btn-secondary {
      background: var(--bg-white);
      color: var(--text-secondary);
      border-color: var(--border);
    }

    [data-theme="dark"] input,
    [data-theme="dark"] textarea,
    [data-theme="dark"] select {
      background: var(--bg-white);
      color: var(--text-primary);
      border-color: var(--border);
    }

    [data-theme="dark"] .notice {
      color: var(--text-muted);
    }

    /* Dark mode for redirect page background */
    [data-theme="dark"] body {
      background: var(--bg-gradient);
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--bg-light);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      flex: 1;
    }
    
    .card {
      background: var(--bg-white);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2rem;
      box-shadow: var(--shadow-lg);
    }
    
    h1, h2, h3 {
      color: var(--text-primary);
      margin-bottom: 1rem;
    }
    
    h1 { font-size: 2rem; }
    h2 { font-size: 1.5rem; }
    h3 { font-size: 1.25rem; }
    
    p {
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 1rem;
    }
    
    a {
      color: var(--accent);
      text-decoration: none;
      transition: color 0.2s;
    }
    
    a:hover {
      color: var(--accent-hover);
    }
    
    .btn {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: var(--bg-gradient);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
    }
    
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
      color: white;
    }
    
    .btn:disabled {
      background: var(--text-muted);
      cursor: not-allowed;
      transform: none;
    }
    
    .btn-secondary {
      background: var(--bg-white);
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }
    
    .btn-secondary:hover {
      border-color: var(--primary);
      color: var(--primary);
      background: var(--bg-white);
    }
    
    .btn-success {
      background: var(--success);
    }
    
    .btn-danger {
      background: var(--error);
    }
    
    input, textarea, select {
      width: 100%;
      padding: 0.75rem;
      background: var(--bg-white);
      border: 2px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 1rem;
      margin-bottom: 1rem;
    }
    
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--primary);
    }
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      color: var(--text-secondary);
      font-weight: 500;
    }
    
    .alert {
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    
    .alert-success {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid var(--success);
      color: var(--success);
    }
    
    .alert-error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--error);
      color: var(--error);
    }
    
    .alert-warning {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid var(--warning);
      color: var(--warning);
    }
    
    .text-center { text-align: center; }
    .text-muted { color: var(--text-muted); }
    .mt-1 { margin-top: 0.5rem; }
    .mt-2 { margin-top: 1rem; }
    .mt-3 { margin-top: 1.5rem; }
    .mb-1 { margin-bottom: 0.5rem; }
    .mb-2 { margin-bottom: 1rem; }
    .mb-3 { margin-bottom: 1.5rem; }
    
    ${styles}
  </style>
  <script>
    (function() {
      var t = localStorage.getItem('theme') || 'auto';
      var r = t === 'auto' 
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : t;
      document.documentElement.setAttribute('data-theme', r);
    })();
  </script>
</head>
<body>
  ${content}
  ${scripts}
</body>
</html>`;
}

/**
 * 跳轉預覽頁面（顯示目標網址，自動跳轉）
 * @param {Object} options 
 * @returns {string}
 */
export function redirectPreviewPage({ id, targetUrl }) {
  const styles = `
    body {
      background: var(--bg-gradient);
    }
    
    .preview-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    
    .preview-card {
      max-width: 500px;
      text-align: center;
      background: var(--bg-white);
      border-radius: 16px;
      padding: 2.5rem;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    }
    
    .preview-card h1 {
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    
    .preview-card h1 img {
      width: 36px;
      height: 36px;
    }

    [data-color="red"] .preview-card h1 img.logo-blue {
      display: none;
    }
    [data-color="blue"] .preview-card h1 img.logo-red,
    :root:not([data-color="red"]) .preview-card h1 img.logo-red {
      display: none;
    }
    
    .preview-card > p {
      color: var(--text-secondary);
      margin-bottom: 0;
    }
    
    .preview-card > p strong {
      color: var(--primary);
    }
    
    .target-url-box {
      background: var(--bg-light);
      border: 2px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin: 1.5rem 0;
      word-break: break-all;
    }
    
    .target-url-box a {
      color: var(--primary);
      font-size: 0.95rem;
      font-weight: 500;
    }
    
    .countdown {
      font-size: 1rem;
      color: var(--text-secondary);
      margin-bottom: 1.5rem;
    }
    
    .countdown strong {
      color: var(--primary);
      font-size: 1.5rem;
      font-weight: 700;
    }
    
    .btn-group {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .btn-group .btn {
      min-width: 120px;
    }
    
    .btn-secondary {
      background: var(--bg-white);
      color: var(--text-secondary);
      border: 2px solid var(--border);
    }
    
    .btn-secondary:hover {
      border-color: var(--primary);
      color: var(--primary);
      background: var(--bg-white);
      transform: translateY(-2px);
    }
    
    .notice {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 1.5rem;
      margin-bottom: 0;
    }
    
    .lang-switch {
      position: fixed;
      top: 1rem;
      right: 1rem;
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
      cursor: pointer;
      background: rgba(255,255,255,0.9);
      backdrop-filter: blur(10px);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-secondary);
      font-weight: 600;
    }
    
    .lang-switch:hover {
      border-color: var(--primary);
      color: var(--primary);
    }
    
    .theme-toggle {
      position: fixed;
      top: 1rem;
      right: 4.5rem;
      display: flex;
      gap: 0;
      background: rgba(255,255,255,0.9);
      backdrop-filter: blur(10px);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }

    .theme-toggle button {
      padding: 0.5rem 0.6rem;
      font-size: 0.85rem;
      cursor: pointer;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-weight: 600;
      transition: all 0.2s;
    }

    .theme-toggle button:hover {
      color: var(--primary);
    }

    .theme-toggle button.active {
      background: var(--primary);
      color: white;
    }

    [data-theme="dark"] .theme-toggle {
      background: rgba(26, 31, 46, 0.9);
      border-color: var(--border);
    }

    .color-toggle {
      position: fixed;
      top: 1rem;
      right: 11.5rem;
      display: flex;
      gap: 0;
      background: rgba(255,255,255,0.9);
      backdrop-filter: blur(10px);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }

    .color-toggle button {
      padding: 0.5rem 0.6rem;
      font-size: 0.85rem;
      cursor: pointer;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-weight: 600;
      transition: all 0.2s;
    }

    .color-toggle button:hover {
      color: var(--primary);
    }

    .color-toggle button.active {
      background: var(--primary);
      color: white;
    }

    [data-theme="dark"] .color-toggle {
      background: rgba(26, 31, 46, 0.9);
      border-color: var(--border);
    }
    
    @media (max-width: 600px) {
      .preview-card {
        padding: 1.5rem;
      }
      
      .btn-group {
        flex-direction: column;
      }
      
      .btn-group .btn {
        width: 100%;
      }
    }
  `;
  
  const content = `
    <div class="color-toggle">
      <button data-color-option="blue" title="NTNU Blue" onclick="setColor('blue')">🔵</button>
      <button data-color-option="red" title="NTNU Red" onclick="setColor('red')">🔴</button>
    </div>
    <div class="theme-toggle">
      <button data-theme-option="light" title="Light" onclick="setTheme('light')">☀️</button>
      <button data-theme-option="auto" title="Auto" onclick="setTheme('auto')">🖥️</button>
      <button data-theme-option="dark" title="Dark" onclick="setTheme('dark')">🌙</button>
    </div>
    <button class="lang-switch" onclick="toggleLang()" id="langBtn">EN</button>
    <div class="preview-container">
      <div class="preview-card">
        <h1><img src="/NTNU_Blue.png" alt="" class="logo-blue"><img src="/NTNU_Red.png" alt="" class="logo-red"> ntnu.cc</h1>
        <p><span data-i18n="desc">短網址</span> <strong>${escapeHtml(id)}</strong> <span data-i18n="redirectTo">即將帶您前往：</span></p>
        
        <div class="target-url-box">
          <a href="${escapeHtml(targetUrl)}" id="targetLink">${escapeHtml(targetUrl)}</a>
        </div>
        
        <p class="countdown">
          <strong id="countdown">6</strong> <span data-i18n="seconds">秒後自動跳轉</span>
        </p>
        
        <div class="btn-group">
          <a href="${escapeHtml(targetUrl)}" class="btn" id="goBtn" data-i18n="go">立即前往</a>
          <a href="/" class="btn btn-secondary" data-i18n="cancel">取消</a>
        </div>
      </div>
    </div>
  `;
  
  const scripts = `
    <script>
      const i18n = {
        'zh-TW': {
          desc: '短網址',
          redirectTo: '即將帶您前往：',
          seconds: '秒後自動跳轉',
          go: '立即前往',
          cancel: '取消'
        },
        'en': {
          desc: 'Short URL',
          redirectTo: 'is redirecting you to:',
          seconds: 'seconds until redirect',
          go: 'Go Now',
          cancel: 'Cancel'
        }
      };
      
      let currentLang = localStorage.getItem('lang') || (navigator.language.startsWith('zh') ? 'zh-TW' : 'en');
      
      function applyLang(lang) {
        currentLang = lang;
        localStorage.setItem('lang', lang);
        document.getElementById('langBtn').textContent = lang === 'zh-TW' ? 'EN' : '中';
        document.querySelectorAll('[data-i18n]').forEach(el => {
          const key = el.getAttribute('data-i18n');
          if (i18n[lang][key]) el.textContent = i18n[lang][key];
        });
      }
      
      function toggleLang() {
        applyLang(currentLang === 'zh-TW' ? 'en' : 'zh-TW');
      }
      
      // 初始化語言
      applyLang(currentLang);
      
      // 倒數計時
      let seconds = 6;
      const countdownEl = document.getElementById('countdown');
      const targetUrl = document.getElementById('targetLink').href;
      
      const timer = setInterval(() => {
        seconds--;
        countdownEl.textContent = seconds;
        
        if (seconds <= 0) {
          clearInterval(timer);
          window.location.href = targetUrl;
        }
      }, 1000);

      // Theme toggle
      function getResolvedTheme(theme) {
        if (theme === 'auto') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return theme;
      }

      function setTheme(theme) {
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', getResolvedTheme(theme));
        document.querySelectorAll('[data-theme-option]').forEach(function(btn) {
          btn.classList.toggle('active', btn.getAttribute('data-theme-option') === theme);
        });
      }

      // Init theme toggle state
      (function() {
        var currentTheme = localStorage.getItem('theme') || 'auto';
        document.querySelectorAll('[data-theme-option]').forEach(function(btn) {
          btn.classList.toggle('active', btn.getAttribute('data-theme-option') === currentTheme);
        });
        var currentColor = localStorage.getItem('color') || 'blue';
        document.querySelectorAll('[data-color-option]').forEach(function(btn) {
          btn.classList.toggle('active', btn.getAttribute('data-color-option') === currentColor);
        });
      })();

      function setColor(color) {
        localStorage.setItem('color', color);
        document.documentElement.setAttribute('data-color', color);
        document.querySelectorAll('[data-color-option]').forEach(function(btn) {
          btn.classList.toggle('active', btn.getAttribute('data-color-option') === color);
        });
      }

      // Listen for system theme changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
        var theme = localStorage.getItem('theme') || 'auto';
        if (theme === 'auto') {
          document.documentElement.setAttribute('data-theme', getResolvedTheme('auto'));
        }
      });
    </script>
  `;
  
  // 截斷目標 URL 顯示（太長的話）
  const displayUrl = targetUrl.length > 50 ? targetUrl.substring(0, 50) + '...' : targetUrl;
  
  // OG Meta 資訊
  const meta = {
    og: {
      type: 'website',
      url: `https://ntnu.cc/${id}`,
      title: `前往 ${id} - ntnu.cc`,
      description: `ntnu.cc 短網址 ${id} 即將帶您前往：${displayUrl}`,
      image: 'https://ntnu.cc/og-image.png'
    }
  };
  
  return baseTemplate({ title: `前往 ${id}`, content, styles, scripts, meta });
}

/**
 * CAPTCHA 驗證頁面
 * @param {Object} options 
 * @returns {string}
 */
export function captchaPage({ id, turnstileSiteKey }) {
  const styles = `
    .captcha-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    
    .captcha-card {
      max-width: 400px;
      text-align: center;
    }
    
    .captcha-widget {
      margin: 1.5rem 0;
      display: flex;
      justify-content: center;
    }
    
    .redirect-info {
      font-size: 0.9rem;
      color: var(--text-secondary);
    }
    
    .loader {
      display: none;
      width: 40px;
      height: 40px;
      border: 4px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 1rem auto;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  
  const content = `
    <div class="container captcha-container">
      <div class="card captcha-card">
        <h1>🔗 ntnu.cc</h1>
        <p>正在前往短網址 <strong>${escapeHtml(id)}</strong></p>
        <p class="redirect-info">請完成驗證以繼續</p>
        
        <form id="captchaForm" method="POST" action="/${escapeHtml(id)}">
          <div class="captcha-widget">
            <div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}" data-callback="onCaptchaSuccess"></div>
          </div>
          <div class="loader" id="loader"></div>
          <button type="submit" class="btn" id="submitBtn" disabled>驗證中...</button>
        </form>
        
        <p class="mt-3 text-muted" style="font-size: 0.8rem;">
          本服務僅供師大校園網路使用
        </p>
      </div>
    </div>
  `;
  
  const scripts = `
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <script>
      function onCaptchaSuccess(token) {
        document.getElementById('submitBtn').disabled = false;
        document.getElementById('submitBtn').textContent = '繼續前往';
      }
      
      document.getElementById('captchaForm').addEventListener('submit', function(e) {
        document.getElementById('submitBtn').disabled = true;
        document.getElementById('submitBtn').textContent = '正在跳轉...';
        document.getElementById('loader').style.display = 'block';
      });
    </script>
  `;
  
  return baseTemplate({ title: `前往 ${id}`, content, styles, scripts });
}

/**
 * IP 限制頁面
 * @returns {string}
 */
export function ipRestrictedPage() {
  const styles = `
    .restricted-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    
    .restricted-card {
      max-width: 500px;
      text-align: center;
    }
    
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
  `;
  
  const content = `
    <div class="container restricted-container">
      <div class="card restricted-card">
        <div class="icon">🏫</div>
        <h1>存取限制</h1>
        <p>此短網址服務僅限於<strong>國立臺灣師範大學校園網路</strong>內使用。</p>
        <p>請確認您已連接至師大校園網路或 VPN 後再試。</p>
        <div class="mt-3">
          <a href="https://www.ntnu.edu.tw" class="btn btn-secondary">前往師大官網</a>
        </div>
      </div>
    </div>
  `;
  
  return baseTemplate({ title: '存取限制', content, styles });
}

/**
 * 404 頁面
 * @param {string} id 
 * @returns {string}
 */
export function notFoundPage(id) {
  const styles = `
    .notfound-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    
    .notfound-card {
      max-width: 500px;
      text-align: center;
    }
    
    .error-code {
      font-size: 6rem;
      font-weight: bold;
      color: var(--accent);
      line-height: 1;
    }
  `;
  
  const content = `
    <div class="container notfound-container">
      <div class="card notfound-card">
        <div class="error-code">404</div>
        <h1>找不到此短網址</h1>
        <p>短網址 <strong>${escapeHtml(id)}</strong> 不存在或已被移除。</p>
        <p>請確認網址是否正確，或聯繫短網址提供者。</p>
      </div>
    </div>
  `;
  
  return baseTemplate({ title: '找不到頁面', content, styles });
}

/**
 * 速率限制頁面
 * @param {number} retryAfter 
 * @returns {string}
 */
export function rateLimitedPage(retryAfter) {
  const styles = `
    .ratelimit-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    
    .ratelimit-card {
      max-width: 500px;
      text-align: center;
    }
    
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    
    .countdown {
      font-size: 2rem;
      font-weight: bold;
      color: var(--warning);
    }
  `;
  
  const content = `
    <div class="container ratelimit-container">
      <div class="card ratelimit-card">
        <div class="icon">⏱️</div>
        <h1>請求過於頻繁</h1>
        <p>您的請求次數已達上限，請稍後再試。</p>
        <p class="countdown" id="countdown">${Math.ceil(retryAfter / 1000)} 秒</p>
        <p class="text-muted">頁面將在倒數結束後自動重新整理</p>
      </div>
    </div>
  `;
  
  const scripts = `
    <script>
      let remaining = ${Math.ceil(retryAfter / 1000)};
      const countdown = document.getElementById('countdown');
      
      const timer = setInterval(() => {
        remaining--;
        countdown.textContent = remaining + ' 秒';
        
        if (remaining <= 0) {
          clearInterval(timer);
          location.reload();
        }
      }, 1000);
    </script>
  `;
  
  return baseTemplate({ title: '請求限制', content, styles, scripts });
}

/**
 * 管理員登入頁面
 * @param {string} error 
 * @param {string} captchaSiteKey 
 * @returns {string}
 */
export function adminLoginPage(error = '', captchaSiteKey = '') {
  const styles = `
    .login-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    
    .login-card {
      max-width: 400px;
      width: 100%;
    }
    
    .logo {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .logo h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }
  `;

  const errorHtml = error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : '';

  const captchaScript = `<script src="https://www.google.com/recaptcha/api.js" async defer></script>`;

  const content = `
    <div class="container login-container">
      <div class="card login-card">
        <div class="logo">
          <h1>🔒 管理後台</h1>
          <p class="text-muted">ntnu.cc 短網址服務</p>
        </div>
        
        ${errorHtml}
        
        <form method="POST" action="/admin" id="loginForm">
          <label for="apiKey">API Key</label>
          <input type="password" id="apiKey" name="apiKey" placeholder="請輸入管理員 API Key" required autocomplete="current-password">
          
          <div class="g-recaptcha" data-sitekey="${escapeHtml(captchaSiteKey)}" data-callback="onCaptchaSuccess"></div>
          <input type="hidden" id="captchaToken" name="captchaToken">
          
          <button type="submit" class="btn" style="width: 100%;">登入</button>
        </form>
        
        <script>
          function onCaptchaSuccess(token) {
            document.getElementById('captchaToken').value = token;
          }
          
          document.getElementById('loginForm').addEventListener('submit', function(e) {
            const token = document.getElementById('captchaToken').value;
            if (!token) {
              e.preventDefault();
              alert('請完成 CAPTCHA 驗證');
              return false;
            }
          });
        </script>
      </div>
    </div>
  `;

  return baseTemplate({ title: '管理員登入', content, styles }) + captchaScript;
}

/**
 * 錯誤頁面
 * @param {string} title 
 * @param {string} message 
 * @param {number} statusCode 
 * @returns {string}
 */
export function errorPage(title, message, statusCode = 500) {
  const styles = `
    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    
    .error-card {
      max-width: 500px;
      text-align: center;
    }
    
    .error-code {
      font-size: 4rem;
      font-weight: bold;
      color: var(--error);
    }
  `;
  
  const content = `
    <div class="container error-container">
      <div class="card error-card">
        <div class="error-code">${statusCode}</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        <div class="mt-3">
          <a href="/" class="btn btn-secondary">返回首頁</a>
        </div>
      </div>
    </div>
  `;
  
  return baseTemplate({ title, content, styles });
}
