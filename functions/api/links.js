/**
 * 批量刪除 API
 * 路由：DELETE /api/links
 */

import { createResponse, createErrorResponse } from '../lib/utils.js';
import { validateApiKey, validateId } from '../lib/validation.js';
import { notifyLinkDeleted } from '../lib/discord.js';

export async function onRequestDelete(context) {
  const { request, env } = context;
  
  // API Key 驗證
  const apiKeyValidation = validateApiKey(request, env.ADMIN_API_KEY);
  if (!apiKeyValidation.valid) {
    return createErrorResponse('Unauthorized', apiKeyValidation.error, 401);
  }
  
  // 解析請求
  let body;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse('Invalid JSON body', 'INVALID_REQUEST', 400);
  }
  
  const { ids } = body;
  
  if (!Array.isArray(ids) || ids.length === 0) {
    return createErrorResponse('No IDs provided', 'INVALID_REQUEST', 400);
  }
  
  // 限制一次最多刪除 100 個
  if (ids.length > 100) {
    return createErrorResponse('Too many IDs. Maximum 100 per request.', 'TOO_MANY_IDS', 400);
  }
  
  const results = [];
  
  for (const id of ids) {
    // 驗證 ID 格式
    const idValidation = validateId(id);
    if (!idValidation.valid) {
      results.push({ id, success: false, error: idValidation.error });
      continue;
    }
    
    try {
      const targetUrl = await env.LINKS_KV.get(`link:${id}`);
      
      if (!targetUrl) {
        results.push({ id, success: false, error: 'NOT_FOUND' });
        continue;
      }
      
      // 刪除連結與統計
      await env.LINKS_KV.delete(`link:${id}`);
      await env.LINKS_KV.delete(`stats:${id}`);
      await env.LINKS_KV.delete(`disabled:${id}`);
      
      // 發送通知
      await notifyLinkDeleted(env.DISCORD_WEBHOOK_URL, {
        id,
        targetUrl,
        deletedBy: 'API',
      });
      
      results.push({ id, success: true });
    } catch (error) {
      results.push({ id, success: false, error: 'DELETE_FAILED' });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  return createResponse({
    message: `Deleted ${successCount} links, ${failCount} failed`,
    results,
  });
}
