/**
 * 短碼轉址處理
 * 路由：GET/POST /{id}
 */

import { createHtmlResponse, createErrorResponse, isIpAllowed } from './lib/utils.js';
import { validateId, verifyTurnstile } from './lib/validation.js';
import { checkRateLimit, updateStats } from './lib/security.js';
import { notifyAccessDenied } from './lib/discord.js';
import { 
  captchaPage, 
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
  
  // 如果設定了 IP 限制，則檢查
  if (allowedCidrs && !isIpAllowed(ip, allowedCidrs)) {
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
  
  // 根據請求方法處理
  if (request.method === 'GET') {
    return handleGet(context, id, ip, country);
  } else if (request.method === 'POST') {
    return handlePost(context, id, ip, country);
  }
  
  return createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED', 405);
}

/**
 * 處理 GET 請求 - 顯示 CAPTCHA 頁面
 */
async function handleGet(context, id, ip, country) {
  const { env } = context;
  
  // 速率限制檢查
  const rateLimit = await checkRateLimit(env.LINKS_KV, ip, 'redirect', 60, 60);
  if (!rateLimit.allowed) {
    const retryAfter = rateLimit.resetAt - Date.now();
    return createHtmlResponse(rateLimitedPage(retryAfter), 429);
  }
  
  // 檢查短碼是否存在
  const targetUrl = await env.LINKS_KV.get(`link:${id}`);
  if (!targetUrl) {
    return createHtmlResponse(notFoundPage(id), 404);
  }
  
  // 檢查是否被停用
  const disabled = await env.LINKS_KV.get(`disabled:${id}`);
  if (disabled) {
    return createHtmlResponse(notFoundPage(id), 404);
  }
  
  // 顯示 CAPTCHA 頁面
  const turnstileSiteKey = env.TURNSTILE_SITE_KEY || '';
  
  if (!turnstileSiteKey) {
    // 如果未設定 Turnstile，直接跳轉（不建議）
    await updateStats(env.LINKS_KV, id, country);
    return Response.redirect(targetUrl, 302);
  }
  
  return createHtmlResponse(captchaPage({ id, turnstileSiteKey }));
}

/**
 * 處理 POST 請求 - 驗證 CAPTCHA 後跳轉
 */
async function handlePost(context, id, ip, country) {
  const { request, env } = context;
  
  // 速率限制檢查
  const rateLimit = await checkRateLimit(env.LINKS_KV, ip, 'captcha', 20, 60);
  if (!rateLimit.allowed) {
    const retryAfter = rateLimit.resetAt - Date.now();
    return createHtmlResponse(rateLimitedPage(retryAfter), 429);
  }
  
  // 解析表單資料
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return createErrorResponse('Invalid form data', 'INVALID_REQUEST', 400);
  }
  
  // 取得 Turnstile Token
  const turnstileToken = formData.get('cf-turnstile-response');
  const turnstileSecret = env.TURNSTILE_SECRET;
  
  // 驗證 Turnstile
  if (turnstileSecret) {
    const verification = await verifyTurnstile(turnstileToken, turnstileSecret, ip);
    if (!verification.success) {
      // 重新顯示 CAPTCHA 頁面
      return createHtmlResponse(captchaPage({ 
        id, 
        turnstileSiteKey: env.TURNSTILE_SITE_KEY,
        error: '驗證失敗，請重試',
      }));
    }
  }
  
  // 檢查短碼是否存在
  const targetUrl = await env.LINKS_KV.get(`link:${id}`);
  if (!targetUrl) {
    return createHtmlResponse(notFoundPage(id), 404);
  }
  
  // 檢查是否被停用
  const disabled = await env.LINKS_KV.get(`disabled:${id}`);
  if (disabled) {
    return createHtmlResponse(notFoundPage(id), 404);
  }
  
  // 更新統計
  await updateStats(env.LINKS_KV, id, country);
  
  // 執行 302 跳轉
  return Response.redirect(targetUrl, 302);
}
