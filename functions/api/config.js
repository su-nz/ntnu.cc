/**
 * 公開配置 API
 * 路由：GET /api/config
 * 提供前端需要的公開配置（如 Turnstile Site Key）
 */

import { createResponse } from '../lib/utils.js';

export async function onRequestGet(context) {
  const { env } = context;
  
  // 只回傳公開的配置，不要回傳敏感資料
  const config = {
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
    // 可以加入其他公開配置
  };
  
  return createResponse({
    success: true,
    config,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300', // 快取 5 分鐘
    }
  });
}
