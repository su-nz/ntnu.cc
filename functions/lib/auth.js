/**
 * 管理員驗證共用模組
 * 支援兩種方式：Authorization: Bearer <ADMIN_API_KEY> 或 admin_session Cookie。
 */

import { validateApiKey } from './validation.js';

/**
 * 驗證管理員身分。
 * @param {Object} context - Pages Function context
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function verifyAdmin(context) {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const apiKeyValidation = validateApiKey(request, env.ADMIN_API_KEY);
    return apiKeyValidation.valid
      ? { ok: true }
      : { ok: false, error: apiKeyValidation.error };
  }

  const cookie = request.headers.get('Cookie') || '';
  const sessionMatch = cookie.match(/admin_session=([^;]+)/);
  if (!sessionMatch) {
    return { ok: false, error: 'NO_SESSION' };
  }

  const sessionData = await env.LINKS_KV.get(`session:${sessionMatch[1]}`, { type: 'json' });
  if (!sessionData || Date.now() >= sessionData.expiresAt) {
    return { ok: false, error: 'SESSION_EXPIRED' };
  }

  return { ok: true };
}
