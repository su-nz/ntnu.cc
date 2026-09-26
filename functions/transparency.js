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
import { getReportAggregate, REPORT_CATEGORIES, REPORT_CATEGORIES_EN } from './lib/reports.js';
import { dailyTrendSvg, barList, fmtNum as fmt, chartStyles } from './lib/charts.js';

// 國別代碼 → 顯示名稱（僅列常見者，其餘直接顯示代碼）
const COUNTRY_NAMES = {
  TW: '台灣', JP: '日本', US: '美國', HK: '香港', CN: '中國',
  KR: '韓國', SG: '新加坡', MY: '馬來西亞', TH: '泰國', VN: '越南',
  GB: '英國', DE: '德國', FR: '法國', AU: '澳洲', CA: '加拿大',
  ID: '印尼', PH: '菲律賓', IN: '印度', NL: '荷蘭', MO: '澳門',
};

const COUNTRY_NAMES_EN = {
  TW: 'Taiwan', JP: 'Japan', US: 'United States', HK: 'Hong Kong', CN: 'China',
  KR: 'South Korea', SG: 'Singapore', MY: 'Malaysia', TH: 'Thailand', VN: 'Vietnam',
  GB: 'United Kingdom', DE: 'Germany', FR: 'France', AU: 'Australia', CA: 'Canada',
  ID: 'Indonesia', PH: 'Philippines', IN: 'India', NL: 'Netherlands', MO: 'Macau',
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
        <h1 data-i18n="title">平台透明度</h1>
        <p data-i18n="intro">本頁公開 ntnu.cc 的使用統計與內容治理紀錄：點擊趨勢、使用者來源，
        以及不當連結通報的處理結果。所有資料皆為匿名彙總，每 10 分鐘更新一次。</p>
        <a href="/report" class="btn" data-i18n="btn.report">通報不當連結</a>
        <a href="/" class="btn btn-secondary" data-i18n="btn.home">返回首頁</a>
        <button class="btn btn-secondary" id="langBtn" onclick="toggleLang()">EN</button>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="value">${fmt(agg.totalLinks)}</div><div class="label" data-i18n="stat.totalLinks">累計短網址</div></div>
        <div class="stat-card"><div class="value">${fmt(agg.activeLinks)}</div><div class="label" data-i18n="stat.activeLinks">有效短網址</div></div>
        <div class="stat-card"><div class="value">${fmt(agg.totalClicks)}</div><div class="label" data-i18n="stat.totalClicks">累計點擊次數</div></div>
        <div class="stat-card"><div class="value">${fmt(agg.todayClicks)}</div><div class="label" data-i18n="stat.todayClicks">今日點擊</div></div>
        <div class="stat-card"><div class="value">${fmt(reportAgg.total)}</div><div class="label" data-i18n="stat.reports">累計通報件數</div></div>
        <div class="stat-card"><div class="value">${fmt(reportAgg.byStatus.disabled)}</div><div class="label" data-i18n="stat.disabled">下架處置連結</div></div>
      </div>

      <div class="section-card">
        <h3 data-i18n="sec.trend">最近 30 天每日點擊</h3>
        ${dailyTrendSvg(agg.daily || [])}
      </div>

      <div class="two-col">
        <div class="section-card">
          <h3 data-i18n="sec.sources">使用者來源（依國家 / 地區）</h3>
          <p class="text-muted" style="font-size:0.85rem;" data-i18n="sec.sourcesNote">依 Cloudflare 邊緣節點判定之來源國別統計，不涉及任何個人身分資訊。</p>
          <div id="countryList">${barList(countries, c => COUNTRY_NAMES[c] || c, { keyed: true })}</div>
        </div>

        <div class="section-card">
          <h3 data-i18n="sec.reports">通報原因分布</h3>
          <div class="status-row">
            <span class="status-pill"><span data-i18n="status.pending">待處理</span> <strong>${fmt(reportAgg.byStatus.pending)}</strong></span>
            <span class="status-pill"><span data-i18n="status.disabled">已下架</span> <strong>${fmt(reportAgg.byStatus.disabled)}</strong></span>
            <span class="status-pill"><span data-i18n="status.dismissed">不成立</span> <strong>${fmt(reportAgg.byStatus.dismissed)}</strong></span>
          </div>
          <div id="categoryList">${barList(reportCategories, c => REPORT_CATEGORIES[c] || c, { keyed: true })}</div>
        </div>
      </div>

      <div class="section-card">
        <h3 data-i18n="sec.gov">平台治理方式</h3>
        <div class="gov-note">
          <p><strong data-i18n="gov.preview.t">轉址預覽</strong>　<span data-i18n="gov.preview.d">所有短網址在跳轉前先顯示目標網址預覽頁，使用者確認後才前往。</span></p>
          <p><strong data-i18n="gov.takedown.t">通報下架</strong>　<span data-i18n="gov.takedown.d1">任何人都可</span><a href="/report" data-i18n="gov.takedown.link">通報不當連結</a><span data-i18n="gov.takedown.d2">，經審核成立即下架，處理結果統計公開於本頁。</span></p>
          <p><strong data-i18n="gov.privacy.t">隱私最小化</strong>　<span data-i18n="gov.privacy.d">統計僅記錄匿名的國別與點擊次數；通報系統不儲存通報者 IP。</span></p>
        </div>
      </div>

      <p class="updated-note"><span data-i18n="foot.prefix">統計快照時間：</span>${escapeHtml(new Date(agg.generatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))}<span data-i18n="foot.suffix">（台北時間）・每 10 分鐘更新</span></p>
    </div>
  `;

  const scripts = `
    <script>
      const i18n = {
        'zh-TW': {
          'title': '平台透明度',
          'intro': '本頁公開 ntnu.cc 的使用統計與內容治理紀錄：點擊趨勢、使用者來源，以及不當連結通報的處理結果。所有資料皆為匿名彙總，每 10 分鐘更新一次。',
          'btn.report': '通報不當連結',
          'btn.home': '返回首頁',
          'stat.totalLinks': '累計短網址',
          'stat.activeLinks': '有效短網址',
          'stat.totalClicks': '累計點擊次數',
          'stat.todayClicks': '今日點擊',
          'stat.reports': '累計通報件數',
          'stat.disabled': '下架處置連結',
          'sec.trend': '最近 30 天每日點擊',
          'sec.sources': '使用者來源（依國家 / 地區）',
          'sec.sourcesNote': '依 Cloudflare 邊緣節點判定之來源國別統計，不涉及任何個人身分資訊。',
          'sec.reports': '通報原因分布',
          'status.pending': '待處理',
          'status.disabled': '已下架',
          'status.dismissed': '不成立',
          'sec.gov': '平台治理方式',
          'gov.preview.t': '轉址預覽',
          'gov.preview.d': '所有短網址在跳轉前先顯示目標網址預覽頁，使用者確認後才前往。',
          'gov.takedown.t': '通報下架',
          'gov.takedown.d1': '任何人都可',
          'gov.takedown.link': '通報不當連結',
          'gov.takedown.d2': '，經審核成立即下架，處理結果統計公開於本頁。',
          'gov.privacy.t': '隱私最小化',
          'gov.privacy.d': '統計僅記錄匿名的國別與點擊次數；通報系統不儲存通報者 IP。',
          'foot.prefix': '統計快照時間：',
          'foot.suffix': '（台北時間）・每 10 分鐘更新',
          'chart.empty': '尚無資料',
          'chart.emptyClicks': '尚無點擊資料'
        },
        'en': {
          'title': 'Transparency',
          'intro': 'This page publishes usage statistics and content-governance records for ntnu.cc: click trends, visitor origins, and the outcomes of abuse reports. All data is anonymous and aggregated, refreshed every 10 minutes.',
          'btn.report': 'Report a link',
          'btn.home': 'Home',
          'stat.totalLinks': 'Total links',
          'stat.activeLinks': 'Active links',
          'stat.totalClicks': 'Total clicks',
          'stat.todayClicks': 'Clicks today',
          'stat.reports': 'Abuse reports',
          'stat.disabled': 'Links taken down',
          'sec.trend': 'Daily clicks, last 30 days',
          'sec.sources': 'Visitor origins (by country / region)',
          'sec.sourcesNote': 'Country determined by Cloudflare edge location; no personal information is involved.',
          'sec.reports': 'Report categories',
          'status.pending': 'Pending',
          'status.disabled': 'Taken down',
          'status.dismissed': 'Dismissed',
          'sec.gov': 'How this platform is governed',
          'gov.preview.t': 'Redirect preview',
          'gov.preview.d': 'Every short link shows a preview of its destination before redirecting; visitors proceed only after confirming.',
          'gov.takedown.t': 'Report & takedown',
          'gov.takedown.d1': 'Anyone can ',
          'gov.takedown.link': 'report an abusive link',
          'gov.takedown.d2': '; confirmed violations are taken down and the outcomes are published on this page.',
          'gov.privacy.t': 'Data minimization',
          'gov.privacy.d': 'Statistics record only anonymous country codes and click counts; the report system does not store reporter IP addresses.',
          'foot.prefix': 'Snapshot time: ',
          'foot.suffix': ' (Taipei time), refreshed every 10 minutes',
          'chart.empty': 'No data yet',
          'chart.emptyClicks': 'No clicks yet'
        }
      };

      // 國別與通報分類的圖表標籤（key 由伺服器端 data-key 提供）
      const countryNames = {
        'zh-TW': ${JSON.stringify(COUNTRY_NAMES)},
        'en': ${JSON.stringify(COUNTRY_NAMES_EN)}
      };
      const categoryNames = {
        'zh-TW': ${JSON.stringify(REPORT_CATEGORIES)},
        'en': ${JSON.stringify(REPORT_CATEGORIES_EN)}
      };

      let currentLang = localStorage.getItem('lang') || (navigator.language.startsWith('zh') ? 'zh-TW' : 'en');

      function applyLang(lang) {
        currentLang = lang;
        try { localStorage.setItem('lang', lang); } catch {}
        document.documentElement.lang = lang;
        document.getElementById('langBtn').textContent = lang === 'zh-TW' ? 'EN' : '中';
        document.querySelectorAll('[data-i18n]').forEach(el => {
          const key = el.getAttribute('data-i18n');
          if (i18n[lang][key]) el.textContent = i18n[lang][key];
        });
        document.querySelectorAll('#countryList .label[data-key]').forEach(el => {
          const code = el.getAttribute('data-key');
          el.textContent = countryNames[lang][code] || code;
        });
        document.querySelectorAll('#categoryList .label[data-key]').forEach(el => {
          const code = el.getAttribute('data-key');
          el.textContent = categoryNames[lang][code] || code;
        });
      }

      function toggleLang() {
        applyLang(currentLang === 'zh-TW' ? 'en' : 'zh-TW');
      }

      applyLang(currentLang);
    </script>
  `;

  return baseTemplate({
    title: '平台透明度',
    content,
    styles,
    scripts,
    meta: {
      og: {
        url: 'https://ntnu.cc/transparency',
        title: '平台透明度 - ntnu.cc',
        description: '公開 ntnu.cc 短網址平台的使用現況、使用者來源與內容治理數據。',
      },
    },
  });
}
