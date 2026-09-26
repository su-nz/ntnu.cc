/**
 * 公開濫用通報 API
 * 路由：POST /api/report
 * 不需認證；速率限制每 IP 每 10 分鐘 5 次。隱私：不儲存通報者 IP，僅記錄國別。
 */

import { createResponse, createErrorResponse, getClientInfo } from '../lib/utils.js';
import { validateId } from '../lib/validation.js';
import { checkRateLimit } from '../lib/security.js';
import { createReport, isValidCategory } from '../lib/reports.js';
import { notifyAbuseReport } from '../lib/discord.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const { ip, country } = getClientInfo(request);

  // 速率限制（防灌檢舉）
  const rateLimit = await checkRateLimit(env.LINKS_KV, ip, 'report', 5, 600);
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return createErrorResponse(
      `通報過於頻繁，請在 ${retryAfter} 秒後再試`,
      'RATE_LIMITED',
      429
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse('無效的請求格式', 'INVALID_REQUEST', 400);
  }

  const { id, category, detail } = body;

  // 驗證短碼格式
  const idValidation = validateId(id || '');
  if (!idValidation.valid) {
    return createErrorResponse('無效的短碼', 'INVALID_ID', 400);
  }

  // 驗證分類
  if (!isValidCategory(category)) {
    return createErrorResponse('無效的通報分類', 'INVALID_CATEGORY', 400);
  }

  if (detail && String(detail).length > 500) {
    return createErrorResponse('補充說明過長（上限 500 字）', 'DETAIL_TOO_LONG', 400);
  }

  // 確認短碼存在（不存在就不需通報）
  const targetUrl = await env.LINKS_KV.get(`link:${id}`);
  if (!targetUrl) {
    return createErrorResponse('找不到此短碼，可能已被移除', 'NOT_FOUND', 404);
  }

  try {
    await createReport(env.LINKS_KV, {
      id,
      category,
      detail: detail ? String(detail) : '',
      country,
    });
  } catch (error) {
    console.error('Create report error:', error);
    return createErrorResponse('通報建立失敗，請稍後再試', 'SERVER_ERROR', 500);
  }

  // Discord 通知（背景執行）
  context.waitUntil(notifyAbuseReport(env.DISCORD_WEBHOOK_URL, {
    id,
    category,
    detail: detail ? String(detail) : '',
    country,
  }));

  return createResponse({
    success: true,
    message: '已收到您的通報，管理團隊將盡快審核。感謝您協助維護平台安全。',
  });
}

export async function onRequestGet() {
  return createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED', 405);
}
