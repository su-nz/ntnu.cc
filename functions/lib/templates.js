/**
 * HTML 模板模組
 */

import { escapeHtml } from './utils.js';

/**
 * 基礎 HTML 模板
 * @param {Object} options 
 * @returns {string}
 */
export function baseTemplate({ title, content, styles = '', scripts = '' }) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ntnu.cc</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-tertiary: #0f3460;
      --text-primary: #eaeaea;
      --text-secondary: #a0a0a0;
      --accent: #e94560;
      --accent-hover: #ff6b6b;
      --success: #2ecc71;
      --warning: #e67e22;
      --error: #e74c3c;
      --border: #333;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
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
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
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
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }
    
    .btn:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }
    
    .btn:disabled {
      background: var(--text-secondary);
      cursor: not-allowed;
      transform: none;
    }
    
    .btn-secondary {
      background: var(--bg-tertiary);
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
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 1rem;
      margin-bottom: 1rem;
    }
    
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--accent);
    }
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      color: var(--text-secondary);
    }
    
    .alert {
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    
    .alert-success {
      background: rgba(46, 204, 113, 0.2);
      border: 1px solid var(--success);
      color: var(--success);
    }
    
    .alert-error {
      background: rgba(231, 76, 60, 0.2);
      border: 1px solid var(--error);
      color: var(--error);
    }
    
    .alert-warning {
      background: rgba(230, 126, 34, 0.2);
      border: 1px solid var(--warning);
      color: var(--warning);
    }
    
    .text-center { text-align: center; }
    .text-muted { color: var(--text-secondary); }
    .mt-1 { margin-top: 0.5rem; }
    .mt-2 { margin-top: 1rem; }
    .mt-3 { margin-top: 1.5rem; }
    .mb-1 { margin-bottom: 0.5rem; }
    .mb-2 { margin-bottom: 1rem; }
    .mb-3 { margin-bottom: 1.5rem; }
    
    ${styles}
  </style>
</head>
<body>
  ${content}
  ${scripts}
</body>
</html>`;
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
 * @returns {string}
 */
export function adminLoginPage(error = '') {
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
  
  const content = `
    <div class="container login-container">
      <div class="card login-card">
        <div class="logo">
          <h1>🔐 管理後台</h1>
          <p class="text-muted">ntnu.cc 短網址服務</p>
        </div>
        
        ${errorHtml}
        
        <form method="POST" action="/admin">
          <label for="apiKey">API Key</label>
          <input type="password" id="apiKey" name="apiKey" placeholder="請輸入管理員 API Key" required autocomplete="current-password">
          
          <button type="submit" class="btn" style="width: 100%;">登入</button>
        </form>
      </div>
    </div>
  `;
  
  return baseTemplate({ title: '管理員登入', content, styles });
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
