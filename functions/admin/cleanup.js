/**
 * 批量清理工具
 * 路由：GET /admin/cleanup
 *
 * 用途：一次預覽 KV 中所有短網址，可依建立時間、建立者 IP、點擊數篩選，
 *      勾選後批量刪除。專為清除攻擊產生的大量無用短網址而設計。
 *
 * - GET /admin/cleanup            → 回傳清理介面（HTML）
 * - GET /admin/cleanup?action=data&cursor=xxx
 *                                 → 回傳一頁 link 資料（JSON），供前端逐頁載入全部
 *
 * 實際刪除沿用 DELETE /admin（帶 silent: true 的批量靜默模式）。
 */

import { createHtmlResponse, createResponse, createErrorResponse } from '../lib/utils.js';
import { validateApiKey } from '../lib/validation.js';
import { baseTemplate } from '../lib/templates.js';

// 每次 list 載入的數量，避免單一請求超出 Workers 子請求上限
const DATA_PAGE_SIZE = 100;

export async function onRequestGet(context) {
  const { request, env } = context;

  // 驗證權限（API Key 或網頁 Session）
  const auth = await requireAuth(context);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  if (url.searchParams.get('action') === 'data') {
    return getLinksData(context);
  }

  return createHtmlResponse(generateCleanupHtml());
}

/**
 * 驗證管理員權限（沿用 admin 既有模式）
 * @param {Object} context
 * @returns {Promise<{ ok: boolean, response?: Response }>}
 */
async function requireAuth(context) {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const apiKeyValidation = validateApiKey(request, env.ADMIN_API_KEY);
    if (!apiKeyValidation.valid) {
      return { ok: false, response: createErrorResponse('Unauthorized', apiKeyValidation.error, 401) };
    }
    return { ok: true };
  }

  const cookie = request.headers.get('Cookie') || '';
  const sessionMatch = cookie.match(/admin_session=([^;]+)/);
  if (!sessionMatch) {
    return { ok: false, response: Response.redirect(new URL('/admin', request.url).href, 302) };
  }

  const sessionKey = sessionMatch[1];
  const sessionData = await env.LINKS_KV.get(`session:${sessionKey}`, { type: 'json' });
  if (!sessionData || Date.now() >= sessionData.expiresAt) {
    return { ok: false, response: Response.redirect(new URL('/admin', request.url).href, 302) };
  }

  return { ok: true };
}

/**
 * 回傳一頁短網址資料
 */
async function getLinksData(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') || undefined;

  const listResult = await env.LINKS_KV.list({
    prefix: 'link:',
    limit: DATA_PAGE_SIZE,
    cursor,
  });

  // 並行讀取每個 link 的值（目標 URL）與 metadata
  const links = await Promise.all(
    listResult.keys.map(async (key) => {
      const id = key.name.replace('link:', '');
      let targetUrl = '';
      let metadata = key.metadata || {};

      try {
        const result = await env.LINKS_KV.getWithMetadata(key.name);
        targetUrl = result.value || '';
        metadata = result.metadata || metadata || {};
      } catch {
        // 讀取失敗時仍回傳基本資訊
      }

      // metadata 來源可能是：
      //  - public-create：{ url, createdAt, createdBy, expiresAt }
      //  - api/create / updateStats：{ stats: { clicks, lastAccess, createdAt }, ... }
      const stats = metadata.stats || {};
      return {
        id,
        url: targetUrl,
        createdAt: metadata.createdAt || stats.createdAt || null,
        createdBy: metadata.createdBy || null,
        clicks: typeof stats.clicks === 'number' ? stats.clicks : 0,
        expiresAt: metadata.expiresAt || null,
      };
    })
  );

  return createResponse({
    links,
    cursor: listResult.list_complete ? null : listResult.cursor,
    listComplete: listResult.list_complete,
  });
}

/**
 * 生成清理工具 HTML
 */
