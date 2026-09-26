/**
 * 通報管理後台
 * 路由：GET /admin/reports（HTML / ?format=json）
 *       POST /admin/reports（action: resolve | reopen | toggle-link）
 */

import { createHtmlResponse, createResponse, createErrorResponse, escapeHtml, kvExpiration } from '../lib/utils.js';
import { baseTemplate } from '../lib/templates.js';
import { verifyAdmin } from '../lib/auth.js';
import { listReports, updateReportStatus, REPORT_CATEGORIES, REPORT_STATUS } from '../lib/reports.js';
import { notifyLinkDeleted } from '../lib/discord.js';

const DETAIL_FETCH_LIMIT = 100; // 只為最新 N 筆讀取完整內容，控制子請求數

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await verifyAdmin(context);
  if (!auth.ok) {
    if (request.headers.get('Authorization')) {
      return createErrorResponse('Unauthorized', auth.error, 401);
    }
    return Response.redirect(new URL('/admin', request.url).href, 302);
  }

  const { reports } = await listReports(env.LINKS_KV);

  // 為最新的通報補上完整內容（detail / country）與連結現況
  const detailed = await Promise.all(reports.slice(0, DETAIL_FETCH_LIMIT).map(async (r) => {
    try {
      const [record, link] = await Promise.all([
        env.LINKS_KV.get(r.key, { type: 'json' }),
        env.LINKS_KV.getWithMetadata(`link:${r.id}`),
      ]);
      return {
        ...r,
        detail: record ? record.detail : '',
        country: record ? record.country : '',
        resolvedAt: record ? record.resolvedAt : null,
        linkExists: link.value !== null,
        linkDisabled: !!(link.metadata && link.metadata.disabled),
        targetUrl: link.value || '',
      };
    } catch {
      return { ...r, detail: '', country: '', linkExists: false, linkDisabled: false, targetUrl: '' };
    }
  }));

  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'json') {
    return createResponse({ reports: detailed, total: reports.length });
  }

  return createHtmlResponse(renderReportsPage(detailed, reports.length));
}

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

  const { action } = body;

  // 更新通報狀態；處置為 disabled 時同時下架連結
  if (action === 'resolve') {
    const { key, disposition } = body;
    if (!key || !['disabled', 'dismissed'].includes(disposition)) {
      return createErrorResponse('Invalid parameters', 'INVALID_REQUEST', 400);
    }

    const record = await updateReportStatus(env.LINKS_KV, key, disposition);
    if (!record) {
      return createErrorResponse('Report not found', 'NOT_FOUND', 404);
    }

    if (disposition === 'disabled') {
      await setLinkDisabled(context, record.id, true);
    }

    return createResponse({ success: true, status: disposition });
  }

  // 重新開啟通報
  if (action === 'reopen') {
    const record = await updateReportStatus(env.LINKS_KV, body.key, 'pending');
    if (!record) {
      return createErrorResponse('Report not found', 'NOT_FOUND', 404);
    }
    return createResponse({ success: true, status: 'pending' });
  }

  // 手動切換連結停用狀態（不經由通報）
  if (action === 'toggle-link') {
    const { id, disabled } = body;
    if (!id) {
      return createErrorResponse('Invalid parameters', 'INVALID_REQUEST', 400);
    }
    const ok = await setLinkDisabled(context, id, !!disabled);
    if (!ok) {
      return createErrorResponse('Link not found', 'NOT_FOUND', 404);
    }
    return createResponse({ success: true, disabled: !!disabled });
  }

  return createErrorResponse('Unknown action', 'INVALID_ACTION', 400);
}

/**
 * 停用 / 恢復連結：只改 metadata.disabled，保留值、其餘 metadata 與到期時間。
 * 另清除本節點的轉址快取（其他節點最多殘留 5 分鐘後過期）。
 */
async function setLinkDisabled(context, id, disabled) {
  const { env } = context;
  const { value, metadata } = await env.LINKS_KV.getWithMetadata(`link:${id}`);
  if (value === null) return false;

  const expiry = kvExpiration(metadata && metadata.expiresAt);
  if (expiry.mode === 'expired') return false; // 即將自然消失，不需處理

  const newMeta = { ...(metadata || {}), disabled };
  await env.LINKS_KV.put(
    `link:${id}`,
    value,
    expiry.mode === 'active' ? { metadata: newMeta, expiration: expiry.expiration } : { metadata: newMeta }
  );

  try {
    await caches.default.delete(new URL(`https://cache.ntnu.cc/link/${id}`).toString());
  } catch {
    // 快取刪除失敗無妨，5 分鐘內自然過期
  }

  if (disabled) {
    context.waitUntil(notifyLinkDeleted(env.DISCORD_WEBHOOK_URL, {
      id,
      targetUrl: value,
      deletedBy: 'Admin（通報下架/停用，資料保留）',
    }));
  }

  return true;
}

