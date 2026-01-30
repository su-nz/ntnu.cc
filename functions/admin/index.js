/**
 * 管理員後台介面
 * 路由：GET/POST /admin
 */

import { createHtmlResponse, createResponse, createErrorResponse, escapeHtml, getClientInfo } from '../lib/utils.js';
import { validateApiKey } from '../lib/validation.js';
import { checkIpLockout, recordFailedAttempt, clearFailedAttempts } from '../lib/security.js';
import { notifyLoginFailed, notifyLinkDeleted } from '../lib/discord.js';
import { adminLoginPage, baseTemplate } from '../lib/templates.js';
import { verifyCaptcha } from '../lib/security.js';

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;
  
  if (method === 'GET') {
    return handleGet(context);
  } else if (method === 'POST') {
    return handlePost(context);
  } else if (method === 'DELETE') {
    return handleDelete(context);
  }
  
  return createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED', 405);
}

/**
 * 處理 GET 請求 - 顯示登入頁面或管理介面
 */
async function handleGet(context) {
  const { request, env } = context;
  
  // 檢查 Authorization Header（API 存取）
  const authHeader = request.headers.get('Authorization');
  
  if (authHeader) {
    const apiKeyValidation = validateApiKey(request, env.ADMIN_API_KEY);
    if (!apiKeyValidation.valid) {
      return createErrorResponse('Unauthorized', apiKeyValidation.error, 401);
    }
    
    return renderAdminDashboard(context);
  }
  
  // 檢查 Cookie（網頁登入）
  const cookie = request.headers.get('Cookie') || '';
  const sessionMatch = cookie.match(/admin_session=([^;]+)/);
  
  if (sessionMatch) {
    const sessionKey = sessionMatch[1];
    const sessionData = await env.LINKS_KV.get(`session:${sessionKey}`, { type: 'json' });
    
    if (sessionData && Date.now() < sessionData.expiresAt) {
      return renderAdminDashboard(context);
    }
  }
  
  // 顯示登入頁面，傳入 CAPTCHA_SITE_KEY
  return createHtmlResponse(adminLoginPage('', env.CAPTCHA_SITE_KEY));
}

/**
 * 處理 POST 請求 - 登入驗證
 */
async function handlePost(context) {
  const { request, env } = context;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const country = request.headers.get('cf-ipcountry') || 'Unknown';
  const userAgent = request.headers.get('user-agent') || '';
  
  // 檢查 CAPTCHA 驗證
  let formData; // Declare once at the top of the function

  try {
    formData = await request.formData();
  } catch {
    return createHtmlResponse(adminLoginPage('無效的請求'), 400);
  }

  const captchaToken = formData.get('captchaToken');
  const captchaValid = await verifyCaptcha(captchaToken, env.CAPTCHA_SECRET_KEY);
  if (!captchaValid) {
    return createHtmlResponse(adminLoginPage('CAPTCHA 驗證失敗，請重試'), 400);
  }

  // 檢查 IP 鎖定
  const lockout = await checkIpLockout(env.LINKS_KV, ip);
  if (lockout.locked) {
    const retryAfter = Math.ceil((lockout.until - Date.now()) / 1000);
    return createHtmlResponse(adminLoginPage(`IP 已被鎖定，請在 ${retryAfter} 秒後重試`), 429);
  }
  
  // 解析表單
  const apiKey = formData.get('apiKey');
  
  // 驗證 API Key
  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    // 記錄失敗嘗試
    const attempt = await recordFailedAttempt(env.LINKS_KV, ip);
    
    await notifyLoginFailed(env.DISCORD_WEBHOOK_URL, {
      ip,
      country,
      userAgent,
      attempts: attempt.attempts,
    });
    
    if (attempt.locked) {
      return createHtmlResponse(adminLoginPage('登入失敗次數過多，IP 已被鎖定 15 分鐘'), 429);
    }
    
    return createHtmlResponse(adminLoginPage(`登入失敗，還剩 ${5 - attempt.attempts} 次嘗試機會`), 401);
  }
  
  // 清除失敗嘗試
  await clearFailedAttempts(env.LINKS_KV, ip);
  
  // 建立 Session
  const sessionKey = crypto.randomUUID();
  const sessionData = {
    ip,
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000, // 1 小時
  };
  
  await env.LINKS_KV.put(`session:${sessionKey}`, JSON.stringify(sessionData), {
    expirationTtl: 3600,
  });
  
  // 設定 Cookie 並重導向
  const response = await renderAdminDashboard(context);
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Set-Cookie', `admin_session=${sessionKey}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
  
  return new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  });
}

/**
 * 處理 DELETE 請求 - 刪除短網址
 */
