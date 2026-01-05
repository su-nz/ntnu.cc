/**
 * 分析儀表板
 * 路由：GET /admin/analytics
 */

import { createHtmlResponse, createResponse, createErrorResponse, escapeHtml } from '../lib/utils.js';
import { validateApiKey } from '../lib/validation.js';
import { baseTemplate } from '../lib/templates.js';

export async function onRequestGet(context) {
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
      return Response.redirect(new URL('/admin', request.url).href, 302);
    }
    
    const sessionKey = sessionMatch[1];
    const sessionData = await env.LINKS_KV.get(`session:${sessionKey}`, { type: 'json' });
    
    if (!sessionData || Date.now() >= sessionData.expiresAt) {
      return Response.redirect(new URL('/admin', request.url).href, 302);
    }
  }
  
  // 檢查是否請求 JSON 格式
  const url = new URL(request.url);
  const format = url.searchParams.get('format');
  
  if (format === 'json') {
    return getAnalyticsJson(context);
  }
  
  return renderAnalyticsDashboard(context);
}

/**
 * 取得分析資料（JSON）
 */
async function getAnalyticsJson(context) {
  const { env } = context;
  
  // 取得所有統計資料
  const listResult = await env.LINKS_KV.list({ prefix: 'stats:' });
  
  const analytics = {
    totalLinks: 0,
    totalClicks: 0,
    countries: {},
    topLinks: [],
    recentActivity: [],
  };
  
  const linksData = [];
  
  for (const key of listResult.keys) {
    const id = key.name.replace('stats:', '');
    const stats = await env.LINKS_KV.get(key.name, { type: 'json' });
    
    if (stats) {
      analytics.totalLinks++;
      analytics.totalClicks += stats.clicks || 0;
      
      // 累計國家統計
      if (stats.countries) {
        for (const [country, count] of Object.entries(stats.countries)) {
          analytics.countries[country] = (analytics.countries[country] || 0) + count;
        }
      }
      
      linksData.push({
        id,
        clicks: stats.clicks || 0,
        lastAccess: stats.lastAccess,
        createdAt: stats.createdAt,
      });
    }
  }
  
  // 排序取得熱門短碼
  linksData.sort((a, b) => b.clicks - a.clicks);
  analytics.topLinks = linksData.slice(0, 10);
  
  // 最近存取
  linksData.sort((a, b) => {
    if (!a.lastAccess) return 1;
    if (!b.lastAccess) return -1;
    return new Date(b.lastAccess) - new Date(a.lastAccess);
  });
  analytics.recentActivity = linksData.slice(0, 10);
  
  return createResponse(analytics);
}

/**
 * 渲染分析儀表板
 */
