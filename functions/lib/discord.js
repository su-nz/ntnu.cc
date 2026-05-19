/**
 * Discord Webhook 通知模組
 */

/**
 * 事件類型與顏色對應
 */
const EVENT_COLORS = {
  LINK_CREATED: 0x2ECC71,    // 綠色
  ACCESS_DENIED: 0xE67E22,   // 橙色
  BLOCKED_DOMAIN: 0xE74C3C,  // 紅色
  SYSTEM_ERROR: 0xE74C3C,    // 紅色
  RATE_LIMITED: 0xE67E22,    // 橙色
  LINK_DELETED: 0x9B59B6,    // 紫色
  LOGIN_FAILED: 0xE74C3C,    // 紅色
  LOGIN_SUCCESS: 0x2ECC71,   // 綠色
};

/**
 * 發送 Discord Webhook 訊息
 * @param {string} webhookUrl 
 * @param {Object} embed 
 * @returns {Promise<boolean>}
 */
async function sendWebhook(webhookUrl, embed) {
  if (!webhookUrl) {
    console.warn('Discord webhook URL not configured');
    return false;
  }
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    
    return response.ok;
  } catch (error) {
    console.error('Discord webhook error:', error);
    return false;
  }
}

/**
 * 通知：短網址建立成功
 * @param {string} webhookUrl 
 * @param {Object} data 
 */
export async function notifyLinkCreated(webhookUrl, { id, targetUrl, country, ip }) {
  const embed = {
    title: '🔗 Link Created',
    color: EVENT_COLORS.LINK_CREATED,
    fields: [
      { name: 'ID', value: id, inline: true },
      { name: 'Short URL', value: `https://ntnu.cc/${id}`, inline: true },
      { name: 'Target URL', value: truncate(targetUrl, 200) },
      { name: 'Country', value: country || 'Unknown', inline: true },
      { name: 'Timestamp', value: new Date().toISOString(), inline: true },
    ],
    footer: { text: `IP: ${maskIp(ip)}` },
  };
  
  return sendWebhook(webhookUrl, embed);
}

/**
 * 通知：存取被拒絕
 * @param {string} webhookUrl 
 * @param {Object} data 
 */
export async function notifyAccessDenied(webhookUrl, { reason, ip, country, userAgent, path }) {
  const embed = {
    title: '⚠️ Access Denied',
    color: EVENT_COLORS.ACCESS_DENIED,
    fields: [
      { name: 'Reason', value: reason },
      { name: 'Path', value: path || '/', inline: true },
      { name: 'Country', value: country || 'Unknown', inline: true },
      { name: 'User-Agent', value: truncate(userAgent || 'Unknown', 100) },
      { name: 'Timestamp', value: new Date().toISOString(), inline: true },
    ],
    footer: { text: `IP: ${ip || 'Unknown'}` },
  };
  
  return sendWebhook(webhookUrl, embed);
}

/**
 * 通知：惡意網域被攔截
 * @param {string} webhookUrl 
 * @param {Object} data 
 */
export async function notifyBlockedDomain(webhookUrl, { url, ip, country }) {
  const embed = {
    title: '🚫 Blocked Domain',
    color: EVENT_COLORS.BLOCKED_DOMAIN,
    fields: [
      { name: 'Blocked URL', value: truncate(url, 200) },
      { name: 'Country', value: country || 'Unknown', inline: true },
      { name: 'Timestamp', value: new Date().toISOString(), inline: true },
    ],
    footer: { text: `IP: ${ip || 'Unknown'}` },
  };
  
  return sendWebhook(webhookUrl, embed);
}

/**
 * 通知：系統錯誤
 * @param {string} webhookUrl 
 * @param {Object} data 
 */
export async function notifySystemError(webhookUrl, { error, context, path }) {
  const embed = {
    title: '❌ System Error',
    color: EVENT_COLORS.SYSTEM_ERROR,
    fields: [
      { name: 'Error', value: truncate(error, 200) },
      { name: 'Context', value: context || 'Unknown' },
      { name: 'Path', value: path || '/', inline: true },
      { name: 'Timestamp', value: new Date().toISOString(), inline: true },
    ],
  };
  
  return sendWebhook(webhookUrl, embed);
}

/**
 * 通知：速率限制觸發
 * @param {string} webhookUrl 
 * @param {Object} data 
 */
export async function notifyRateLimited(webhookUrl, { ip, endpoint, count }) {
  const embed = {
    title: '⏱️ Rate Limit Triggered',
    color: EVENT_COLORS.RATE_LIMITED,
    fields: [
      { name: 'Endpoint', value: endpoint, inline: true },
      { name: 'Request Count', value: String(count), inline: true },
      { name: 'Timestamp', value: new Date().toISOString(), inline: true },
    ],
    footer: { text: `IP: ${ip}` },
  };
  
  return sendWebhook(webhookUrl, embed);
}

/**
 * 通知：登入成功
 * @param {string} webhookUrl 
 * @param {Object} data 
 */
export async function notifyLoginSuccess(webhookUrl, { ip, country, userAgent }) {
  const embed = {
    title: '✅ Login Success',
    color: EVENT_COLORS.LOGIN_SUCCESS,
    fields: [
      { name: 'Country', value: country || 'Unknown', inline: true },
      { name: 'User-Agent', value: truncate(userAgent || 'Unknown', 100) },
      { name: 'Timestamp', value: new Date().toISOString(), inline: true },
    ],
    footer: { text: `IP: ${ip}` },
  };
  
  return sendWebhook(webhookUrl, embed);
}

/**
 * 通知：登入失敗
 * @param {string} webhookUrl 
 * @param {Object} data 
 */
export async function notifyLoginFailed(webhookUrl, { ip, country, userAgent, attempts }) {
  const embed = {
    title: '🔐 Login Failed',
    color: EVENT_COLORS.LOGIN_FAILED,
    fields: [
      { name: 'Attempts', value: String(attempts), inline: true },
      { name: 'Country', value: country || 'Unknown', inline: true },
      { name: 'User-Agent', value: truncate(userAgent || 'Unknown', 100) },
      { name: 'Timestamp', value: new Date().toISOString(), inline: true },
    ],
    footer: { text: `IP: ${ip}` },
  };
  
  return sendWebhook(webhookUrl, embed);
}

/**
 * 通知：短網址刪除
 * @param {string} webhookUrl 
 * @param {Object} data 
 */
export async function notifyLinkDeleted(webhookUrl, { id, targetUrl, deletedBy }) {
  const embed = {
    title: '🗑️ Link Deleted',
    color: EVENT_COLORS.LINK_DELETED,
    fields: [
      { name: 'ID', value: id, inline: true },
      { name: 'Target URL', value: truncate(targetUrl || 'Unknown', 200) },
      { name: 'Deleted By', value: deletedBy || 'Admin', inline: true },
      { name: 'Timestamp', value: new Date().toISOString(), inline: true },
    ],
  };
  
  return sendWebhook(webhookUrl, embed);
}

/**
 * 截斷字串
 * @param {string} str 
 * @param {number} maxLen 
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
}

/**
 * 遮蔽 IP 位址（僅顯示部分）
 * @param {string} ip 
 * @returns {string}
 */
function maskIp(ip) {
  if (!ip) return 'Unknown';
  
  // IPv6
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 4) {
      return `${parts[0]}:${parts[1]}:****:****`;
    }
    return ip;
  }
  
  // IPv4
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***.`;
  }
  
  return ip;
}