async function handleDelete(context) {
  const { request, env } = context;
  
  // 驗證權限
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const apiKeyValidation = validateApiKey(request, env.ADMIN_API_KEY);
    if (!apiKeyValidation.valid) {
      return createErrorResponse('Unauthorized', apiKeyValidation.error, 401);
    }
  } else {
    // 檢查 Session
    const cookie = request.headers.get('Cookie') || '';
    const sessionMatch = cookie.match(/admin_session=([^;]+)/);
    
    if (!sessionMatch) {
      return createErrorResponse('Unauthorized', 'NO_SESSION', 401);
    }
    
    const sessionKey = sessionMatch[1];
    const sessionData = await env.LINKS_KV.get(`session:${sessionKey}`, { type: 'json' });
    
    if (!sessionData || Date.now() >= sessionData.expiresAt) {
      return createErrorResponse('Session expired', 'SESSION_EXPIRED', 401);
    }
  }
   
  // 解析要刪除的 ID
  let body;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse('Invalid request', 'INVALID_REQUEST', 400);
  }
  
  const { ids } = body;
  
  if (!Array.isArray(ids) || ids.length === 0) {
    return createErrorResponse('No IDs provided', 'INVALID_REQUEST', 400);
  }
  
  // 刪除短網址
  const results = [];
  for (const id of ids) {
    try {
      const targetUrl = await env.LINKS_KV.get(`link:${id}`);
      
      if (targetUrl) {
        await env.LINKS_KV.delete(`link:${id}`);
        await env.LINKS_KV.delete(`stats:${id}`);
        
        // 發送通知
        await notifyLinkDeleted(env.DISCORD_WEBHOOK_URL, {
          id,
          targetUrl,
          deletedBy: 'Admin',
        });
        
        results.push({ id, success: true });
      } else {
        results.push({ id, success: false, error: 'NOT_FOUND' });
      }
    } catch (error) {
      results.push({ id, success: false, error: 'DELETE_FAILED' });
    }
  }
  
  return createResponse({ results });
}

/**
 * 渲染管理後台
 */
async function renderAdminDashboard(context) {
  const { request, env } = context;
  
  // 取得分頁參數
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') || undefined;
  const search = url.searchParams.get('search') || '';
  const limit = 50;
  
  // 列出所有短網址
  const listResult = await env.LINKS_KV.list({
    prefix: 'link:',
    limit,
    cursor,
  });
  
  // 取得完整資料
  const links = [];
  for (const key of listResult.keys) {
    const id = key.name.replace('link:', '');
    const targetUrl = await env.LINKS_KV.get(key.name);
    const stats = await env.LINKS_KV.get(`stats:${id}`, { type: 'json' });
    
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
      targetUrl,
      clicks: stats?.clicks || 0,
      createdAt: stats?.createdAt || 'Unknown',
      lastAccess: stats?.lastAccess || 'Never',
    });
  }
  
  const html = generateAdminHtml(links, {
    cursor: listResult.cursor,
    hasMore: !listResult.list_complete,
    search,
  });
  
  return createHtmlResponse(html);
}

/**
 * 生成管理後台 HTML
 */
