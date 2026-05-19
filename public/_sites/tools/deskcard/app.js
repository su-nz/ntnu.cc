/* A4 桌牌產生器 — 純前端
   依 SPEC2 §5:雙面反轉、auto-fit、批次匯入、html2canvas + jsPDF 直出。
   不收集、不上傳任何資料。 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const T = window.NTNUUI && window.NTNUUI.toast ? window.NTNUUI.toast : (m) => alert(m);

  // --- 狀態 -----------------------------------------------------
  /** @type {{name:string,title:string,org:string}[]} */
  const records = [];
  let currentIdx = -1;          // 預覽中第幾筆
  let editingIdx = -1;          // 「更新此筆」鎖定
  let sheetHeaders = [];        // 匯入 CSV/XLSX 的欄位
  let sheetRows = [];

  // --- DOM ------------------------------------------------------
  const inName  = $('#inName');
  const inTitle = $('#inTitle');
  const inOrg   = $('#inOrg');
  const btnAdd    = $('#btnAdd');
  const btnUpdate = $('#btnUpdate');
  const btnPdf    = $('#btnPdf');
  const btnClear  = $('#btnClear');
  const btnPick   = $('#btnPick');
  const fileInput = $('#fileInput');
  const dropzone  = $('#dropzone');
  const pageList  = $('#pageList');
  const listCount = $('#listCount');
  const curIdx    = $('#curIdx');
  const totalIdx  = $('#totalIdx');
  const canvas    = $('#canvas');

  // --- 本機保存(SPEC2 §5.3,純前端不落地,只存在瀏覽器) -----------
  const STORAGE_KEY = 'ntnu.deskcard.records.v1';
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch (_) {}
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach(r => {
          if (r && typeof r.name === 'string') {
            records.push({ name: r.name, title: r.title || '', org: r.org || '' });
          }
        });
      }
    } catch (_) { /* 損毀就忽略 */ }
  }

  // --- 即時欄位檢查(SPEC2 §5.2) ---------------------------------
  const LIMITS = { name: 12, title: 16, org: 20 };
  function validateField(input, errEl, fieldEl, label, limit) {
    const v = input.value || '';
    if (v.length > limit) {
      errEl.textContent = `${label}過長 (${v.length}/${limit}),會自動縮小字級但建議精簡`;
      fieldEl.classList.add('has-error');
    } else {
      errEl.textContent = '';
      fieldEl.classList.remove('has-error');
    }
  }
  function runValidation() {
    validateField(inName,  $('#errName'),  $('#fieldName'),  '姓名', LIMITS.name);
    validateField(inTitle, $('#errTitle'), $('#fieldTitle'), '職稱', LIMITS.title);
    validateField(inOrg,   $('#errOrg'),   $('#fieldOrg'),   '單位', LIMITS.org);
  }

  // --- 預覽渲染 -------------------------------------------------
  function renderPreview() {
    const rec = currentIdx >= 0 ? records[currentIdx] : {
      name: inName.value || '王小明',
      title: inTitle.value || '助理教授',
      org: inOrg.value || '資訊工程學系',
    };
    applyToCanvas(canvas, rec);
    curIdx.textContent = records.length ? (currentIdx + 1) : '-';
    totalIdx.textContent = records.length;
  }

  /** 把一筆 rec 套到指定 .a4 容器(預覽或離線渲染共用) */
  function applyToCanvas(el, rec) {
    // 以容器當前寬度為基準計算字級,讓預覽與 PDF 輸出公式一致
    const w = el.clientWidth || el.getBoundingClientRect().width || 450;
    const base = w / 450; // 450px 為設計基準寬 (A4 直式預覽寬)

    el.querySelectorAll('[data-role="name"]').forEach(node => {
      node.textContent = rec.name || '';
      node.style.fontSize = fitPx(rec.name, 56, 22, base) + 'px';
    });
    el.querySelectorAll('[data-role="title"]').forEach(node => {
      node.textContent = rec.title || '';
      node.style.fontSize = fitPx(rec.title, 26, 14, base) + 'px';
    });
    el.querySelectorAll('[data-role="org"]').forEach(node => {
      node.textContent = rec.org || '';
      node.style.fontSize = fitPx(rec.org, 22, 12, base) + 'px';
    });
  }

  // 統一 auto-fit:字數超過 threshold 後線性遞減,輸出 px (乘上比例)
  function fitPx(text, maxPx, minPx, scale = 1) {
    const len = (text || '').length;
    const threshold = 5;
    let size = maxPx;
    if (len > threshold) {
      size = Math.max(minPx, maxPx - (len - threshold) * 2.5);
    }
    return Math.round(size * scale);
  }

  // --- 名單渲染 -------------------------------------------------
  function renderList() {
    listCount.textContent = records.length;
    if (!records.length) {
      pageList.innerHTML = '<div class="empty">尚未加入任何資料</div>';
      return;
    }
    pageList.innerHTML = '';
    records.forEach((r, i) => {
      const el = document.createElement('div');
      el.className = 'page-thumb' + (i === currentIdx ? ' active' : '');
      el.innerHTML = `
        <div class="pname">${escapeHtml(r.name || '(未命名)')}</div>
        <div class="pmeta">${escapeHtml(r.title || '')}${r.org ? ' · ' + escapeHtml(r.org) : ''}</div>
      `;
      el.addEventListener('click', () => {
        currentIdx = i;
        editingIdx = i;
        inName.value = r.name || '';
        inTitle.value = r.title || '';
        inOrg.value = r.org || '';
        btnUpdate.disabled = false;
        renderList();
        renderPreview();
      });
      pageList.appendChild(el);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // --- 編輯動作 -------------------------------------------------
  function readForm() {
    return {
      name: inName.value.trim(),
      title: inTitle.value.trim(),
      org: inOrg.value.trim(),
    };
  }

  btnAdd.addEventListener('click', () => {
    const rec = readForm();
    if (!rec.name) { T('請至少填寫姓名', 'warning'); return; }
    records.push(rec);
    currentIdx = records.length - 1;
    editingIdx = -1;
    btnUpdate.disabled = true;
    inName.value = inTitle.value = inOrg.value = '';
    runValidation();
    inName.focus();
    persist();
    renderList(); renderPreview();
  });

  btnUpdate.addEventListener('click', () => {
    if (editingIdx < 0) return;
    const rec = readForm();
    if (!rec.name) { T('姓名不可為空', 'warning'); return; }
    records[editingIdx] = rec;
    currentIdx = editingIdx;
    persist();
    renderList(); renderPreview();
    T('已更新', 'success');
  });

  btnClear.addEventListener('click', () => {
    if (!records.length) return;
    if (!confirm('確定清空整份名單?(將同時移除瀏覽器自動保存的資料)')) return;
    records.length = 0;
    currentIdx = -1; editingIdx = -1;
    btnUpdate.disabled = true;
    persist();
    renderList(); renderPreview();
  });

  // 表單即時預覽 + 即時驗證
  [inName, inTitle, inOrg].forEach(el => {
    el.addEventListener('input', () => {
      runValidation();
      if (editingIdx < 0) {
        currentIdx = -1;
        renderPreview();
      }
      // 編輯既有筆時不即時改預覽,維持那筆原貌直到按「更新此筆」
    });
  });

  // --- 檔案匯入 -------------------------------------------------
  btnPick.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadFile(f);
    fileInput.value = '';
  });

  if (window.NTNUUI && window.NTNUUI.dropzone) {
    window.NTNUUI.dropzone(dropzone, (files) => loadFile(files[0]), {
      accept: ['.csv', '.xlsx', '.xls']
    });
  }

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (!rows.length) { T('檔案為空', 'error'); return; }
        sheetHeaders = (rows[0] || []).map((h, i) => String(h || `欄位${i+1}`));
        sheetRows = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
        showMapping();
      } catch (err) {
        console.error(err);
        T('無法解析檔案,請確認格式', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function showMapping() {
    const optionsHtml = sheetHeaders.map((h, i) => `<option value="${i}">${escapeHtml(h)}</option>`).join('');
    const noneHtml = '<option value="-1">— 不對應 —</option>';
    $('#mapName').innerHTML = optionsHtml + noneHtml;
    $('#mapTitle').innerHTML = noneHtml + optionsHtml;
    $('#mapOrg').innerHTML = noneHtml + optionsHtml;
    // 猜測對應欄位
    guessColumn('#mapName', ['姓名','name','Name']);
    guessColumn('#mapTitle', ['職稱','title','Title']);
    guessColumn('#mapOrg', ['單位','部門','系所','org','department']);
    $('#rowCount').textContent = sheetRows.length;
    $('#mapping').style.display = 'block';
    $('#importHint').textContent = `已偵測 ${sheetHeaders.length} 欄 / ${sheetRows.length} 筆,可調整對應後匯入。`;
  }

  function guessColumn(selSelector, keywords) {
    const sel = $(selSelector);
    for (let i = 0; i < sheetHeaders.length; i++) {
      const h = sheetHeaders[i];
      if (keywords.some(k => h.includes(k))) { sel.value = String(i); return; }
    }
  }

  $('#btnImport').addEventListener('click', () => {
    const ni = parseInt($('#mapName').value, 10);
    const ti = parseInt($('#mapTitle').value, 10);
    const oi = parseInt($('#mapOrg').value, 10);
    if (ni < 0) { T('必須指定姓名欄位', 'warning'); return; }
    let added = 0;
    for (const row of sheetRows) {
      const name = String(row[ni] || '').trim();
      if (!name) continue;
      records.push({
        name,
        title: ti >= 0 ? String(row[ti] || '').trim() : '',
        org:   oi >= 0 ? String(row[oi] || '').trim() : '',
      });
      added++;
    }
    T(`已匯入 ${added} 筆`, 'success');
    sheetHeaders = []; sheetRows = [];
    $('#mapping').style.display = 'none';
    currentIdx = records.length ? records.length - 1 : -1;
    persist();
    renderList(); renderPreview();
  });

  // --- PDF 輸出(html2canvas + jsPDF) ---------------------------
  // 採離線複製預覽 DOM 渲染,中文走瀏覽器系統字體,雙面反轉直接沿用 CSS rotate
  const RENDER_W_PX = 1190;        // A4 直式 210mm 寬 ≈ 144 DPI = 1190px,平衡清晰與檔案大小

  /** 建立離線複本 .a4,複用同一份 CSS 規則 */
  function buildOffscreenCard() {
    const ratio = 210 / 297;
    const node = canvas.cloneNode(true);
    node.style.width = RENDER_W_PX + 'px';
    node.style.height = Math.round(RENDER_W_PX / ratio) + 'px';
    node.style.position = 'fixed';
    node.style.left = '-99999px';
    node.style.top = '0';
    node.style.boxShadow = 'none';
    node.style.borderRadius = '0';
    document.body.appendChild(node);
    return node;
  }

  btnPdf.addEventListener('click', async () => {
    if (!records.length) { T('清單是空的', 'warning'); return; }
    if (typeof html2canvas === 'undefined' || !window.jspdf) {
      T('PDF 函式庫尚未載入', 'error');
      return;
    }

    const originalText = btnPdf.textContent;
    btnPdf.disabled = true;
    btnPdf.textContent = `產生中 0 / ${records.length}`;

    const offscreen = buildOffscreenCard();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    try {
      for (let i = 0; i < records.length; i++) {
        applyToCanvas(offscreen, records[i]);
        // 等一輪 paint,確保 fontSize 與 layout 套用後再 capture
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const c = await html2canvas(offscreen, {
          scale: 1,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
        });
        const img = c.toDataURL('image/jpeg', 0.92);
        if (i > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');

        btnPdf.textContent = `產生中 ${i + 1} / ${records.length}`;
      }

      pdf.save(`deskcard-${Date.now()}.pdf`);
      T('PDF 已產生', 'success');
    } catch (err) {
      console.error(err);
      T('PDF 產生失敗:' + err.message, 'error');
    } finally {
      offscreen.remove();
      btnPdf.disabled = false;
      btnPdf.textContent = originalText;
    }
  });

  // --- 初始 -----------------------------------------------------
  restore();
  if (records.length) {
    currentIdx = 0;
    T(`已自動載入上次的 ${records.length} 筆名單(僅存於此瀏覽器)`, 'success');
  }
  runValidation();
  renderList();
  renderPreview();
  window.addEventListener('resize', renderPreview);
})();
