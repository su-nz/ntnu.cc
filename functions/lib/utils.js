/**
 * 共用工具函數
 */

/**
 * 產生隨機短碼 ID
 * @param {number} length - 短碼長度，預設 6
 * @returns {string}
 */
export function generateRandomId(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * HTML 編碼（防 XSS）
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

/**
 * 取得安全標頭
 * @returns {Object}
 */
export function getSecurityHeaders() {
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://www.googletagmanager.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://www.google-analytics.com https://cloudflareinsights.com https://challenges.cloudflare.com https://www.google.com; frame-src https://challenges.cloudflare.com https://www.google.com; object-src 'none'; base-uri 'self'; form-action 'self';",
  };
}

/**
 * 建立帶有安全標頭的 Response
 * @param {string|Object} body 
 * @param {Object} options 
 * @returns {Response}
 */
export function createResponse(body, options = {}) {
  const headers = {
    ...getSecurityHeaders(),
    ...options.headers,
  };
  
  if (typeof body === 'object' && !(body instanceof ReadableStream)) {
    headers['Content-Type'] = 'application/json';
    return new Response(JSON.stringify(body), { ...options, headers });
  }
  
  return new Response(body, { ...options, headers });
}

/**
 * 建立 HTML Response
 * @param {string} html 
 * @param {number} status 
 * @returns {Response}
 */
export function createHtmlResponse(html, status = 200) {
  return createResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * 建立錯誤 Response
 * @param {string} error 
 * @param {string} code 
 * @param {number} status 
 * @returns {Response}
 */
export function createErrorResponse(error, code, status) {
  return createResponse({ error, code }, { status });
}

/**
 * 取得 ISO 8601 時間戳記
 * @returns {string}
 */
export function getTimestamp() {
  return new Date().toISOString();
}

/**
 * 解析 CIDR 並檢查 IP 是否在範圍內
 * @param {string} ip 
 * @param {string} cidr 
 * @returns {boolean}
 */
export function isIpInCidr(ip, cidr) {
  // 處理 IPv6
  if (ip.includes(':') || cidr.includes(':')) {
    return isIpv6InCidr(ip, cidr);
  }
  
  const [range, bits = '32'] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);
  
  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);
  
  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * IPv4 轉數字
 * @param {string} ip 
 * @returns {number}
 */
function ipToNumber(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

/**
 * 檢查 IPv6 是否在 CIDR 範圍內（簡化版）
 * @param {string} ip 
 * @param {string} cidr 
 * @returns {boolean}
 */
function isIpv6InCidr(ip, cidr) {
  // 簡化處理：展開 IPv6 並進行前綴比對
  try {
    const [range, bits = '128'] = cidr.split('/');
    const prefixBits = parseInt(bits);
    
    const expandedIp = expandIpv6(ip);
    const expandedRange = expandIpv6(range);
    
    // 比對前綴位元
    const ipBinary = ipv6ToBinary(expandedIp);
    const rangeBinary = ipv6ToBinary(expandedRange);
    
    return ipBinary.substring(0, prefixBits) === rangeBinary.substring(0, prefixBits);
  } catch {
    return false;
  }
}

/**
 * 展開 IPv6 地址
 * @param {string} ip 
 * @returns {string}
 */
function expandIpv6(ip) {
  // 移除 [] 包裹
  ip = ip.replace(/^\[|\]$/g, '');
  
  // 處理 :: 縮寫
  if (ip.includes('::')) {
    const parts = ip.split('::');
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    const middle = Array(missing).fill('0000');
    ip = [...left, ...middle, ...right].join(':');
  }
  
  // 補齊每個區段到 4 位
  return ip.split(':').map(s => s.padStart(4, '0')).join(':');
}

/**
 * IPv6 轉二進位字串
 * @param {string} ip 
 * @returns {string}
 */
function ipv6ToBinary(ip) {
  return ip.split(':').map(hex => 
    parseInt(hex, 16).toString(2).padStart(16, '0')
  ).join('');
}

/**
 * 檢查 IP 是否在允許清單中
 * @param {string} ip 
 * @param {string} allowedCidrs - 逗號分隔的 CIDR 清單
 * @returns {boolean}
 */
export function isIpAllowed(ip, allowedCidrs) {
  if (!allowedCidrs || !ip) return false;
  
  const cidrs = allowedCidrs.split(',').map(c => c.trim()).filter(Boolean);
  return cidrs.some(cidr => isIpInCidr(ip, cidr));
}

/**
 * 由絕對到期時間（ISO 字串）判斷連結是否已過期。
 * 無到期時間（永久）或無法解析者一律視為未過期。
 * @param {string|null|undefined} expiresAt - ISO 8601 字串
 * @returns {boolean}
 */
export function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return false;
  return Date.now() >= ms;
}

/**
 * 將絕對到期時間（ISO 字串）換算成 KV put 用的過期設定。
 *
 * 重要：Cloudflare KV 的過期時間是「每次寫入各自獨立」的——重新 put 而未帶
 * expiration / expirationTtl，會清掉先前設定的 TTL，使 key 變成永久。因此凡是
 * 重寫既有的 link / stats key（例如更新點擊統計），都必須用本函式還原其過期時間，
 * 否則連結被點過一次後就再也不會過期。
 *
 * 回傳：
 *  - { mode: 'permanent' }            無到期時間或無法解析 → 不設過期
 *  - { mode: 'active', expiration }   仍有效，expiration 為絕對 Unix 秒（給 KV 的 expiration）
 *  - { mode: 'expired' }              已過期或剩餘不足 KV 下限（60 秒）→ 呼叫端不應重寫
 *
 * @param {string|null|undefined} expiresAt - ISO 8601 字串
 * @returns {{ mode: 'permanent' } | { mode: 'active', expiration: number } | { mode: 'expired' }}
 */
export function kvExpiration(expiresAt) {
  if (!expiresAt) return { mode: 'permanent' };
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return { mode: 'permanent' };
  const expSec = Math.floor(ms / 1000);
  const nowSec = Math.floor(Date.now() / 1000);
  // KV 要求 expiration 至少需比現在多 60 秒，否則 put 會失敗
  if (expSec <= nowSec + 60) return { mode: 'expired' };
  return { mode: 'active', expiration: expSec };
}

/**
 * 取得客戶端資訊（IP 和國家）
 * 優先使用 Cloudflare Headers，備選使用 request.cf 對象
 * @param {Request} request 
 * @returns {Object} { ip: string, country: string }
 */
export function getClientInfo(request) {
  // 優先使用 CF-Connecting-IP header
  let ip = request.headers.get('CF-Connecting-IP') || 
           request.headers.get('cf-connecting-ip');
  
  // 優先使用 CF-IPCountry header
  let country = request.headers.get('CF-IPCountry') || 
                request.headers.get('cf-ipcountry');
  
  // 備選：使用 request.cf 對象（Cloudflare Workers 提供）
  if (!ip && request.cf) {
    ip = request.cf.ip || request.cf.connecting_ip;
  }
  
  if (!country && request.cf) {
    country = request.cf.country;
  }
  
  // 最後的備選方案
  if (!ip) {
    ip = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
         request.headers.get('X-Real-IP') || 
         'Unknown';
  }
  
  if (!country) {
    country = 'Unknown';
  }
  
  return { ip, country };
}
