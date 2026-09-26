/**
 * 統計查詢 API
 * 路由：GET /api/stats/{id}
 */

import { createResponse, createErrorResponse } from '../../lib/utils.js';
import { validateId } from '../../lib/validation.js';
import { getStats } from '../../lib/security.js';
import { verifyAdmin } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;

  // 管理員驗證（API Key 或後台 Session；修正舊版後台以 Session 登入時無法查詢的問題）
  const auth = await verifyAdmin(context);
  if (!auth.ok) {
    return createErrorResponse('Unauthorized', auth.error, 401);
  }
  
  // 驗證 ID 格式
  const idValidation = validateId(id);
  if (!idValidation.valid) {
    return createErrorResponse('Invalid ID', idValidation.error, 400);
  }
  
  // 檢查短碼是否存在
  const targetUrl = await env.LINKS_KV.get(`link:${id}`);
  if (!targetUrl) {
    return createErrorResponse('Link not found', 'NOT_FOUND', 404);
  }
  
  // 取得統計
  const stats = await getStats(env.LINKS_KV, id);
  
  return createResponse({
    id,
    shortUrl: `https://ntnu.cc/${id}`,
    targetUrl,
    stats: stats || {
      clicks: 0,
      countries: {},
      lastAccess: null,
    },
  });
}
