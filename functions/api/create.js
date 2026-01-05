/**
 * 建立短網址 API
 * 路由：POST /api/create
 */

import { createResponse, createErrorResponse, generateRandomId } from '../lib/utils.js';
import { validateUrl, validateId, validateApiKey, isBlockedDomain } from '../lib/validation.js';
import { checkRateLimit, checkIpLockout, recordFailedAttempt, clearFailedAttempts } from '../lib/security.js';
import { notifyLinkCreated, notifyAccessDenied, notifyBlockedDomain } from '../lib/discord.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  
  // 取得使用者資訊
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const country = request.headers.get('cf-ipcountry') || 'Unknown';
  const userAgent = request.headers.get('user-agent') || '';
  
  // 檢查 IP 鎖定
  const lockout = await checkIpLockout(env.LINKS_KV, ip);
  if (lockout.locked) {
    const retryAfter = Math.ceil((lockout.until - Date.now()) / 1000);
    return createErrorResponse(
      `IP locked. Try again in ${retryAfter} seconds`,
      'IP_LOCKED',
      429
    );
  }
  
  // 速率限制檢查
  const rateLimit = await checkRateLimit(env.LINKS_KV, ip, 'create', 10, 60);
  if (!rateLimit.allowed) {
    await notifyAccessDenied(env.DISCORD_WEBHOOK_URL, {
      reason: 'Rate limit exceeded for /api/create',
      ip,
      country,
      userAgent,
      path: '/api/create',
    });
    
    return createErrorResponse(
      'Rate limit exceeded',
      'RATE_LIMITED',
      429
    );
  }
  
  // API Key 驗證
  const apiKeyValidation = validateApiKey(request, env.ADMIN_API_KEY);
  if (!apiKeyValidation.valid) {
    // 記錄失敗嘗試
    const attempt = await recordFailedAttempt(env.LINKS_KV, ip);
    
    await notifyAccessDenied(env.DISCORD_WEBHOOK_URL, {
      reason: `API Key validation failed: ${apiKeyValidation.error}`,
      ip,
      country,
      userAgent,
      path: '/api/create',
    });
    
    if (attempt.locked) {
      return createErrorResponse(
        'Too many failed attempts. IP locked for 15 minutes.',
        'IP_LOCKED',
        429
      );
    }
    
    return createErrorResponse(
      'Unauthorized',
      apiKeyValidation.error,
      401
    );
  }
  
  // 清除失敗嘗試記錄
  await clearFailedAttempts(env.LINKS_KV, ip);
  
  // 解析請求 Body
  let body;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse('Invalid JSON body', 'INVALID_REQUEST', 400);
  }
  
  const { url, id: customId } = body;
  
  // URL 驗證
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    return createErrorResponse(
      `Invalid URL: ${urlValidation.error}`,
      urlValidation.error,
      400
    );
  }
  
  // 黑名單檢查
  if (isBlockedDomain(urlValidation.url, env.BLOCKED_DOMAINS)) {
    await notifyBlockedDomain(env.DISCORD_WEBHOOK_URL, {
      url: urlValidation.url,
      ip,
      country,
    });
    
    return createErrorResponse(
      'This domain is not allowed',
      'BLOCKED_DOMAIN',
      403
    );
  }
  
  // 產生或驗證 ID
  let finalId;
  
  if (customId) {
    // 驗證自定義 ID
    const idValidation = validateId(customId);
    if (!idValidation.valid) {
      return createErrorResponse(
        `Invalid ID: ${idValidation.error}`,
        idValidation.error,
        400
      );
    }
    
    // 檢查衝突
    const existing = await env.LINKS_KV.get(`link:${customId}`);
    if (existing) {
      return createErrorResponse(
        'ID already exists',
        'CONFLICT',
        409
      );
    }
    
    finalId = customId;
  } else {
    // 自動生成 ID
    let attempts = 0;
    do {
      finalId = generateRandomId();
      const existing = await env.LINKS_KV.get(`link:${finalId}`);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);
    
    if (attempts >= 10) {
      return createErrorResponse(
        'Unable to generate unique ID',
        'SERVER_ERROR',
        500
      );
    }
  }
  
  // 寫入 KV（使用 metadata 儲存基本統計，減少後續讀取）
  try {
    const createdAt = new Date().toISOString();
    
    // 寫入 link，並在 metadata 中存儲基本統計資訊
    await env.LINKS_KV.put(`link:${finalId}`, urlValidation.url, {
      metadata: {
        stats: {
          clicks: 0,
          lastAccess: null,
          createdAt: createdAt,
        },
        disabled: false,
      }
    });
    
    // 寫入完整統計資料
    await env.LINKS_KV.put(`stats:${finalId}`, JSON.stringify({
      clicks: 0,
      countries: {},
      clicksByDate: {},
      clicksByCountry: {},
      lastAccess: null,
      createdAt: createdAt,
      createdBy: ip,
    }));
  } catch (error) {
    return createErrorResponse(
      'Failed to create short URL',
      'SERVER_ERROR',
      500
    );
  }
  
  // 發送 Discord 通知
  await notifyLinkCreated(env.DISCORD_WEBHOOK_URL, {
    id: finalId,
    targetUrl: urlValidation.url,
    country,
    ip,
  });
  
  // 回傳成功結果
  return createResponse({
    id: finalId,
    shortUrl: `https://ntnu.cc/${finalId}`,
    targetUrl: urlValidation.url,
  }, { status: 200 });
}

// 只允許 POST 方法
export async function onRequestGet(context) {
  return createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED', 405);
}
