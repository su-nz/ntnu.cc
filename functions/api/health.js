/**
 * 健康檢查端點
 * 路由：GET /api/health
 */

import { createResponse } from '../lib/utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  
  // 檢查 KV 連線
  let kvStatus = 'unknown';
  try {
    await env.LINKS_KV.get('__health_check__');
    kvStatus = 'connected';
  } catch (error) {
    kvStatus = 'error: ' + error.message;
  }
  
  return createResponse({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      kv: kvStatus,
      turnstile: env.TURNSTILE_SITE_KEY ? 'configured' : 'not_configured',
      discord: env.DISCORD_WEBHOOK_URL ? 'configured' : 'not_configured',
    },
  });
}
