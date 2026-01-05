/**
 * 全域中間件 - 安全標頭與錯誤處理
 */

import { getSecurityHeaders } from './lib/utils.js';
import { notifySystemError } from './lib/discord.js';

// 靜態檔案副檔名，不需要中間件處理
const STATIC_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.map'];

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // 跳過靜態檔案，讓 Cloudflare Pages 直接處理
  const isStaticFile = STATIC_EXTENSIONS.some(ext => pathname.toLowerCase().endsWith(ext));
  if (isStaticFile) {
    return next();
  }
  
  try {
    // 執行後續處理
    const response = await next();
    
    // 加入安全標頭
    const securityHeaders = getSecurityHeaders();
    const newHeaders = new Headers(response.headers);
    
    for (const [key, value] of Object.entries(securityHeaders)) {
      if (!newHeaders.has(key)) {
        newHeaders.set(key, value);
      }
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    // 錯誤處理
    console.error('Middleware error:', error);
    
    // 發送錯誤通知
    if (env.DISCORD_WEBHOOK_URL) {
      await notifySystemError(env.DISCORD_WEBHOOK_URL, {
        error: error.message || 'Unknown error',
        context: 'Middleware',
        path: new URL(request.url).pathname,
      });
    }
    
    // 回傳錯誤頁面
    const securityHeaders = getSecurityHeaders();
    
    return new Response(errorPageHtml(error), {
      status: 500,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...securityHeaders,
      },
    });
  }
}

/**
 * 錯誤頁面 HTML
 */
function errorPageHtml(error) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>500 - 伺服器錯誤 | ntnu.cc</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --text-primary: #eaeaea;
      --text-secondary: #a0a0a0;
      --error: #e74c3c;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .container {
      text-align: center;
      padding: 2rem;
    }
    
    .error-code {
      font-size: 6rem;
      font-weight: bold;
      color: var(--error);
      line-height: 1;
      margin-bottom: 1rem;
    }
    
    h1 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    
    p {
      color: var(--text-secondary);
      margin-bottom: 2rem;
    }
    
    .btn {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: var(--error);
      color: white;
      border-radius: 8px;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-code">500</div>
    <h1>伺服器發生錯誤</h1>
    <p>很抱歉，處理您的請求時發生了問題。請稍後再試。</p>
    <a href="/" class="btn">返回首頁</a>
  </div>
</body>
</html>`;
}
