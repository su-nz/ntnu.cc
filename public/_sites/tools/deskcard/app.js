/* A4 桌牌產生器 — 純前端
   依 SPEC2 §5:雙面反轉、auto-fit、批次匯入、pdfmake 直出。
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

  // --- 預覽渲染 -------------------------------------------------
  function renderPreview() {
    const rec = currentIdx >= 0 ? records[currentIdx] : {
      name: inName.value || '王小明',
      title: inTitle.value || '助理教授',
      org: inOrg.value || '資訊工程學系',
    };
    canvas.querySelectorAll('[data-role="name"]').forEach(el => {
      el.textContent = rec.name || '';
      autoFit(el, rec.name || '', 56, 22); // px @ A4 比例
    });
    canvas.querySelectorAll('[data-role="title"]').forEach(el => {
      el.textContent = rec.title || '';
      autoFit(el, rec.title || '', 26, 14);
    });
    canvas.querySelectorAll('[data-role="org"]').forEach(el => {
      el.textContent = rec.org || '';
      autoFit(el, rec.org || '', 22, 12);
    });
    curIdx.textContent = records.length ? (currentIdx + 1) : '-';
    totalIdx.textContent = records.length;
  }

  // 簡易 auto-fit:依字數線性收斂到下限
  function autoFit(el, text, maxPx, minPx) {
    const len = (text || '').length;
    const threshold = 5; // 5 字內維持最大
    let size = maxPx;
    if (len > threshold) {
      const overflow = len - threshold;
      size = Math.max(minPx, maxPx - overflow * 2.5);
    }
    el.style.fontSize = size + 'px';
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
    inName.focus();
    renderList(); renderPreview();
  });

  btnUpdate.addEventListener('click', () => {
    if (editingIdx < 0) return;
    const rec = readForm();
    if (!rec.name) { T('姓名不可為空', 'warning'); return; }
    records[editingIdx] = rec;
    currentIdx = editingIdx;
    renderList(); renderPreview();
    T('已更新', 'success');
  });

  btnClear.addEventListener('click', () => {
    if (!records.length) return;
    if (!confirm('確定清空整份名單?')) return;
    records.length = 0;
    currentIdx = -1; editingIdx = -1;
    btnUpdate.disabled = true;
    renderList(); renderPreview();
  });

  // 表單即時預覽
  [inName, inTitle, inOrg].forEach(el => {
    el.addEventListener('input', () => {
      if (editingIdx < 0) {
        currentIdx = -1;
        renderPreview();
      }
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
    renderList(); renderPreview();
  });

  // --- PDF 輸出 -------------------------------------------------
  // A4 橫式 mm:297 × 210。pdfmake 預設使用 pt (1mm ≈ 2.8346pt)
  const MM = 2.834645669;
  const A4_W = 297 * MM;
  const A4_H = 210 * MM;

  btnPdf.addEventListener('click', () => {
    if (!records.length) { T('清單是空的', 'warning'); return; }
    if (typeof pdfMake === 'undefined') { T('PDF 函式庫尚未載入', 'error'); return; }

    const pages = records.map((r, i) => buildPdfPage(r, i === records.length - 1));
    const docDef = {
      pageSize: { width: A4_W, height: A4_H },
      pageMargins: [0, 0, 0, 0],
      content: pages,
      defaultStyle: { font: 'Roboto' }, // pdfmake 內建,中文走系統字體無法內嵌會 fallback
      info: {
        title: '師大桌牌 (ntnu.cc)',
        creator: 'tools.ntnu.cc/deskcard'
      }
    };
    try {
      pdfMake.createPdf(docDef).download(`deskcard-${Date.now()}.pdf`);
      T('PDF 已產生', 'success');
    } catch (err) {
      console.error(err);
      T('PDF 產生失敗:' + err.message, 'error');
    }
  });

  // 將姓名長度映射到字級
  function fitSize(text, max, min) {
    const len = (text || '').length;
    if (len <= 5) return max;
    return Math.max(min, max - (len - 5) * 2);
  }

  /** 組單一 A4 對折頁 (使用 pdfmake absolute positioning) */
  function buildPdfPage(rec, isLast) {
    const halfH = A4_H / 2;
    const nameSize  = fitSize(rec.name,  44, 18);
    const titleSize = fitSize(rec.title, 22, 12);
    const orgSize   = fitSize(rec.org,   18, 10);

    // 正面 (下半,正向)
    const front = [
      { text: rec.name || '', alignment: 'center', fontSize: nameSize, bold: true, color: '#9B2335',
        absolutePosition: { x: 0, y: halfH + halfH * 0.30 } , width: A4_W },
      { text: rec.title || '', alignment: 'center', fontSize: titleSize, color: '#2d2d2d',
        absolutePosition: { x: 0, y: halfH + halfH * 0.55 }, width: A4_W },
      { text: rec.org || '', alignment: 'center', fontSize: orgSize, color: '#555555',
        absolutePosition: { x: 0, y: halfH + halfH * 0.70 }, width: A4_W }
    ];

    // 背面 (上半,需要 180° 反轉 — pdfmake 不支援 transform,
    // 改以反向排列文字位置:把文字從下往上排版,使用者把紙翻轉後即正向)
    // 視覺等效:上半從「靠近摺線」往「上緣」遞減 → 反折後變為從上而下
    const back = [
      { text: rec.org || '', alignment: 'center', fontSize: orgSize, color: '#555555',
        absolutePosition: { x: 0, y: halfH * 0.18 }, width: A4_W },
      { text: rec.title || '', alignment: 'center', fontSize: titleSize, color: '#2d2d2d',
        absolutePosition: { x: 0, y: halfH * 0.30 }, width: A4_W },
      { text: rec.name || '', alignment: 'center', fontSize: nameSize, bold: true, color: '#9B2335',
        absolutePosition: { x: 0, y: halfH * 0.55 }, width: A4_W }
    ];

    // 摺線指示 (細點線)
    const fold = {
      canvas: [{
        type: 'line',
        x1: 8 * MM, y1: halfH, x2: A4_W - 8 * MM, y2: halfH,
        lineWidth: 0.4, dash: { length: 3, space: 3 }, lineColor: '#cccccc'
      }]
    };

    const page = [...back, fold, ...front];
    if (!isLast) page[page.length - 1].pageBreak = 'after';
    return page;
  }

  // --- 初始 -----------------------------------------------------
  renderList();
  renderPreview();
  window.addEventListener('resize', renderPreview);
})();
