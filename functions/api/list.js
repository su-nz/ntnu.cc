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
  
  // 批次準備所有需要讀取的 keys
  const keysToFetch = listResult.keys.map(key => ({
    id: key.name.replace('link:', ''),
    linkKey: key.name,
    metadata: key.metadata,
  }));
  
  // 使用 Promise.all 並行讀取（但限制批次大小避免過載）
  const batchSize = 50;
  for (let i = 0; i < keysToFetch.length; i += batchSize) {
    const batch = keysToFetch.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async ({ id, linkKey }) => {
        const { value: targetUrl, metadata } = await env.LINKS_KV.getWithMetadata(linkKey);
        // 只在需要詳細統計時才讀取 stats
        const stats = metadata?.stats || null;
        return { id, targetUrl, stats };
      })
    );
    
    for (const { id, targetUrl, stats } of results) {
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
