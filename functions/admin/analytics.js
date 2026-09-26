/**
 * 分析儀表板
 * 路由：GET /admin/analytics（HTML / ?format=json）
 *       POST /admin/analytics（action: refresh | rebuild-baseline）
 *
 * 效能：讀取聚合快照（見 lib/aggregate.js），不再逐筆掃描 stats: key。
 */

import { createHtmlResponse, createResponse, createErrorResponse, escapeHtml } from '../lib/utils.js';
import { baseTemplate } from '../lib/templates.js';
import { verifyAdmin } from '../lib/auth.js';
import { getAggregate, refreshSnapshot, rebuildBaseline } from '../lib/aggregate.js';
import { getReportAggregate, REPORT_CATEGORIES } from '../lib/reports.js';
import { dailyTrendSvg, barList, fmtNum, chartStyles } from '../lib/charts.js';

export async function onRequestGet(context) {
  const { request } = context;

  const auth = await verifyAdmin(context);
  if (!auth.ok) {
    if (request.headers.get('Authorization')) {
      return createErrorResponse('Unauthorized', auth.error, 401);
    }
    return Response.redirect(new URL('/admin', request.url).href, 302);
  }

  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'json') {
    return getAnalyticsJson(context);
  }

  return renderAnalyticsDashboard(context);
}

/**
 * 快照維運操作（後台按鈕呼叫）
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await verifyAdmin(context);
  if (!auth.ok) {
    return createErrorResponse('Unauthorized', auth.error, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse('Invalid request', 'INVALID_REQUEST', 400);
  }

  if (body.action === 'refresh') {
    const snapshot = await refreshSnapshot(env.LINKS_KV);
    return createResponse({ success: true, refreshed: !!snapshot });
  }

  if (body.action === 'rebuild-baseline') {
    // 分批重建歷史基線；前端會依 done=false 續呼叫直到完成
    const result = await rebuildBaseline(env.LINKS_KV, { batchSize: 100 });
    return createResponse({ success: true, ...result });
  }

  return createErrorResponse('Unknown action', 'INVALID_ACTION', 400);
}

/**
 * 取得分析資料（JSON）
 */
async function getAnalyticsJson(context) {
  const { env } = context;
  const [agg, reportAgg] = await Promise.all([
    getAggregate(env.LINKS_KV, context.waitUntil.bind(context)),
    getReportAggregate(env.LINKS_KV),
  ]);

  return createResponse({
    generatedAt: agg.generatedAt,
    totalLinks: agg.totalLinks,
    activeLinks: agg.activeLinks,
    totalClicks: agg.totalClicks,
    todayClicks: agg.todayClicks,
    todayCreated: agg.todayCreated,
    countries: agg.byCountry,
    topLinks: agg.top10,
    daily: agg.daily,
    reports: reportAgg,
    baselineAt: agg.baselineAt || null,
  });
}

/**
 * 渲染分析儀表板
 */
