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
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com; connect-src 'self' https://cloudflareinsights.com; img-src 'self' data: https:; base-uri 'self'; form-action 'self';",
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