function renderReportsPage(reports, total) {
  const styles = `
    .reports-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .filter-row {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .filter-row .btn.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .report-card {
      background: var(--bg-white);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .report-card.status-disabled { border-left: 4px solid var(--error); }
    .report-card.status-dismissed { border-left: 4px solid var(--text-muted); opacity: 0.75; }
    .report-card.status-pending { border-left: 4px solid var(--warning); }

    .report-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .report-meta { color: var(--text-muted); font-size: 0.85rem; }
    .report-detail {
      background: var(--bg-light);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin: 0.75rem 0;
      font-size: 0.95rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .report-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .report-actions .btn { padding: 0.4rem 0.9rem; font-size: 0.85rem; }

    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 0.15rem 0.6rem;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge-pending { background: rgba(245,158,11,0.15); color: var(--warning); }
    .badge-disabled { background: rgba(239,68,68,0.12); color: var(--error); }
    .badge-dismissed { background: var(--bg-light); color: var(--text-muted); }
    .badge-category { background: var(--bg-light); color: var(--text-secondary); font-weight: 400; }

    .link-line {
      font-size: 0.9rem;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
  `;

  const cardsHtml = reports.map(r => {
    const statusLabel = REPORT_STATUS[r.status] || r.status;
    const categoryLabel = REPORT_CATEGORIES[r.category] || r.category;
    const created = r.createdAt ? new Date(r.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '';
    const linkState = !r.linkExists
      ? '<span class="badge badge-dismissed">連結已不存在</span>'
      : (r.linkDisabled ? '<span class="badge badge-disabled">連結已停用</span>' : '<span class="badge badge-pending">連結仍在線上</span>');

    const actions = [];
    if (r.status === 'pending') {
      actions.push(`<button class="btn btn-danger" onclick="resolveReport('${escapeHtml(r.key)}', 'disabled')">成立並下架</button>`);
      actions.push(`<button class="btn btn-secondary" onclick="resolveReport('${escapeHtml(r.key)}', 'dismissed')">不成立</button>`);
    } else {
      actions.push(`<button class="btn btn-secondary" onclick="reopenReport('${escapeHtml(r.key)}')">重新開啟</button>`);
    }
    if (r.linkExists) {
      actions.push(r.linkDisabled
        ? `<button class="btn btn-secondary" onclick="toggleLink('${escapeHtml(r.id)}', false)">恢復連結</button>`
        : `<button class="btn btn-secondary" onclick="toggleLink('${escapeHtml(r.id)}', true)">停用連結</button>`);
    }

    return `
    <div class="report-card status-${escapeHtml(r.status)}" data-status="${escapeHtml(r.status)}">
      <div class="report-top">
        <div>
          <strong><a href="/${escapeHtml(r.id)}" target="_blank" rel="noopener" style="font-family:monospace;">${escapeHtml(r.id)}</a></strong>
          <span class="badge badge-category">${escapeHtml(categoryLabel)}</span>
          <span class="badge badge-${escapeHtml(r.status)}">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="report-meta">${escapeHtml(created)}・來源 ${escapeHtml(r.country || 'Unknown')}</div>
      </div>
      ${r.targetUrl ? `<div class="link-line">→ <a href="${escapeHtml(r.targetUrl)}" target="_blank" rel="noopener">${escapeHtml(r.targetUrl)}</a> ${linkState}</div>` : `<div class="link-line">${linkState}</div>`}
      ${r.detail ? `<div class="report-detail">${escapeHtml(r.detail)}</div>` : ''}
      <div class="report-actions">${actions.join('')}</div>
    </div>
    `;
  }).join('');

  const content = `
    <div class="container">
      <div class="reports-header">
        <div>
          <h1>通報管理</h1>
          <p class="text-muted">共 ${total} 件通報${total > reports.length ? `（顯示最新 ${reports.length} 件）` : ''}</p>
        </div>
        <div>
          <a href="/admin" class="btn btn-secondary">← 返回管理後台</a>
          <a href="/admin/analytics" class="btn btn-secondary">分析儀表板</a>
          <a href="/transparency" class="btn btn-secondary" target="_blank">透明度頁</a>
        </div>
      </div>

      <div class="filter-row">
        <button class="btn btn-secondary active" data-filter="all" onclick="setFilter('all', this)">全部</button>
        <button class="btn btn-secondary" data-filter="pending" onclick="setFilter('pending', this)">待處理</button>
        <button class="btn btn-secondary" data-filter="disabled" onclick="setFilter('disabled', this)">已下架</button>
        <button class="btn btn-secondary" data-filter="dismissed" onclick="setFilter('dismissed', this)">不成立</button>
      </div>

      <div id="reportList">
        ${cardsHtml || '<div class="card text-center text-muted" style="padding:3rem;">目前沒有任何通報</div>'}
      </div>
    </div>
  `;

  const scripts = `
    <script>
      function setFilter(status, btn) {
        document.querySelectorAll('.filter-row .btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.report-card').forEach(card => {
          card.style.display = (status === 'all' || card.dataset.status === status) ? '' : 'none';
        });
      }

      async function postAction(payload) {
        const response = await fetch('/admin/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'HTTP ' + response.status);
        return data;
      }

      async function resolveReport(key, disposition) {
        const message = disposition === 'disabled'
          ? '確定「通報成立」並停用該連結？（連結資料保留，可隨時恢復）'
          : '確定將此通報標記為「不成立」？';
        if (!confirm(message)) return;
        try {
          await postAction({ action: 'resolve', key, disposition });
          location.reload();
        } catch (err) {
          alert('操作失敗: ' + err.message);
        }
      }

      async function reopenReport(key) {
        try {
          await postAction({ action: 'reopen', key });
          location.reload();
        } catch (err) {
          alert('操作失敗: ' + err.message);
        }
      }

      async function toggleLink(id, disabled) {
        if (!confirm((disabled ? '停用' : '恢復') + '短網址 ' + id + '？')) return;
        try {
          await postAction({ action: 'toggle-link', id, disabled });
          location.reload();
        } catch (err) {
          alert('操作失敗: ' + err.message);
        }
      }
    </script>
  `;

  return baseTemplate({ title: '通報管理', content, styles, scripts });
}
