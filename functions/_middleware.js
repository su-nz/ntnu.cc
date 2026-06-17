/**
 * 全域中間件 - 安全標頭與錯誤處理
 */

import { getSecurityHeaders } from './lib/utils.js';
import { notifySystemError } from './lib/discord.js';

// 靜態檔案副檔名，不需要中間件處理
const STATIC_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.map', '.xml', '.txt', '.json'];

// 子網域 → public/_sites/<bucket>/ 對應表
// 注意：靜態副檔名請求（如 /assets/foo.css、/NTNU_Red.png）已在上方分支跳出，
// 不會進入此 rewrite，因此各子網域共用根目錄下的 /assets/* 與圖檔。
export const SUBDOMAIN_SITES = {
  'tools.ntnu.cc': 'tools',
};

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const host = (request.headers.get('host') || url.host || '').toLowerCase();

  // 子網域對應 bucket（靜態檔分支也會用到，故提前取得）。
  // 已避開短網址轉址（host=ntnu.cc 不會進子網域分支），所以 [id].js 行為不受影響。
  const siteBucket = SUBDOMAIN_SITES[host];

  // 靜態檔案：原則上交給 Cloudflare Pages 直接處理（子網域共用 apex 的 /assets/* 與根目錄圖檔）。
  // 但 bucket 子目錄內的靜態檔（例如 tools.ntnu.cc/deskcard/app.js）必須先導入 _sites/<bucket>/，
  // 否則會被當成 apex 路徑而 404。策略：子網域先試 bucket 內同路徑，找不到再退回共用 apex。
  const isStaticFile = STATIC_EXTENSIONS.some(ext => pathname.toLowerCase().endsWith(ext));
  if (isStaticFile) {
    // 子網域 bucket 子目錄內的靜態檔（深度 ≥ 2 且非 /assets/，例如 /deskcard/app.js）
    // 導入 _sites/<bucket>/；根目錄圖檔（/NTNU_Red.png）與 /assets/* 維持共用 apex。
    if (siteBucket && !pathname.startsWith('/assets/') && pathname.split('/').length > 2) {
      const rw = new URL(request.url);
      rw.pathname = `/_sites/${siteBucket}${pathname}`;
      return next(rw.toString());
    }
    return next();
  }

  try {
    let response;
    if (siteBucket) {
      const rewritten = new URL(request.url);
      // 目錄式 clean URL（無副檔名，如 /deskcard 或根目錄 /）→ 直接導向該目錄的 index.html。
      const trimmed = pathname.replace(/\/+$/, '');            // '' 代表根目錄
      const lastSeg = trimmed.split('/').pop();
      const isDirStyle = trimmed === '' || !lastSeg.includes('.');
      // 以結尾斜線導向目錄(與根目錄 / → /_sites/tools/ 一致,可避免 /index.html 的正規化 308)。
      rewritten.pathname = isDirStyle
        ? `/_sites/${siteBucket}${trimmed}/`
        : `/_sites/${siteBucket}${trimmed}`;
      response = await next(rewritten.toString());
    } else {
      response = await next();
    }
    
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
