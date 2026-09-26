/**
 * 公開檢舉頁面
 * 路由：GET /report?id=<短碼>
 */

import { createHtmlResponse, escapeHtml } from './lib/utils.js';
import { baseTemplate } from './lib/templates.js';
import { REPORT_CATEGORIES } from './lib/reports.js';

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const prefillId = (url.searchParams.get('id') || '').slice(0, 32);

  const styles = `
    .report-wrap {
      max-width: 640px;
      margin: 0 auto;
    }
    .report-wrap .hint {
      font-size: 0.9rem;
      color: var(--text-muted);
    }
    .category-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .category-options label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border: 2px solid var(--border);
      border-radius: 8px;
      padding: 0.6rem 0.75rem;
      cursor: pointer;
      margin-bottom: 0;
      font-weight: 400;
    }
    .category-options label:has(input:checked) {
      border-color: var(--primary);
      color: var(--primary);
      background: var(--bg-light);
    }
    .category-options input {
      width: auto;
      margin: 0;
    }
    #charCount { float: right; }
  `;

  const categoryHtml = Object.entries(REPORT_CATEGORIES).map(([key, label]) => `
    <label><input type="radio" name="category" value="${key}"> ${escapeHtml(label)}</label>
  `).join('');

  const content = `
    <div class="container report-wrap">
      <div class="card">
        <h1>通報不當連結</h1>
        <p>若您發現本平台的短網址指向釣魚、詐騙、惡意軟體或其他不當內容，請透過此表單通報。管理團隊審核後會下架違規連結，通報統計會公開於<a href="/transparency">平台透明度頁</a>。</p>

        <div id="resultBox" class="alert" style="display:none;"></div>

        <form id="reportForm">
          <label for="linkId">短碼（ntnu.cc/ 後面的代碼）</label>
          <input type="text" id="linkId" name="id" maxlength="32" pattern="[a-zA-Z0-9-]{1,32}" required
                 placeholder="例如：abc123" value="${escapeHtml(prefillId)}">

          <label>通報原因</label>
          <div class="category-options">${categoryHtml}</div>

          <label for="detail">補充說明（選填）<span class="hint" id="charCount">0 / 500</span></label>
          <textarea id="detail" name="detail" rows="4" maxlength="500"
                    placeholder="請描述您觀察到的問題，例如假冒的網站名稱、詐騙手法等"></textarea>

          <p class="hint">為保護隱私，本平台不會記錄您的 IP 位址，僅保留來源國別供統計使用。</p>

          <button type="submit" class="btn" id="submitBtn">送出通報</button>
          <a href="/" class="btn btn-secondary">返回首頁</a>
        </form>
      </div>
    </div>
  `;

  const scripts = `
    <script>
      const form = document.getElementById('reportForm');
      const resultBox = document.getElementById('resultBox');
      const submitBtn = document.getElementById('submitBtn');
      const detail = document.getElementById('detail');

      detail.addEventListener('input', () => {
        document.getElementById('charCount').textContent = detail.value.length + ' / 500';
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const category = form.querySelector('input[name="category"]:checked');
        if (!category) {
          showResult('error', '請選擇通報原因');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '送出中...';

        try {
          const response = await fetch('/api/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: document.getElementById('linkId').value.trim(),
              category: category.value,
              detail: detail.value.trim(),
            }),
          });
          const data = await response.json();

          if (response.ok && data.success) {
            showResult('success', data.message);
            form.style.display = 'none';
          } else {
            showResult('error', data.error || '通報失敗，請稍後再試');
          }
        } catch (err) {
          showResult('error', '網路錯誤，請稍後再試');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = '送出通報';
        }
      });

      function showResult(type, message) {
        resultBox.className = 'alert alert-' + type;
        resultBox.style.display = 'block';
        resultBox.textContent = message;
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    </script>
  `;

  return createHtmlResponse(baseTemplate({
    title: '通報不當連結',
    content,
    styles,
    scripts,
    meta: {
      og: {
        url: 'https://ntnu.cc/report',
        title: '通報不當連結 - ntnu.cc',
        description: '協助我們維護短網址平台安全，通報釣魚、詐騙或不當內容。',
      },
    },
  }));
}