async function renderAnalyticsDashboard(context) {
  const { env } = context;

  const [agg, reportAgg] = await Promise.all([
    getAggregate(env.LINKS_KV, context.waitUntil.bind(context)),
    getReportAggregate(env.LINKS_KV),
  ]);

  const countries = Object.entries(agg.byCountry || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const reportCategories = Object.entries(reportAgg.byCategory || {})
    .sort((a, b) => b[1] - a[1]);

  const styles = `
    .analytics-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .stat-card {
      background: var(--bg-white);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      text-align: center;
    }

    .stat-card .value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--primary);
      font-variant-numeric: tabular-nums;
    }

    .stat-card .label {
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-top: 0.25rem;
    }

    .chart-card {
      background: var(--bg-white);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: var(--shadow-sm);
    }

    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }

    ${chartStyles}

    .ranking-list { list-style: none; }
    .ranking-list li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0.25rem;
      border-bottom: 1px solid var(--border);
    }
    .ranking-list li:last-child { border-bottom: none; }
    .ranking-list .rank {
      width: 28px; height: 28px;
      background: var(--bg-light);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: bold; margin-right: 0.75rem;
      font-size: 0.85rem;
    }
    .ranking-list .rank.top3 { background: var(--primary); color: white; }
    .ranking-list .info { flex: 1; }
    .ranking-list .info .id { font-family: monospace; }
    .ranking-list .value { font-weight: bold; font-variant-numeric: tabular-nums; }

    .maint-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .maint-note { color: var(--text-muted); font-size: 0.85rem; margin: 0; }
    #maintStatus { font-size: 0.9rem; }

    .search-single { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .search-single input { flex: 1; margin-bottom: 0; }
    #singleResult { display: none; }
    #singleResult.show { display: block; }

    @media (max-width: 768px) {
      .charts-grid { grid-template-columns: 1fr; }
    }
  `;

  const topLinksHtml = (agg.top10 || []).map((link, index) => `
    <li>
      <span class="rank ${index < 3 ? 'top3' : ''}">${index + 1}</span>
      <div class="info">
        <a href="/${escapeHtml(link.id)}" target="_blank" class="id">${escapeHtml(link.id)}</a>
      </div>
      <span class="value">${fmtNum(link.clicks)}</span>
    </li>
  `).join('');

  const pendingBadge = reportAgg.byStatus.pending > 0
    ? ` <span style="background:var(--error);color:#fff;border-radius:999px;padding:0.1rem 0.5rem;font-size:0.8rem;">${reportAgg.byStatus.pending}</span>`
    : '';

  const content = `
    <div class="container">
      <div class="analytics-header">
        <div>
          <h1>📊 分析儀表板</h1>
          <p class="text-muted">短網址使用統計與分析・快照時間 ${escapeHtml(new Date(agg.generatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }))}</p>
        </div>
        <div>
          <a href="/admin" class="btn btn-secondary">← 返回管理後台</a>
          <a href="/admin/reports" class="btn btn-secondary">🚩 通報管理${pendingBadge}</a>
          <a href="/admin/analytics?format=json" class="btn btn-secondary" target="_blank">📥 JSON</a>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="value">${fmtNum(agg.totalLinks)}</div><div class="label">總短網址數</div></div>
        <div class="stat-card"><div class="value">${fmtNum(agg.activeLinks)}</div><div class="label">有效短網址</div></div>
        <div class="stat-card"><div class="value">${fmtNum(agg.totalClicks)}</div><div class="label">總點擊次數</div></div>
        <div class="stat-card"><div class="value">${fmtNum(agg.todayClicks)}</div><div class="label">今日點擊</div></div>
        <div class="stat-card"><div class="value">${fmtNum(agg.todayCreated)}</div><div class="label">今日新增</div></div>
        <div class="stat-card"><div class="value">${fmtNum(reportAgg.byStatus.pending)}</div><div class="label">待處理通報</div></div>
      </div>

      <div class="chart-card">
        <h3>📈 最近 30 天每日點擊</h3>
        ${dailyTrendSvg(agg.daily || [])}
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
          ${barList(countries)}
        </div>

        <div class="chart-card">
          <h3>🚩 通報分類統計</h3>
          ${barList(reportCategories, c => (REPORT_CATEGORIES[c] || c))}
          <p class="text-muted mt-2" style="font-size:0.85rem;">累計 ${fmtNum(reportAgg.total)} 件・已下架 ${fmtNum(reportAgg.byStatus.disabled)} 件・<a href="/admin/reports">前往通報管理 →</a></p>
        </div>

        <div class="chart-card">
          <h3>🔍 單一短碼查詢</h3>
          <div class="search-single">
            <input type="text" id="searchId" placeholder="輸入短碼 ID...">
            <button class="btn" onclick="searchSingleLink()">查詢</button>
          </div>
          <div id="singleResult" class="alert"></div>
        </div>
      </div>

      <div class="chart-card">
        <h3>🛠️ 統計資料維運</h3>
        <div class="maint-row">
          <button class="btn btn-secondary" id="refreshBtn" onclick="refreshSnapshot()">🔄 立即重算快照</button>
          <button class="btn btn-secondary" id="rebuildBtn" onclick="rebuildBaseline()">🏗️ 重建歷史基線</button>
          <span id="maintStatus" class="text-muted"></span>
        </div>
        <p class="maint-note mt-2">
          快照每 10 分鐘自動更新。「重建歷史基線」會完整掃描既有統計資料，
          補齊部署聚合功能前的國家/日期分布並校正總點擊數（分批進行，只讀取與補寫統計欄位，不影響連結本體）。
          ${agg.baselineAt ? `上次基線：${escapeHtml(new Date(agg.baselineAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }))}` : '目前尚未建立基線，建議執行一次。'}
        </p>
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
          const response = await fetch('/api/stats/' + encodeURIComponent(id));

          if (response.ok) {
            const data = await response.json();
            resultDiv.className = 'alert alert-success show';
            // 用 DOM API 組裝，targetUrl 為使用者可控資料，不可進 innerHTML（防 stored XSS）
            resultDiv.replaceChildren();
            const addRow = (label, node) => {
              const strong = document.createElement('strong');
              strong.textContent = label + ': ';
              resultDiv.appendChild(strong);
              resultDiv.appendChild(typeof node === 'string' ? document.createTextNode(node) : node);
              resultDiv.appendChild(document.createElement('br'));
            };
            const urlLink = document.createElement('a');
            urlLink.textContent = data.targetUrl;
            urlLink.target = '_blank';
            urlLink.rel = 'noopener';
            try { urlLink.href = new URL(data.targetUrl).href; } catch { /* 非法 URL 就不給 href */ }
            addRow('短碼', String(data.id));
            addRow('目標 URL', urlLink);
            addRow('點擊次數', String(data.stats ? data.stats.clicks : 0));
            addRow('最後存取', (data.stats && data.stats.lastAccess) || '從未');
            addRow('來源國家', Object.entries((data.stats && (data.stats.clicksByCountry || data.stats.countries)) || {}).map(([c, n]) => c + '(' + n + ')').join(', ') || '無');
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

      document.getElementById('searchId').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchSingleLink();
      });

      const maintStatus = document.getElementById('maintStatus');

      async function postAction(action) {
        const response = await fetch('/admin/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }

      async function refreshSnapshot() {
        const btn = document.getElementById('refreshBtn');
        btn.disabled = true;
        maintStatus.textContent = '重算中...';
        try {
          await postAction('refresh');
          maintStatus.textContent = '快照已更新，重新載入頁面...';
          location.reload();
        } catch (err) {
          maintStatus.textContent = '重算失敗: ' + err.message;
          btn.disabled = false;
        }
      }

      async function rebuildBaseline() {
        const btn = document.getElementById('rebuildBtn');
        if (!confirm('將分批掃描全部統計資料重建歷史基線，資料量大時需要一點時間。確定執行？')) return;
        btn.disabled = true;
        let total = 0;
        try {
          // 依 done 旗標分批續跑，避免單次請求超出子請求上限
          let result;
          do {
            maintStatus.textContent = '基線重建中... 已處理 ' + total + ' 筆';
            result = await postAction('rebuild-baseline');
            total = result.totalProcessed || total;
          } while (!result.done);
          maintStatus.textContent = '基線重建完成（共 ' + total + ' 筆），重新載入...';
          location.reload();
        } catch (err) {
          maintStatus.textContent = '重建失敗: ' + err.message + '（可再按一次從進度續跑）';
          btn.disabled = false;
        }
      }
    </script>
  `;

  return createHtmlResponse(baseTemplate({ title: '分析儀表板', content, styles, scripts }));
}