function generateAdminHtml(links, pagination) {
  const styles = `
    .admin-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    
    .admin-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    
    .search-box {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    
    .search-box input {
      flex: 1;
      margin-bottom: 0;
    }
    
    .links-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1rem;
    }
    
    .links-table th,
    .links-table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    
    .links-table th {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.8rem;
    }
    
    .links-table tr:hover {
      background: var(--bg-tertiary);
    }
    
    .links-table .checkbox-col {
      width: 40px;
    }
    
    .links-table .id-col {
      width: 150px;
    }
    
    .links-table .url-col {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .links-table .stats-col {
      width: 80px;
      text-align: center;
    }
    
    .links-table .actions-col {
      width: 100px;
    }
    
    .short-url {
      color: var(--accent);
      font-family: monospace;
    }
    
    .target-url {
      color: var(--text-secondary);
      font-size: 0.9rem;
    }
    
    .pagination {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-top: 1rem;
    }
    
    .stats-badge {
      background: var(--bg-tertiary);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    
    .bulk-actions {
      display: none;
      padding: 1rem;
      background: var(--bg-tertiary);
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    
    .bulk-actions.show {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .logout-link {
      color: var(--text-secondary);
    }
    
    @media (max-width: 768px) {
      .links-table {
        display: block;
        overflow-x: auto;
      }
    }
  `;
  
  const linksHtml = links.map(link => `
    <tr>
      <td class="checkbox-col">
        <input type="checkbox" class="link-checkbox" data-id="${escapeHtml(link.id)}">
      </td>
      <td class="id-col">
        <a href="/${escapeHtml(link.id)}" target="_blank" class="short-url">${escapeHtml(link.id)}</a>
      </td>
      <td class="url-col">
        <a href="${escapeHtml(link.targetUrl)}" target="_blank" class="target-url" title="${escapeHtml(link.targetUrl)}">${escapeHtml(link.targetUrl)}</a>
      </td>
      <td class="stats-col">
        <span class="stats-badge">${link.clicks}</span>
      </td>
      <td class="actions-col">
        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="copyToClipboard('https://ntnu.cc/${escapeHtml(link.id)}')">複製</button>
        <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="deleteLinks(['${escapeHtml(link.id)}'])">刪除</button>
      </td>
    </tr>
  `).join('');
  
  const paginationHtml = pagination.hasMore ? `
    <div class="pagination">
      <a href="/admin?cursor=${encodeURIComponent(pagination.cursor)}${pagination.search ? '&search=' + encodeURIComponent(pagination.search) : ''}" class="btn btn-secondary">下一頁</a>
    </div>
  ` : '';
  
  const content = `
    <div class="container">
      <div class="admin-header">
        <div>
          <h1>🔧 管理後台</h1>
          <p class="text-muted">ntnu.cc 短網址服務管理</p>
        </div>
        <div class="admin-actions">
          <a href="/admin/analytics" class="btn btn-secondary">📊 分析儀表板</a>
          <button class="btn" onclick="exportData()">📥 匯出資料</button>
          <a href="/" class="btn logout-link" onclick="logout(); return false;">登出</a>
        </div>
      </div>
      
      <div class="card">
        <form class="search-box" method="GET" action="/admin">
          <input type="text" name="search" placeholder="搜尋短碼或目標 URL..." value="${escapeHtml(pagination.search)}">
          <button type="submit" class="btn">搜尋</button>
          ${pagination.search ? '<a href="/admin" class="btn btn-secondary">清除</a>' : ''}
        </form>
        
        <div class="bulk-actions" id="bulkActions">
          <span id="selectedCount">0</span> 個項目已選取
          <button class="btn btn-danger" onclick="deleteSelected()">刪除選取</button>
          <button class="btn btn-secondary" onclick="clearSelection()">取消選取</button>
        </div>
        
        <table class="links-table">
          <thead>
            <tr>
              <th class="checkbox-col">
                <input type="checkbox" id="selectAll" onchange="toggleSelectAll()">
              </th>
              <th class="id-col">短碼</th>
              <th class="url-col">目標 URL</th>
              <th class="stats-col">點擊</th>
              <th class="actions-col">操作</th>
            </tr>
          </thead>
          <tbody>
            ${linksHtml || '<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">沒有找到任何短網址</td></tr>'}
          </tbody>
        </table>
        
        ${paginationHtml}
      </div>
    </div>
  `;
  
  const scripts = `
    <script>
      // 選取功能
      function toggleSelectAll() {
        const selectAll = document.getElementById('selectAll');
        const checkboxes = document.querySelectorAll('.link-checkbox');
        checkboxes.forEach(cb => cb.checked = selectAll.checked);
        updateBulkActions();
      }
      
      document.querySelectorAll('.link-checkbox').forEach(cb => {
        cb.addEventListener('change', updateBulkActions);
      });
      
      function updateBulkActions() {
        const checked = document.querySelectorAll('.link-checkbox:checked');
        const bulkActions = document.getElementById('bulkActions');
        const selectedCount = document.getElementById('selectedCount');
        
        if (checked.length > 0) {
          bulkActions.classList.add('show');
          selectedCount.textContent = checked.length;
        } else {
          bulkActions.classList.remove('show');
        }
      }
      
      function clearSelection() {
        document.getElementById('selectAll').checked = false;
        document.querySelectorAll('.link-checkbox').forEach(cb => cb.checked = false);
        updateBulkActions();
      }
      
      function getSelectedIds() {
        return Array.from(document.querySelectorAll('.link-checkbox:checked'))
          .map(cb => cb.dataset.id);
      }
      
      // 刪除功能
      async function deleteLinks(ids) {
        if (!confirm('確定要刪除 ' + ids.length + ' 個短網址嗎？此操作無法復原。')) {
          return;
        }
        
        try {
          const response = await fetch('/admin', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });
          
          if (response.ok) {
            location.reload();
          } else {
            const error = await response.json();
            alert('刪除失敗: ' + (error.error || 'Unknown error'));
          }
        } catch (error) {
          alert('刪除失敗: ' + error.message);
        }
      }
      
      function deleteSelected() {
        const ids = getSelectedIds();
        if (ids.length > 0) {
          deleteLinks(ids);
        }
      }
      
      // 複製功能
      function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
          alert('已複製到剪貼簿: ' + text);
        }).catch(() => {
          prompt('請手動複製:', text);
        });
      }
      
      // 匯出功能
      function exportData() {
        const format = prompt('請選擇匯出格式 (輸入 json 或 csv):', 'json');
        if (!format) return;
        
        const links = [];
        document.querySelectorAll('.links-table tbody tr').forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 4) {
            links.push({
              id: cells[1].textContent.trim(),
              url: cells[2].querySelector('a')?.href || '',
              clicks: parseInt(cells[3].textContent) || 0,
            });
          }
        });
        
        let content, filename, type;
        
        if (format.toLowerCase() === 'csv') {
          content = 'ID,URL,Clicks\\n' + links.map(l => 
            '"' + l.id + '","' + l.url + '",' + l.clicks
          ).join('\\n');
          filename = 'ntnu-cc-links.csv';
          type = 'text/csv';
        } else {
          content = JSON.stringify(links, null, 2);
          filename = 'ntnu-cc-links.json';
          type = 'application/json';
        }
        
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      
      // 登出功能
      function logout() {
        document.cookie = 'admin_session=; Path=/admin; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
        window.location.href = '/';
      }
    </script>
  `;
  
  return baseTemplate({ title: '管理後台', content, styles, scripts });
}
