/**
 * 列出所有短網址 API
 * 路由：GET /api/list
 */

import { createResponse, createErrorResponse } from '../lib/utils.js';
import { validateApiKey } from '../lib/validation.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  
  // API Key 驗證
  const apiKeyValidation = validateApiKey(request, env.ADMIN_API_KEY);
  if (!apiKeyValidation.valid) {
    return createErrorResponse('Unauthorized', apiKeyValidation.error, 401);
  }
  
  // 取得查詢參數
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') || undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);
  const search = url.searchParams.get('search') || '';
  
  // 列出所有短網址
  const listResult = await env.LINKS_KV.list({
    prefix: 'link:',
    limit: search ? 1000 : limit, // 搜尋時取得更多以便過濾
    cursor,
  });
  
  const links = [];
  
  for (const key of listResult.keys) {
    const id = key.name.replace('link:', '');
    const targetUrl = await env.LINKS_KV.get(key.name);
    const stats = await env.LINKS_KV.get(`stats:${id}`, { type: 'json' });
    
    // 搜尋過濾
    if (search) {
      const searchLower = search.toLowerCase();
      if (!id.toLowerCase().includes(searchLower) && 
          !targetUrl.toLowerCase().includes(searchLower)) {
        continue;
      }
    }
    
    links.push({
      id,
      shortUrl: `https://ntnu.cc/${id}`,
      targetUrl,
      stats: stats ? {
        clicks: stats.clicks || 0,
        lastAccess: stats.lastAccess,
        createdAt: stats.createdAt,
      } : null,
    });
    
    // 搜尋時限制結果數量
    if (search && links.length >= limit) {
      break;
    }
  }
  
  return createResponse({
    links,
    cursor: listResult.list_complete ? null : listResult.cursor,
    hasMore: !listResult.list_complete,
    total: links.length,
  });
}
