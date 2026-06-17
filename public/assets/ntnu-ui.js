/* ntnu-ui.js — 共用 UI helper（toast / modal / 檔案拖放）
   零依賴，掛在 window.NTNUUI 下。 */
(function (global) {
  'use strict';

  function ensureToastHost() {
    let host = document.querySelector('.ntnu-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'ntnu-toast-host';
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, type, duration) {
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = 'ntnu-toast' + (type ? ' ' + type : '');
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, duration || 2400);
  }

  function modal(opts) {
    const overlay = document.createElement('div');
    overlay.className = 'ntnu-modal-overlay';
    overlay.innerHTML = `
      <div class="ntnu-modal-card" role="dialog" aria-modal="true">
        <div class="ntnu-modal-header">
          <h3></h3>
          <button class="ntnu-modal-close" aria-label="關閉">&times;</button>
        </div>
        <div class="ntnu-modal-body"></div>
      </div>`;
    overlay.querySelector('h3').textContent = opts.title || '';
    const body = overlay.querySelector('.ntnu-modal-body');
    if (typeof opts.content === 'string') body.innerHTML = opts.content;
    else if (opts.content instanceof Node) body.appendChild(opts.content);

    function close() {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
    }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.ntnu-modal-close').addEventListener('click', close);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    return { close, element: overlay };
  }

  /**
   * 將元素變成可拖放接收的 dropzone。
   * @param {HTMLElement} el
   * @param {(files: File[]) => void} onFiles
   * @param {{accept?: string[]}} [opts]
   */
  function dropzone(el, onFiles, opts) {
    const accept = opts && opts.accept;
    el.classList.add('ntnu-dropzone');
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter','dragover'].forEach(ev => el.addEventListener(ev, (e) => { stop(e); el.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(ev => el.addEventListener(ev, (e) => { stop(e); el.classList.remove('dragover'); }));
    el.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files || []);
      const filtered = accept ? files.filter(f => accept.some(ext => f.name.toLowerCase().endsWith(ext))) : files;
      if (filtered.length) onFiles(filtered);
      else if (files.length) toast('檔案格式不支援', 'error');
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
    return Promise.resolve();
  }

  global.NTNUUI = { toast, modal, dropzone, copyText };
})(window);
