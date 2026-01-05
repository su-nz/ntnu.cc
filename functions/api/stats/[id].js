/**
 * 統計查詢 API
 * 路由：GET /api/stats/{id}
 */

import { createResponse, createErrorResponse } from '../../lib/utils.js';
import { validateId, validateApiKey } from '../../lib/validation.js';
import { getStats } from '../../lib/security.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const id = params.id;
  
  // API Key 驗證
  const apiKeyValidation = validateApiKey(request, env.ADMIN_API_KEY);
  if (!apiKeyValidation.valid) {
    return createErrorResponse('Unauthorized', apiKeyValidation.error, 401);
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
