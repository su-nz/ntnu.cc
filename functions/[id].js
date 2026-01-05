/**
 * 短碼轉址處理
 * 路由：GET/POST /{id}
 */

import { createHtmlResponse, createErrorResponse, isIpAllowed } from './lib/utils.js';
import { validateId } from './lib/validation.js';
import { checkRateLimit, updateStats } from './lib/security.js';
import { notifyAccessDenied } from './lib/discord.js';
import { 
  redirectPreviewPage,
  ipRestrictedPage, 
  notFoundPage, 
  rateLimitedPage 
} from './lib/templates.js';

// 靜態檔案副檔名，不應該被此路由處理
const STATIC_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.map', '.txt', '.xml', '.json'];

export async function onRequest(context) {
  const { request, env, params, next } = context;
  const id = params.id;
  
  // 跳過靜態檔案，讓 Cloudflare Pages 處理
  if (STATIC_EXTENSIONS.some(ext => id.toLowerCase().endsWith(ext))) {
    return next();
  }
  
  // 驗證 ID 格式
  const idValidation = validateId(id);
  if (!idValidation.valid) {
    return createHtmlResponse(notFoundPage(id), 404);
  }
  
  // 取得使用者資訊
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const country = request.headers.get('cf-ipcountry') || 'Unknown';
  const userAgent = request.headers.get('user-agent') || '';
  
  // IP 白名單檢查
  const allowedCidrs = env.ALLOWED_CIDRS || '';
  const isDev = env.DEV_MODE === 'true';
  
  // 如果設定了 IP 限制且非開發模式，則檢查
  if (!isDev && allowedCidrs && !isIpAllowed(ip, allowedCidrs)) {
    // 記錄存取被拒
    await notifyAccessDenied(env.DISCORD_WEBHOOK_URL, {
      reason: 'IP not in allowed CIDR range',
      ip,
      country,
      userAgent,
      path: `/${id}`,
    });
    
    return createHtmlResponse(ipRestrictedPage(), 200);
  }
  
  // 只處理 GET 請求（不再需要 POST 驗證）
  if (request.method === 'GET') {
    return handleGet(context, id, ip, country);
  }
  
  return createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED', 405);
}

/**
 * 處理 GET 請求 - 顯示跳轉預覽頁面
 */
async function handleGet(context, id, ip, country) {
  const { env, request } = context;
  
  // 速率限制檢查
  const rateLimit = await checkRateLimit(env.LINKS_KV, ip, 'redirect', 60, 60);
  if (!rateLimit.allowed) {
    const retryAfter = rateLimit.resetAt - Date.now();
    return createHtmlResponse(rateLimitedPage(retryAfter), 429);
  }
  
  // 嘗試從 Cache API 讀取（快取 5 分鐘）
  const cacheKey = new URL(`https://cache.ntnu.cc/link/${id}`, request.url);
  const cache = caches.default;
  let cachedResponse = await cache.match(cacheKey);
  
  let targetUrl;
  let disabled = false;
  
  if (cachedResponse) {
    // 從快取讀取
    const cachedData = await cachedResponse.json();
    targetUrl = cachedData.targetUrl;
    disabled = cachedData.disabled || false;
  } else {
    // 從 KV 讀取（使用 getWithMetadata 一次讀取）
    const { value, metadata } = await env.LINKS_KV.getWithMetadata(`link:${id}`);
    targetUrl = value;
    disabled = metadata?.disabled || false;
    
    if (targetUrl) {
      // 快取結果（5 分鐘）
      const cacheData = { targetUrl, disabled };
      const cacheResponse = new Response(JSON.stringify(cacheData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300', // 5 分鐘
        },
      });
      context.waitUntil(cache.put(cacheKey, cacheResponse));
    }
  }
  
  if (!targetUrl || disabled) {
    return createHtmlResponse(notFoundPage(id), 404);
  }
  
  // 更新統計資料（非同步，不阻塞回應）
  context.waitUntil(updateStats(env.LINKS_KV, id, country));
  
  // 顯示跳轉預覽頁面（不需要 CAPTCHA）
  return createHtmlResponse(redirectPreviewPage({ id, targetUrl }));
}