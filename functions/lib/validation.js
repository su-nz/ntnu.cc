/**
 * 輸入驗證模組
 */

/**
 * URL 驗證（嚴格模式）
 * @param {string} input 
 * @returns {{ valid: boolean, url?: string, error?: string }}
 */
export function validateUrl(input) {
  // 1. 長度限制
  if (!input || input.length > 2048) {
    return { valid: false, error: 'URL_TOO_LONG' };
  }
  
  // 2. 協定白名單（僅允許 http/https）
  let url;
  try {
    url = new URL(input);
  } catch {
    return { valid: false, error: 'INVALID_URL_FORMAT' };
  }
  
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, error: 'INVALID_PROTOCOL' };
  }
  
  // 3. 禁止本地/內網 IP（防止 SSRF）
  const hostname = url.hostname.toLowerCase();
  const ssrfPatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,           // Link-local
    /^0\./,                  // 0.0.0.0/8
    /^\[::1\]$/,             // IPv6 localhost
    /^\[fc/i,                // IPv6 private (fc00::/7)
    /^\[fd/i,                // IPv6 private (fd00::/8)
    /\.local$/i,             // mDNS
    /\.internal$/i,
    /\.corp$/i,
    /\.localhost$/i,
  ];
  
  if (ssrfPatterns.some(p => p.test(hostname))) {
    return { valid: false, error: 'SSRF_BLOCKED' };
  }
  
  // 4. 禁止指向自身（防止無限迴圈）
  if (hostname === 'ntnu.cc' || hostname.endsWith('.ntnu.cc')) {
    return { valid: false, error: 'SELF_REFERENCE_BLOCKED' };
  }
  
  // 5. 禁止特殊字元（防止 Header Injection）
  if (/[\r\n\x00]/.test(input)) {
    return { valid: false, error: 'INVALID_CHARACTERS' };
  }
  
  return { valid: true, url: url.href };
}

/**
 * 短碼 ID 驗證
 * @param {string} id 
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateId(id) {
  // 僅允許英數字與連字號，長度 1-32
  if (!id || !/^[a-zA-Z0-9-]{1,32}$/.test(id)) {
    return { valid: false, error: 'INVALID_ID_FORMAT' };
  }
  
  // 保留字檢查（避免與系統路徑衝突）
  const reserved = [
    'admin', 'api', 'static', 'assets', '_', 
    'health', 'robots.txt', 'favicon.ico',
    'functions', 'lib', '.well-known'
  ];
  
  if (reserved.includes(id.toLowerCase())) {
    return { valid: false, error: 'RESERVED_ID' };
  }
  
  return { valid: true };
}

/**
 * 檢查網域是否在黑名單中
 * @param {string} url 
 * @param {string} blockedDomains - 逗號分隔的黑名單
 * @returns {boolean}
 */
export function isBlockedDomain(url, blockedDomains) {
  if (!blockedDomains) return false;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const domains = blockedDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    
    for (const pattern of domains) {
      // 支援 wildcard (*.example.com)
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1); // .example.com
        if (hostname.endsWith(suffix) || hostname === pattern.slice(2)) {
          return true;
        }
      } else if (hostname === pattern || hostname.endsWith('.' + pattern)) {
        return true;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * API Key 驗證
 * @param {Request} request 
 * @param {string} validKey 
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateApiKey(request, validKey) {
  if (!validKey) {
    return { valid: false, error: 'API_KEY_NOT_CONFIGURED' };
  }
  
  // 從 Authorization Header 取得 API Key
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return { valid: false, error: 'MISSING_API_KEY' };
  }
  
  // 支援 Bearer Token 格式
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { valid: false, error: 'INVALID_AUTH_FORMAT' };
  }
  
  const providedKey = match[1];
  
  // 時間常數比對（防止時序攻擊）
  if (!timingSafeEqual(providedKey, validKey)) {
    return { valid: false, error: 'INVALID_API_KEY' };
  }
  
  return { valid: true };
}

/**
 * 時間常數字串比對
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Turnstile CAPTCHA 驗證
 * @param {string} token 
 * @param {string} secret 
 * @param {string} ip 
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function verifyTurnstile(token, secret, ip) {
  if (!token) {
    return { success: false, error: 'MISSING_CAPTCHA_TOKEN' };
  }
  
  if (!secret) {
    return { success: false, error: 'TURNSTILE_NOT_CONFIGURED' };
  }
  
  try {
    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);
    
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    
    const result = await response.json();
    
    if (result.success) {
      return { success: true };
    }
    
    return { 
      success: false, 
      error: 'CAPTCHA_VERIFICATION_FAILED',
      details: result['error-codes'] 
    };
  } catch (error) {
    return { success: false, error: 'CAPTCHA_SERVICE_ERROR' };
  }
}
