/**
 * 安全相關模組
 */

/**
 * 速率限制檢查
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
      // 第一次請求
      await kv.put(key, JSON.stringify({
        count: 1,
        resetAt: now + windowSeconds * 1000,
      }), { expirationTtl: windowSeconds });
      
      return { allowed: true, remaining: limit - 1, resetAt: now + windowSeconds * 1000 };
    }
    
    // 檢查是否已過期
    if (now >= data.resetAt) {
      await kv.put(key, JSON.stringify({
        count: 1,
        resetAt: now + windowSeconds * 1000,
      }), { expirationTtl: windowSeconds });
      
      return { allowed: true, remaining: limit - 1, resetAt: now + windowSeconds * 1000 };
    }
    
    // 檢查是否超限
    if (data.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: data.resetAt };
    }
    
    // 更新計數
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
 * 更新點擊統計
 * @param {Object} kv 
 * @param {string} id 
 * @param {string} country 
 */
export async function updateStats(kv, id, country) {
  const key = `stats:${id}`;
  
  try {
    const data = await kv.get(key, { type: 'json' }) || {
      clicks: 0,
      countries: {},
      lastAccess: null,
    };
    
    data.clicks += 1;
    data.lastAccess = new Date().toISOString();
    
    if (country) {
      data.countries[country] = (data.countries[country] || 0) + 1;
    }
    
    await kv.put(key, JSON.stringify(data));
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
