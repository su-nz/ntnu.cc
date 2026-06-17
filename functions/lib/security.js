/**
 * 安全相關模組
 */

import { kvExpiration } from './utils.js';

/**
 * 速率限制檢查（使用 Durable Objects 模式減少讀寫）
 * @param {Object} kv - KV namespace
 * @param {string} ip 
 * @param {string} endpoint 
 * @param {number} limit 
 * @param {number} windowSeconds 
 * @returns {Promise<{ allowed: boolean, remaining: number, resetAt: number }>}
 */
export async function checkRateLimit(kv, ip, endpoint, limit, windowSeconds) {
  const key = `ratelimit:${ip}:${endpoint}`;
  const now = Date.now();
  
  try {
    const data = await kv.get(key, { type: 'json' });
    
    if (!data) {
      // 第一次請求 - 只在允許時才寫入
      await kv.put(key, JSON.stringify({
        count: 1,
        resetAt: now + windowSeconds * 1000,
      }), { expirationTtl: windowSeconds });
      
      return { allowed: true, remaining: limit - 1, resetAt: now + windowSeconds * 1000 };
    }
    
    // 檢查是否已過期（KV TTL 會自動清理，這是備用檢查）
    if (now >= data.resetAt) {
      await kv.put(key, JSON.stringify({
        count: 1,
        resetAt: now + windowSeconds * 1000,
      }), { expirationTtl: windowSeconds });
      
      return { allowed: true, remaining: limit - 1, resetAt: now + windowSeconds * 1000 };
    }
    
    // 檢查是否超限 - 不寫入，減少 KV 寫入
    if (data.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: data.resetAt };
    }
    
    // 更新計數 - 只在允許時才寫入
    await kv.put(key, JSON.stringify({
      count: data.count + 1,
      resetAt: data.resetAt,
    }), { expirationTtl: Math.ceil((data.resetAt - now) / 1000) });
    
    return { allowed: true, remaining: limit - data.count - 1, resetAt: data.resetAt };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // 發生錯誤時允許請求（fail-open）
    return { allowed: true, remaining: limit, resetAt: now + windowSeconds * 1000 };
  }
}

/**
 * 檢查 IP 鎖定狀態
 * @param {Object} kv 
 * @param {string} ip 
 * @returns {Promise<{ locked: boolean, until?: number }>}
 */
export async function checkIpLockout(kv, ip) {
  const key = `lockout:${ip}`;
  
  try {
    const data = await kv.get(key, { type: 'json' });
    
    if (!data) {
      return { locked: false };
    }
    
    if (Date.now() >= data.until) {
      await kv.delete(key);
      return { locked: false };
    }
    
    return { locked: true, until: data.until };
  } catch {
    return { locked: false };
  }
}

/**
 * 記錄失敗嘗試並可能鎖定 IP
 * @param {Object} kv 
 * @param {string} ip 
 * @param {number} maxAttempts 
 * @param {number} lockoutMinutes 
 * @returns {Promise<{ attempts: number, locked: boolean }>}
 */
export async function recordFailedAttempt(kv, ip, maxAttempts = 5, lockoutMinutes = 15) {
  const failKey = `failed:${ip}`;
  const lockKey = `lockout:${ip}`;
  
  try {
    const data = await kv.get(failKey, { type: 'json' }) || { count: 0 };
    const newCount = data.count + 1;
    
    if (newCount >= maxAttempts) {
      // 鎖定 IP
      const until = Date.now() + lockoutMinutes * 60 * 1000;
      await kv.put(lockKey, JSON.stringify({ until }), { expirationTtl: lockoutMinutes * 60 });
      await kv.delete(failKey);
      return { attempts: newCount, locked: true };
    }
    
    // 更新失敗計數（15 分鐘過期）
    await kv.put(failKey, JSON.stringify({ count: newCount }), { expirationTtl: lockoutMinutes * 60 });
    return { attempts: newCount, locked: false };
  } catch (error) {
    console.error('Record failed attempt error:', error);
    return { attempts: 0, locked: false };
  }
}

/**
 * 清除失敗嘗試記錄
 * @param {Object} kv 
 * @param {string} ip 
 */
export async function clearFailedAttempts(kv, ip) {
  const key = `failed:${ip}`;
  try {
    await kv.delete(key);
  } catch (error) {
    console.error('Clear failed attempts error:', error);
  }
}

/**
 * 更新點擊統計（將基本統計存入 metadata，減少獨立讀取）
 * @param {Object} kv 
 * @param {string} id 
 * @param {string} country 
 */