async function renderAnalyticsDashboard(context) {
  const { env } = context;
  
  // 取得統計資料
  const listResult = await env.LINKS_KV.list({ prefix: 'stats:' });
  
  let totalLinks = 0;
  let totalClicks = 0;
  const countries = {};
  const linksData = [];
  
  for (const key of listResult.keys) {
    const id = key.name.replace('stats:', '');
    const stats = await env.LINKS_KV.get(key.name, { type: 'json' });
    
    if (stats) {
      totalLinks++;
      totalClicks += stats.clicks || 0;
      
      if (stats.countries) {
        for (const [country, count] of Object.entries(stats.countries)) {
          countries[country] = (countries[country] || 0) + count;
        }
      }
      
      linksData.push({
        id,
        clicks: stats.clicks || 0,
        lastAccess: stats.lastAccess,
      });
    }
  }
  
  // 熱門短碼
  const topLinks = [...linksData].sort((a, b) => b.clicks - a.clicks).slice(0, 10);
  
  // 國家排序
  const sortedCountries = Object.entries(countries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const html = generateAnalyticsHtml({
    totalLinks,
    totalClicks,
    topLinks,
    countries: sortedCountries,
  });
  
  return createHtmlResponse(html);
}

/**
 * 生成分析儀表板 HTML
 */
function generateAnalyticsHtml(data) {
  const styles = `
    .analytics-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .stat-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: center;
    }
    
    .stat-card .value {
      font-size: 2.5rem;
      font-weight: bold;
      color: var(--accent);
      margin-bottom: 0.5rem;
    }
    
    .stat-card .label {
      color: var(--text-secondary);
      text-transform: uppercase;
      font-size: 0.8rem;
    }
    
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .chart-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
    }
    
    .chart-card h3 {
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .ranking-list {
      list-style: none;
    }
    
    .ranking-list li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      border-bottom: 1px solid var(--border);
    }
    
    .ranking-list li:last-child {
      border-bottom: none;
    }
    
    .ranking-list .rank {
      width: 30px;
      height: 30px;
      background: var(--bg-tertiary);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      margin-right: 1rem;
    }
    
    .ranking-list .rank.top3 {
      background: var(--accent);
      color: white;
    }
    
    .ranking-list .info {
      flex: 1;
    }
    
    .ranking-list .info .id {
      font-family: monospace;
      color: var(--accent);
    }
    
    .ranking-list .value {
      font-weight: bold;
    }
    
    .bar-chart {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    
    .bar-item {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .bar-item .label {
      width: 50px;
      font-weight: bold;
    }
    
    .bar-item .bar {
      flex: 1;
      height: 24px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
    }
    
    .bar-item .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--accent-hover));
      border-radius: 4px;
      transition: width 0.5s ease;
    }
    
    .bar-item .count {
      width: 60px;
      text-align: right;
      color: var(--text-secondary);
    }
    
    .search-single {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    
    .search-single input {
      flex: 1;
      margin-bottom: 0;
    }
    
    #singleResult {
      display: none;
    }
    
    #singleResult.show {
      display: block;
    }
    
    @media (max-width: 768px) {
      .charts-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  
  // 熱門短碼列表
  const topLinksHtml = data.topLinks.map((link, index) => `
    <li>
      <span class="rank ${index < 3 ? 'top3' : ''}">${index + 1}</span>
      <div class="info">
        <a href="/${escapeHtml(link.id)}" target="_blank" class="id">${escapeHtml(link.id)}</a>
      </div>
      <span class="value">${link.clicks.toLocaleString()}</span>
    </li>
  `).join('');
  
  // 國家統計長條圖
  const maxCountryClicks = data.countries.length > 0 ? data.countries[0][1] : 0;
  const countriesHtml = data.countries.map(([country, count]) => `
    <div class="bar-item">
      <span class="label">${escapeHtml(country)}</span>
      <div class="bar">
        <div class="bar-fill" style="width: ${maxCountryClicks > 0 ? (count / maxCountryClicks * 100) : 0}%"></div>
      </div>
      <span class="count">${count.toLocaleString()}</span>
    </div>
  `).join('');
  
  const content = `
    <div class="container">
      <div class="analytics-header">
        <div>
          <h1>📊 分析儀表板</h1>
          <p class="text-muted">短網址使用統計與分析</p>
        </div>
        <div>
          <a href="/admin" class="btn btn-secondary">← 返回管理後台</a>
          <a href="/admin/analytics?format=json" class="btn btn-secondary" target="_blank">📥 JSON</a>
        </div>
      </div>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="value">${data.totalLinks.toLocaleString()}</div>
          <div class="label">總短網址數</div>
        </div>
        <div class="stat-card">
          <div class="value">${data.totalClicks.toLocaleString()}</div>
          <div class="label">總點擊次數</div>
        </div>
        <div class="stat-card">
          <div class="value">${data.countries.length}</div>
          <div class="label">來源國家數</div>
        </div>
        <div class="stat-card">
          <div class="value">${data.totalLinks > 0 ? (data.totalClicks / data.totalLinks).toFixed(1) : 0}</div>
          <div class="label">平均點擊數</div>
        </div>
      </div>
      
      <div class="card mb-3">
        <h3>🔍 單一短碼查詢</h3>
        <div class="search-single">
          <input type="text" id="searchId" placeholder="輸入短碼 ID...">
          <button class="btn" onclick="searchSingleLink()">查詢</button>
        </div>
        <div id="singleResult" class="alert"></div>
      </div>
      
      <div class="charts-grid">
        <div class="chart-card">
          <h3>🔥 熱門短碼排行</h3>
          <ul class="ranking-list">
            ${topLinksHtml || '<li class="text-muted text-center">暫無資料</li>'}
          </ul>
        </div>
        
        <div class="chart-card">
          <h3>🌍 來源國家統計</h3>
          <div class="bar-chart">
            ${countriesHtml || '<p class="text-muted text-center">暫無資料</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
  
  const scripts = `
    <script>
      async function searchSingleLink() {
        const id = document.getElementById('searchId').value.trim();
        const resultDiv = document.getElementById('singleResult');
        
        if (!id) {
          resultDiv.className = 'alert alert-warning show';
          resultDiv.textContent = '請輸入短碼 ID';
          return;
        }
        
        try {
          const response = await fetch('/api/stats/' + encodeURIComponent(id), {
            headers: {
              'Authorization': 'Bearer ' + getApiKey(),
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            resultDiv.className = 'alert alert-success show';
            resultDiv.innerHTML = \`
              <strong>短碼:</strong> \${data.id}<br>
              <strong>目標 URL:</strong> <a href="\${data.targetUrl}" target="_blank">\${data.targetUrl}</a><br>
              <strong>點擊次數:</strong> \${data.stats.clicks}<br>
              <strong>最後存取:</strong> \${data.stats.lastAccess || '從未'}<br>
              <strong>來源國家:</strong> \${Object.entries(data.stats.countries || {}).map(([c, n]) => c + '(' + n + ')').join(', ') || '無'}
            \`;
          } else {
            const error = await response.json();
            resultDiv.className = 'alert alert-error show';
            resultDiv.textContent = '查詢失敗: ' + (error.error || 'Unknown error');
          }
        } catch (error) {
          resultDiv.className = 'alert alert-error show';
          resultDiv.textContent = '查詢失敗: ' + error.message;
        }
      }
      
      function getApiKey() {
        // 從 Cookie 取得 session 作為臨時 token，或使用預設
        return '';
      }
      
      // Enter 鍵查詢
      document.getElementById('searchId').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          searchSingleLink();
        }
      });
    </script>
  `;
  
  return baseTemplate({ title: '分析儀表板', content, styles, scripts });
}