function generateCleanupHtml() {
  const styles = `
    .cleanup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .summary-bar {
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
      padding: 1rem;
      background: var(--bg-light);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .summary-bar .item { font-size: 0.95rem; }
    .summary-bar .item strong { color: var(--primary); font-size: 1.1rem; }
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem 1rem;
      margin-bottom: 1rem;
    }
    .filters .field { display: flex; flex-direction: column; }
    .filters label { font-size: 0.8rem; margin-bottom: 0.25rem; }
    .filters input { margin-bottom: 0; padding: 0.5rem; font-size: 0.9rem; }
    .filters .checkbox-field {
      flex-direction: row; align-items: center; gap: 0.5rem;
      align-self: end; padding-bottom: 0.5rem;
    }
    .filters .checkbox-field input { width: auto; }
    .toolbar {
      display: flex; gap: 0.5rem; flex-wrap: wrap;
      align-items: center; margin-bottom: 1rem;
    }
    .toolbar .spacer { flex: 1; }
    .links-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .links-table th, .links-table td {
      padding: 0.5rem 0.6rem; text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .links-table th {
      background: var(--bg-light); color: var(--text-secondary);
      font-size: 0.75rem; text-transform: uppercase;
      position: sticky; top: 0;
    }
    .links-table tr:hover { background: var(--bg-light); }
    .links-table .url-col { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .links-table .mono { font-family: monospace; }
    .table-wrap { max-height: 60vh; overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
    .badge { background: var(--bg-light); padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.8rem; }
    .progress-text { color: var(--text-muted); font-size: 0.9rem; }
    .render-note { color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem; }
    .btn-sm { padding: 0.4rem 0.8rem; font-size: 0.85rem; }
  `;

  const content = `
    <div class="container">
      <div class="cleanup-header">
        <div>
          <h1>🧹 批量清理</h1>
          <p class="text-muted">預覽全部短網址，篩選後勾選刪除</p>
        </div>
        <div>
          <a href="/admin" class="btn btn-secondary">← 返回管理後台</a>
        </div>
      </div>

      <div class="card">
        <div class="summary-bar">
          <div class="item">已載入 <strong id="loadedCount">0</strong> 筆</div>
          <div class="item">符合篩選 <strong id="filteredCount">0</strong> 筆</div>
          <div class="item">已選取 <strong id="selectedCount">0</strong> 筆</div>
          <div class="item progress-text" id="loadStatus">載入中…</div>
        </div>

        <div class="filters">
          <div class="field">
            <label>建立時間（起）</label>
            <input type="datetime-local" id="fFrom">
          </div>
          <div class="field">
            <label>建立時間（迄）</label>
            <input type="datetime-local" id="fTo">
          </div>
          <div class="field">
            <label>建立者 IP 包含</label>
            <input type="text" id="fIp" placeholder="例如 140.122.">
          </div>
          <div class="field">
            <label>目標網址 / 短碼 包含</label>
            <input type="text" id="fText" placeholder="關鍵字">
          </div>
          <div class="field checkbox-field">
            <input type="checkbox" id="fZeroClicks">
            <label for="fZeroClicks" style="margin:0;">只顯示 0 點擊</label>
          </div>
        </div>

        <div class="toolbar">
          <button class="btn btn-secondary btn-sm" onclick="applyFilters()">套用篩選</button>
          <button class="btn btn-secondary btn-sm" onclick="resetFilters()">清除篩選</button>
          <button class="btn btn-secondary btn-sm" onclick="selectAllFiltered()">全選符合篩選</button>
          <button class="btn btn-secondary btn-sm" onclick="clearSelection()">取消選取</button>
          <div class="spacer"></div>
          <button class="btn btn-danger" id="deleteBtn" onclick="deleteSelected()" disabled>🗑️ 刪除選取</button>
        </div>

        <div class="table-wrap">
          <table class="links-table">
            <thead>
              <tr>
                <th style="width:36px;"><input type="checkbox" id="selectAllVisible" onchange="toggleVisible(this)"></th>
                <th>短碼</th>
                <th>目標網址</th>
                <th style="width:130px;">建立者 IP</th>
                <th style="width:160px;">建立時間</th>
                <th style="width:60px;">點擊</th>
              </tr>
            </thead>
            <tbody id="tbody">
              <tr><td colspan="6" class="text-center text-muted" style="padding:2rem;">載入中…</td></tr>
            </tbody>
          </table>
        </div>
        <p class="render-note" id="renderNote"></p>
      </div>
    </div>
  `;

  const scripts = `
    <script>
      // 顯示上限：避免一次渲染數萬列造成瀏覽器卡頓。
      // 選取與刪除都以「全部符合篩選的資料」為準，不受此上限影響。
      const RENDER_LIMIT = 1000;
      const DELETE_BATCH = 100;

      let allLinks = [];          // 全部載入的資料
      let filtered = [];          // 目前符合篩選的資料
      const selected = new Set(); // 已選取的 id

      function esc(s) {
        return String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }
      function fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d)) return esc(iso);
        return d.toLocaleString('zh-TW', { hour12: false });
      }

      // ---- 載入全部資料（逐頁） ----
      async function loadAll() {
        let cursor = '';
        let done = false;
        const statusEl = document.getElementById('loadStatus');
        while (!done) {
          const qs = cursor ? '?action=data&cursor=' + encodeURIComponent(cursor) : '?action=data';
          let resp;
          try {
            resp = await fetch('/admin/cleanup' + qs, { headers: { 'Accept': 'application/json' } });
          } catch (e) {
            statusEl.textContent = '載入失敗：' + e.message;
            return;
          }
          if (!resp.ok) {
            statusEl.textContent = '載入失敗（HTTP ' + resp.status + '），請重新整理或重新登入';
            return;
          }
          const data = await resp.json();
          allLinks = allLinks.concat(data.links || []);
          document.getElementById('loadedCount').textContent = allLinks.length;
          statusEl.textContent = '載入中… 已取得 ' + allLinks.length + ' 筆';
          if (data.listComplete || !data.cursor) { done = true; }
          else { cursor = data.cursor; }
        }
        statusEl.textContent = '✅ 已載入全部 ' + allLinks.length + ' 筆';
        applyFilters();
      }

      // ---- 篩選 ----
      function applyFilters() {
        const fromV = document.getElementById('fFrom').value;
        const toV = document.getElementById('fTo').value;
        const ipV = document.getElementById('fIp').value.trim().toLowerCase();
        const textV = document.getElementById('fText').value.trim().toLowerCase();
        const zeroOnly = document.getElementById('fZeroClicks').checked;

        const fromTs = fromV ? new Date(fromV).getTime() : null;
        const toTs = toV ? new Date(toV).getTime() : null;

        filtered = allLinks.filter(function (l) {
          if (zeroOnly && l.clicks > 0) return false;
          if (ipV && !(l.createdBy || '').toLowerCase().includes(ipV)) return false;
          if (textV) {
            const hay = (l.id + ' ' + (l.url || '')).toLowerCase();
            if (!hay.includes(textV)) return false;
          }
          if (fromTs != null || toTs != null) {
            const t = l.createdAt ? new Date(l.createdAt).getTime() : null;
            if (t == null || isNaN(t)) return false;
            if (fromTs != null && t < fromTs) return false;
            if (toTs != null && t > toTs) return false;
          }
          return true;
        });

        // 依建立時間新→舊排序
        filtered.sort(function (a, b) {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });

        render();
      }

      function resetFilters() {
        document.getElementById('fFrom').value = '';
        document.getElementById('fTo').value = '';
        document.getElementById('fIp').value = '';
        document.getElementById('fText').value = '';
        document.getElementById('fZeroClicks').checked = false;
        applyFilters();
      }

      // ---- 渲染 ----
      function render() {
        const tbody = document.getElementById('tbody');
        document.getElementById('filteredCount').textContent = filtered.length;

        if (filtered.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:2rem;">沒有符合條件的短網址</td></tr>';
          document.getElementById('renderNote').textContent = '';
          updateSelectedCount();
          return;
        }

        const slice = filtered.slice(0, RENDER_LIMIT);
        const rows = slice.map(function (l) {
          const checked = selected.has(l.id) ? 'checked' : '';
          return '<tr>' +
            '<td><input type="checkbox" class="row-cb" data-id="' + esc(l.id) + '" ' + checked + '></td>' +
            '<td class="mono"><a href="/' + esc(l.id) + '" target="_blank">' + esc(l.id) + '</a></td>' +
            '<td class="url-col" title="' + esc(l.url) + '">' + esc(l.url || '—') + '</td>' +
            '<td class="mono">' + esc(l.createdBy || '—') + '</td>' +
            '<td>' + fmtDate(l.createdAt) + '</td>' +
            '<td><span class="badge">' + l.clicks + '</span></td>' +
            '</tr>';
        }).join('');
        tbody.innerHTML = rows;

        document.querySelectorAll('.row-cb').forEach(function (cb) {
          cb.addEventListener('change', function () {
            if (cb.checked) selected.add(cb.dataset.id);
            else selected.delete(cb.dataset.id);
            updateSelectedCount();
          });
        });

        document.getElementById('renderNote').textContent =
          filtered.length > RENDER_LIMIT
            ? '⚠️ 為效能僅顯示前 ' + RENDER_LIMIT + ' 列，但「全選符合篩選」與刪除會套用到全部 ' + filtered.length + ' 筆。'
            : '';

        document.getElementById('selectAllVisible').checked = false;
        updateSelectedCount();
      }

      function updateSelectedCount() {
        document.getElementById('selectedCount').textContent = selected.size;
        document.getElementById('deleteBtn').disabled = selected.size === 0;
      }

      // ---- 選取 ----
      function toggleVisible(master) {
        document.querySelectorAll('.row-cb').forEach(function (cb) {
          cb.checked = master.checked;
          if (master.checked) selected.add(cb.dataset.id);
          else selected.delete(cb.dataset.id);
        });
        updateSelectedCount();
      }

      function selectAllFiltered() {
        filtered.forEach(function (l) { selected.add(l.id); });
        document.querySelectorAll('.row-cb').forEach(function (cb) { cb.checked = true; });
        updateSelectedCount();
      }

      function clearSelection() {
        selected.clear();
        document.querySelectorAll('.row-cb').forEach(function (cb) { cb.checked = false; });
        document.getElementById('selectAllVisible').checked = false;
        updateSelectedCount();
      }

      // ---- 刪除 ----
      async function deleteSelected() {
        const ids = Array.from(selected);
        if (ids.length === 0) return;
        if (!confirm('確定要刪除 ' + ids.length + ' 個短網址嗎？\\n此操作無法復原。')) return;

        const btn = document.getElementById('deleteBtn');
        btn.disabled = true;
        const statusEl = document.getElementById('loadStatus');

        let deleted = 0;
        const failedIds = [];
        for (let i = 0; i < ids.length; i += DELETE_BATCH) {
          const batch = ids.slice(i, i + DELETE_BATCH);
          statusEl.textContent = '刪除中… ' + deleted + ' / ' + ids.length;
          try {
            const resp = await fetch('/admin', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: batch, silent: true }),
            });
            if (!resp.ok) { failedIds.push.apply(failedIds, batch); continue; }
            const data = await resp.json();
            (data.results || []).forEach(function (r) {
              if (r.success) { deleted++; selected.delete(r.id); }
              else failedIds.push(r.id);
            });
          } catch (e) {
            failedIds.push.apply(failedIds, batch);
          }
        }

        // 從本地資料移除已刪除項目
        const deletedSet = new Set(ids.filter(function (id) { return !failedIds.includes(id) && !selected.has(id); }));
        allLinks = allLinks.filter(function (l) { return !deletedSet.has(l.id); });
        document.getElementById('loadedCount').textContent = allLinks.length;

        statusEl.textContent = '✅ 已刪除 ' + deleted + ' 筆' + (failedIds.length ? '，失敗 ' + failedIds.length + ' 筆' : '');
        if (failedIds.length) alert('有 ' + failedIds.length + ' 筆刪除失敗，請稍後重試。');
        applyFilters();
      }

      // 啟動
      loadAll();
    </script>
  `;

  return baseTemplate({ title: '批量清理', content, styles, scripts });
}