export async function updateStats(kv, id, country) {
  const key = `stats:${id}`;
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const data = await kv.get(key, { type: 'json' }) || {
      clicks: 0,
      clicksByDate: {},
      clicksByCountry: {},
      lastAccess: null,
      createdAt: new Date().toISOString(),
    };
    
    data.clicks += 1;
    data.lastAccess = new Date().toISOString();
    
    // 更新每日點擊統計
    if (!data.clicksByDate) data.clicksByDate = {};
    data.clicksByDate[today] = (data.clicksByDate[today] || 0) + 1;
    
    // 更新國家統計
    if (country) {
      if (!data.clicksByCountry) data.clicksByCountry = {};
      data.clicksByCountry[country] = (data.clicksByCountry[country] || 0) + 1;
      
      // 相容舊欄位
      if (!data.countries) data.countries = {};
      data.countries[country] = (data.countries[country] || 0) + 1;
    }
    
    // 儲存完整統計到 stats key。
    // 重要：KV 在 put 時不會保留前一次的 TTL，未帶 expiration 會讓 key 變永久。
    // 因此用資料中保存的 expiresAt 還原過期時間（仍有效才設絕對到期）。
    const statsExpiry = kvExpiration(data.expiresAt);
    await kv.put(
      key,
      JSON.stringify(data),
      statsExpiry.mode === 'active' ? { expiration: statsExpiry.expiration } : {}
    );

    // 同時將基本統計併入 link metadata（讓 list / cleanup API 少讀一次）。
    const linkKey = `link:${id}`;
    const { value: linkValue, metadata: existingMeta } = await kv.getWithMetadata(linkKey);
    if (linkValue !== null) {
      // link 的過期時間以「它自身 metadata 的 expiresAt」為唯一依據——
      // 不可退回 stats 的 expiresAt，否則舊資料殘留的過期時間會誤判（既有永久連結
      // 會被舊統計的過期時間影響）。沒有 expiresAt 即代表永久。
      const linkExpiry = kvExpiration(existingMeta && existingMeta.expiresAt);

      // 已到期 / 剩不到 60 秒就不重寫，避免把即將自然消失的 key 重置成永久；
      // 交給 KV 既有 TTL 完成清除，轉址端也會依 expiresAt 視為不存在。
      if (linkExpiry.mode !== 'expired') {
        // 合併既有 metadata，保留 url / createdAt / createdBy / expiresAt 等欄位，
        // 只覆寫 stats，避免把建立時寫入的資訊洗掉。
        const metadata = {
          ...(existingMeta || {}),
          stats: {
            clicks: data.clicks,
            lastAccess: data.lastAccess,
            createdAt:
              (existingMeta && existingMeta.stats && existingMeta.stats.createdAt) ||
              (existingMeta && existingMeta.createdAt) ||
              data.createdAt,
          },
        };
        await kv.put(
          linkKey,
          linkValue,
          linkExpiry.mode === 'active'
            ? { metadata, expiration: linkExpiry.expiration }
            : { metadata }
        );
      }
    }
  } catch (error) {
    console.error('Update stats error:', error);
  }
}

/**
 * 取得點擊統計
 * @param {Object} kv 
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function getStats(kv, id) {
  const key = `stats:${id}`;
  
  try {
    return await kv.get(key, { type: 'json' });
  } catch {
    return null;
  }
}

/**
 * 產生 CSRF Token
 * @returns {string}
 */
export function generateCsrfToken() {
  return crypto.randomUUID();
}

/**
 * 驗證 CSRF Token
 * @param {Request} request 
 * @param {string} sessionToken 
 * @returns {boolean}
 */
export function verifyCsrfToken(request, sessionToken) {
  const headerToken = request.headers.get('X-CSRF-Token');
  
  if (!headerToken || !sessionToken) {
    return false;
  }
  
  return headerToken === sessionToken;
}

/**
 * 驗證 CAPTCHA Token
 * @param {string} token - CAPTCHA Token from client
 * @param {string} secretKey - CAPTCHA Secret Key
 * @returns {Promise<boolean>} - Whether the CAPTCHA is valid
 */
export async function verifyCaptcha(token, secretKey) {
  const url = 'https://www.google.com/recaptcha/api/siteverify';
  const params = new URLSearchParams();
  params.append('secret', secretKey);
  params.append('response', token);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('CAPTCHA verification failed:', error);
    return false;
  }
}
