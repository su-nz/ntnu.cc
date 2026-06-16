/**
 * 公開建立短網址 API
 * 路由：POST /api/public-create
 * 不需要 API Key，但限制師大 IP 才能使用
 */

import { createResponse, createErrorResponse, generateRandomId, isIpAllowed, getClientInfo } from '../lib/utils.js';
import { validateUrl, validateId, isBlockedDomain, verifyTurnstile } from '../lib/validation.js';
import { checkRateLimit } from '../lib/security.js';
import { notifyLinkCreated, notifyBlockedDomain, notifyAccessDenied } from '../lib/discord.js';

// 師大 IP 範圍 (CIDR 格式)
const NTNU_IP_RANGES = [
  '140.122.0.0/16',    // 師大主要網段
  '2001:288:6001::/48', // 師大 IPv6
];

// 預設過期時間選項（秒）
const EXPIRY_OPTIONS = {
  '1h': 3600,
  '6h': 21600,
  '1d': 86400,
  '7d': 604800,
  '30d': 2592000,
  '90d': 7776000,
  'never': null,
};

export async function onRequestPost(context) {
  const { request, env } = context;
  
  // 取得使用者資訊
  const { ip, country } = getClientInfo(request);
  const userAgent = request.headers.get('user-agent') || '';
  
  // IP 白名單檢查（師大 IP 或環境變數設定的 CIDR）
  const allowedCidrs = env.ALLOWED_CIDRS || NTNU_IP_RANGES.join(',');
  
  // 開發模式：允許 localhost
  const isDev = env.DEV_MODE === 'true';
  const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.');
  
  if (!isDev && !isLocalhost && !isIpAllowed(ip, allowedCidrs)) {
    return createErrorResponse(
      '此服務僅限師大校園網路使用',
      'IP_NOT_ALLOWED',
      403
    );
  }
  
  // 解析請求 Body（先解析，才能在做任何 KV 寫入前驗證 CAPTCHA）
  let body;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse('無效的請求格式', 'INVALID_REQUEST', 400);
  }

  const { url, customId, expiry = '30d', turnstileToken } = body;

  // CAPTCHA 驗證（Cloudflare Turnstile）
  // 重要：必須在伺服器端強制驗證，前端的 Turnstile 只是 UX，無法防止
  //      攻擊者直接呼叫 API。此處驗證失敗即拒絕，且在任何 KV 寫入之前執行，
  //      避免攻擊流量污染資料庫或灌爆速率限制計數。
  // 開發模式（DEV_MODE=true）可略過，方便本機測試。
  if (env.DEV_MODE !== 'true') {
    const turnstileResult = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, ip);
    if (!turnstileResult.success) {
      await notifyAccessDenied(env.DISCORD_WEBHOOK_URL, {
        reason: `Turnstile 驗證失敗 (${turnstileResult.error})`,
        ip,
        country,
        userAgent,
        path: '/api/public-create',
      });

      return createErrorResponse(
        '人機驗證失敗，請重新整理頁面後再試一次',
        turnstileResult.error || 'CAPTCHA_FAILED',
        403
      );
    }
  }

  // 速率限制：每 IP 每分鐘最多 5 次
  const rateLimit = await checkRateLimit(env.LINKS_KV, ip, 'public-create', 5, 60);
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return createErrorResponse(
      `請求過於頻繁，請在 ${retryAfter} 秒後再試`,
      'RATE_LIMITED',
      429
    );
  }
  
  // URL 驗證
  if (!url) {
    return createErrorResponse('請提供目標網址', 'URL_REQUIRED', 400);
  }
  
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    return createErrorResponse(
      `無效的網址: ${urlValidation.error}`,
      urlValidation.error,
      400
    );
  }
  
  // 黑名單檢查
  const blockedDomains = env.BLOCKED_DOMAINS 
    ? env.BLOCKED_DOMAINS.split(',').map(s => s.trim())
    : [];
  
  if (isBlockedDomain(url, blockedDomains)) {
    await notifyBlockedDomain(env.DISCORD_WEBHOOK_URL, {
      url,
      ip,
      country,
      userAgent,
    });
    
    return createErrorResponse(
      '此網域已被封鎖',
      'BLOCKED_DOMAIN',
      403
    );
  }
  
  // 過期時間驗證
  if (expiry && !EXPIRY_OPTIONS.hasOwnProperty(expiry)) {
    return createErrorResponse(
      '無效的過期時間選項',
      'INVALID_EXPIRY',
      400
    );
  }
  
  const expirySeconds = EXPIRY_OPTIONS[expiry];
  const expiresAt = expirySeconds ? Date.now() + (expirySeconds * 1000) : null;
  
  // 決定短碼 ID
  let id;
  
  if (customId) {
    // 自訂 ID 驗證
    const idValidation = validateId(customId);
    if (!idValidation.valid) {
      return createErrorResponse(
        `無效的短碼: ${idValidation.error}`,
        idValidation.error,
        400
      );
    }
    
    // 檢查是否已存在
    const existing = await env.LINKS_KV.get(`link:${customId}`);
    if (existing) {
      return createErrorResponse(
        '此短碼已被使用，請換一個',
        'ID_EXISTS',
        409
      );
    }
    
    id = customId;
  } else {
    // 自動生成唯一 ID
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      id = generateRandomId(6);
      const existing = await env.LINKS_KV.get(`link:${id}`);
      if (!existing) break;
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      return createErrorResponse(
        '無法生成唯一短碼，請稍後再試',
        'ID_GENERATION_FAILED',
        500
      );
    }
  }
  
  // 儲存短網址
  const linkData = {
    url,
    createdAt: new Date().toISOString(),
    createdBy: ip,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  };
  
  // 設定 KV 過期時間
  const kvOptions = expirySeconds 
    ? { expirationTtl: expirySeconds, metadata: linkData }
    : { metadata: linkData };
  
  await env.LINKS_KV.put(`link:${id}`, url, kvOptions);
  
  // 建立統計資料
  const statsData = {
    clicks: 0,
    createdAt: linkData.createdAt,
    expiresAt: linkData.expiresAt,
    clicksByDate: {},
    clicksByCountry: {},
  };
  
  await env.LINKS_KV.put(`stats:${id}`, JSON.stringify(statsData), kvOptions);
  
  // Discord 通知
  await notifyLinkCreated(env.DISCORD_WEBHOOK_URL, {
    id,
    targetUrl: url,
    createdBy: `Public (${ip})`,
    expiresAt: linkData.expiresAt,
  });
  
  // 回傳結果
  const shortUrl = `https://ntnu.cc/${id}`;
  
  return createResponse({
    success: true,
    id,
    shortUrl,
    targetUrl: url,
    expiresAt: linkData.expiresAt,
    expiresIn: expiry,
  });
}
