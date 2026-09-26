/**
 * 伺服器端渲染的輕量圖表（inline SVG / CSS bars）
 * 供透明度頁與後台分析儀表板共用；單一品牌色系，不引入外部圖表庫。
 */

import { escapeHtml } from './utils.js';

export function fmtNum(n) {
  return Number(n || 0).toLocaleString('zh-TW');
}

/**
 * 每日點擊趨勢 SVG 長條圖（單一色系、細長條、圓角端點、hover 提示）
 * @param {Array<{date: string, clicks: number}>} daily - 由舊到新
 * @param {number} showDays - 顯示最近幾天
 */
export function dailyTrendSvg(daily, showDays = 30) {
  const days = (daily || []).slice(-showDays);
  if (days.length === 0 || days.every(d => d.clicks === 0)) {
    return '<p class="text-muted text-center" style="padding:2rem 0;" data-i18n="chart.emptyClicks">尚無點擊資料</p>';
  }

  const W = 860, H = 220, padL = 44, padB = 26, padT = 10;
  const plotW = W - padL - 8;
  const plotH = H - padT - padB;
  const max = Math.max(...days.map(d => d.clicks), 1);
  const slot = plotW / days.length;
  const barW = Math.max(6, Math.min(18, slot * 0.55));

  const ticks = [0, Math.ceil(max / 2), max];
  const gridHtml = ticks.map(t => {
    const y = padT + plotH - (t / max) * plotH;
    return `<line x1="${padL}" y1="${y}" x2="${W - 8}" y2="${y}" stroke="var(--border)" stroke-width="1"/>` +
      `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--text-muted)">${t}</text>`;
  }).join('');

  const barsHtml = days.map((d, i) => {
    const h = Math.max(d.clicks > 0 ? 3 : 0, (d.clicks / max) * plotH);
    const x = padL + i * slot + (slot - barW) / 2;
    const y = padT + plotH - h;
    const labelDate = d.date.slice(5).replace('-', '/');
    return `<g class="trend-bar"><title>${labelDate}：${fmtNum(d.clicks)} 次點擊</title>` +
      `<rect x="${x - 2}" y="${padT}" width="${barW + 4}" height="${plotH}" fill="transparent"/>` +
      (h > 0 ? `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="var(--primary)"/>` : '') +
      `</g>`;
  }).join('');

  const labelIdx = [0, Math.floor(days.length / 2), days.length - 1];
  const labelsHtml = labelIdx.map(i => {
    const x = padL + i * slot + slot / 2;
    return `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${days[i].date.slice(5).replace('-', '/')}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每日點擊趨勢" style="width:100%;height:auto;">
    ${gridHtml}${barsHtml}${labelsHtml}
  </svg>`;
}

/**
 * 水平長條列表（國家 / 通報分類等排行共用）
 * @param {Array<[string, number]>} entries - 已排序（大到小）
 * @param {Function} labelFn - key → 顯示名稱
 * @param {{ keyed?: boolean }} [opts] - keyed: label 加上 data-key 屬性，供前端 i18n 換字
 */
export function barList(entries, labelFn = k => k, opts = {}) {
  if (!entries || entries.length === 0) {
    return '<p class="text-muted text-center" style="padding:1rem 0;" data-i18n="chart.empty">尚無資料</p>';
  }
  const max = entries[0][1] || 1;
  return `<div class="bar-chart">` + entries.map(([key, count]) => `
    <div class="bar-item" title="${escapeHtml(labelFn(key))}：${fmtNum(count)}">
      <span class="label"${opts.keyed ? ` data-key="${escapeHtml(key)}"` : ''}>${escapeHtml(labelFn(key))}</span>
      <div class="bar"><div class="bar-fill" style="width:${Math.max(1, count / max * 100)}%"></div></div>
      <span class="count">${fmtNum(count)}</span>
    </div>
  `).join('') + `</div>`;
}

/** 圖表共用 CSS（引入到各頁 styles） */
export const chartStyles = `
  .bar-chart { display: flex; flex-direction: column; gap: 0.5rem; }
  .bar-item { display: flex; align-items: center; gap: 0.75rem; }
  .bar-item .label {
    width: 110px;
    font-size: 0.9rem;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar-item .bar {
    flex: 1;
    height: 14px;
    background: var(--bg-light);
    border-radius: 4px;
    overflow: hidden;
  }
  .bar-item .bar-fill {
    height: 100%;
    background: var(--primary);
    border-radius: 4px;
  }
  .bar-item .count {
    width: 64px;
    text-align: right;
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .trend-bar rect { transition: opacity 0.15s; }
  .trend-bar:hover rect[fill="var(--primary)"] { opacity: 0.75; }
`;
