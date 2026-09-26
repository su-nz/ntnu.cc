/**
 * 平台透明度頁（公開）
 * 路由：GET /transparency
 *
 * 呼應網路治理的透明度原則：公開平台使用現況（點擊、來源）與
 * 內容治理數據（通報分類、處理結果），資料來自聚合快照，讀取成本 O(1)。
 */

import { createHtmlResponse, escapeHtml } from './lib/utils.js';
import { baseTemplate } from './lib/templates.js';
import { getAggregate } from './lib/aggregate.js';
import { getReportAggregate, REPORT_CATEGORIES } from './lib/reports.js';
import { dailyTrendSvg, barList, fmtNum as fmt, chartStyles } from './lib/charts.js';

// 國別代碼 → 顯示名稱（僅列常見者，其餘直接顯示代碼）
const COUNTRY_NAMES = {
  TW: '台灣', JP: '日本', US: '美國', HK: '香港', CN: '中國',
  KR: '韓國', SG: '新加坡', MY: '馬來西亞', TH: '泰國', VN: '越南',
  GB: '英國', DE: '德國', FR: '法國', AU: '澳洲', CA: '加拿大',
  ID: '印尼', PH: '菲律賓', IN: '印度', NL: '荷蘭', MO: '澳門',
};

export async function onRequestGet(context) {
  const { env } = context;

  let agg;
  let reportAgg;
  try {
    [agg, reportAgg] = await Promise.all([
      getAggregate(env.LINKS_KV, context.waitUntil.bind(context)),
      getReportAggregate(env.LINKS_KV),
    ]);
  } catch (error) {
    console.error('Transparency page error:', error);
    agg = { totalLinks: 0, activeLinks: 0, totalClicks: 0, todayClicks: 0, daily: [], byCountry: {}, top10: [], generatedAt: new Date().toISOString() };
    reportAgg = { total: 0, byCategory: {}, byStatus: { pending: 0, disabled: 0, dismissed: 0 } };
  }

  const html = renderPage(agg, reportAgg);
  const response = createHtmlResponse(html);
  response.headers.set('Cache-Control', 'public, max-age=300');
  return response;
}

function renderPage(agg, reportAgg) {
  const countries = Object.entries(agg.byCountry || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const reportCategories = Object.entries(reportAgg.byCategory || {})
    .sort((a, b) => b[1] - a[1]);

  const styles = `
    .trans-header { text-align: center; margin-bottom: 2rem; }
    .trans-header p { max-width: 720px; margin: 0 auto 1rem; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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

    .section-card {
      background: var(--bg-white);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: var(--shadow-sm);
    }
    .section-card h3 {
      font-size: 1.05rem;
      border-left: 3px solid var(--primary);
      padding-left: 0.75rem;
      line-height: 1.3;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }
    @media (max-width: 768px) {
      .two-col { grid-template-columns: 1fr; }
    }

    ${chartStyles}

    .status-row {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.4rem 1rem;
      font-size: 0.9rem;
      color: var(--text-secondary);
    }
    .status-pill strong { color: var(--text-primary); font-variant-numeric: tabular-nums; }

    .gov-note {
      background: var(--bg-light);
      border-left: 4px solid var(--primary);
      border-radius: 0 8px 8px 0;
      padding: 1rem 1.25rem;
      margin-top: 0.5rem;
    }
    .gov-note p:last-child { margin-bottom: 0; }
    .updated-note { text-align: center; color: var(--text-muted); font-size: 0.85rem; }
  `;

  const content = `
    <div class="container">
      <div class="trans-header">
        <h1>平台透明度</h1>
        <p>本頁公開 ntnu.cc 的使用統計與內容治理紀錄：點擊趨勢、使用者來源，
        以及不當連結通報的處理結果。所有資料皆為匿名彙總，每 10 分鐘更新一次。</p>
        <a href="/report" class="btn">通報不當連結</a>
        <a href="/" class="btn btn-secondary">返回首頁</a>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="value">${fmt(agg.totalLinks)}</div><div class="label">累計短網址</div></div>
        <div class="stat-card"><div class="value">${fmt(agg.activeLinks)}</div><div class="label">有效短網址</div></div>
        <div class="stat-card"><div class="value">${fmt(agg.totalClicks)}</div><div class="label">累計點擊次數</div></div>
        <div class="stat-card"><div class="value">${fmt(agg.todayClicks)}</div><div class="label">今日點擊</div></div>
        <div class="stat-card"><div class="value">${fmt(reportAgg.total)}</div><div class="label">累計通報件數</div></div>
        <div class="stat-card"><div class="value">${fmt(reportAgg.byStatus.disabled)}</div><div class="label">下架處置連結</div></div>
      </div>

      <div class="section-card">
        <h3>最近 30 天每日點擊</h3>
        ${dailyTrendSvg(agg.daily || [])}
      </div>

      <div class="two-col">
        <div class="section-card">
          <h3>使用者來源（依國家 / 地區）</h3>
          <p class="text-muted" style="font-size:0.85rem;">依 Cloudflare 邊緣節點判定之來源國別統計，不涉及任何個人身分資訊。</p>
          ${barList(countries, c => COUNTRY_NAMES[c] || c)}
        </div>

        <div class="section-card">
          <h3>通報原因分布</h3>
          <div class="status-row">
            <span class="status-pill">待處理 <strong>${fmt(reportAgg.byStatus.pending)}</strong></span>
            <span class="status-pill">已下架 <strong>${fmt(reportAgg.byStatus.disabled)}</strong></span>
            <span class="status-pill">不成立 <strong>${fmt(reportAgg.byStatus.dismissed)}</strong></span>
          </div>
          ${barList(reportCategories, c => REPORT_CATEGORIES[c] || c)}
        </div>
      </div>

      <div class="section-card">
        <h3>平台治理方式</h3>
        <div class="gov-note">
          <p><strong>建立限制</strong>　短網址僅限師大校園網路（140.122.0.0/16）建立，並須通過人機驗證。</p>
          <p><strong>轉址預覽</strong>　所有短網址在跳轉前先顯示目標網址預覽頁，使用者確認後才前往。</p>
          <p><strong>通報下架</strong>　任何人都可<a href="/report">通報不當連結</a>，經審核成立即下架，處理結果統計公開於本頁。</p>
          <p><strong>隱私最小化</strong>　統計僅記錄匿名的國別與點擊次數；通報系統不儲存通報者 IP。</p>
        </div>
      </div>

      <p class="updated-note">統計快照時間：${escapeHtml(new Date(agg.generatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }))}（台北時間）・每 10 分鐘更新</p>
    </div>
  `;

  return baseTemplate({
    title: '平台透明度',
    content,
    styles,
    meta: {
      og: {
        url: 'https://ntnu.cc/transparency',
        title: '平台透明度 - ntnu.cc',
        description: '公開 ntnu.cc 短網址平台的使用現況、使用者來源與內容治理數據。',
      },
    },
  });
}
