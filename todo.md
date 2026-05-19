# SPEC2 實作 TODO

> Session 在 2026-05-19 暫停,桌牌 MVP 程式碼已寫完但**完全未驗證**。下次接手前先讀這份。

---

## ✅ 已完成(僅第 1 項使用者親自確認)

- [x] **DNS / Pages custom domain**(使用者自行處理)
- [x] **資產搬遷**:`public/ntnu dataset/` → [public/assets/ntnu-vi/](public/assets/ntnu-vi/)
  - 中文檔名英化:`(修正型)` → `_modified`、`(標準型)` → `_standard`
  - 原目錄已 `rmdir`
- [x] **共用主題 CSS**:[public/assets/ntnu-theme.css](public/assets/ntnu-theme.css)
  - 從 [functions/lib/templates.js](functions/lib/templates.js) baseTemplate 抽出 `:root` 變數與基礎元件
  - ⚠️ templates.js 那份 inline CSS 沒改,兩處目前是 sibling 複本,需手動同步
- [x] **共用 UI helper**:[public/assets/ntnu-ui.js](public/assets/ntnu-ui.js)
  - 掛在 `window.NTNUUI`:`toast` / `modal` / `dropzone` / `copyText`
- [x] **Host-based routing**:[functions/_middleware.js](functions/_middleware.js)
  - `SUBDOMAIN_SITES` 對應表,`tools.ntnu.cc/foo` → `next('/_sites/tools/foo')`
  - 靜態副檔名在 rewrite 之前早退,兩個子網域共用根目錄的 `/assets/*` 和 `/NTNU_Red.png`
- [x] **工具總覽 hub**:[public/_sites/tools/index.html](public/_sites/tools/index.html)
  - 內建 `TOOLS` 註冊表(deskcard=ready / cert+badge=soon)
- [x] **桌牌產生器 MVP 檔案**:
  - [public/_sites/tools/deskcard/index.html](public/_sites/tools/deskcard/index.html)
  - [public/_sites/tools/deskcard/app.js](public/_sites/tools/deskcard/app.js)
- [x] **SPEC2 §3 主域名首頁升級**:[public/index.html](public/index.html)
  - hero 與 features 之間新增 `#ecosystem` 區塊,三張卡片(視覺工具箱 ready / 文件中心 soon / 資源索引 soon)
  - navbar 第一個錨點 + footer 服務欄連到 `tools.ntnu.cc`
  - i18n 中英文補齊 `ecosystem.*` / `nav.ecosystem`
  - ⚠️ 純前端改動,**尚未在瀏覽器中視覺驗證**,行動裝置斷點要再看一眼

---

## 🟡 未驗證 / 已知風險(下次優先處理)

### 1. ~~桌牌 PDF 中文字體~~ → 改用 html2canvas + jsPDF
2026-05-19 重寫 [public/_sites/tools/deskcard/app.js](public/_sites/tools/deskcard/app.js):
- CDN 換掉 pdfmake,改為 `html2canvas@1.4.1` + `jspdf@2.5.1`(CSP 已涵蓋 cdnjs)
- 離線複製 `.a4` DOM(寬 1684px)→ html2canvas rasterize → jsPDF addImage(JPEG 0.92, FAST)
- 一次解決三件事:
  1. **中文字體** → 用瀏覽器系統字直接畫
  2. **雙面反轉** → 預覽的 `transform: rotate(180deg)` 直接被擷取
  3. **預覽/PDF auto-fit** → 同一個 `fitPx()` 公式,只差 scale
- ⚠️ **尚未瀏覽器實測**:html2canvas 對 `aspect-ratio` 的支援、200 筆批次的記憶體峰值、不同 OS 預設中文字差異
- ⚠️ **檔案大小**:每張 A4 jpeg 約 150-300KB,200 筆約 30-60MB,可能需要分批下載

### 2. `next(url)` rewrite 相容性
本機 wrangler 與線上 Cloudflare Pages 對 `next()` 吃 URL 字串的行為偶有不一致。
- 用 `wrangler pages dev` + `--ip 0.0.0.0` 起本機
- `curl --resolve tools.ntnu.cc:8788:127.0.0.1 http://tools.ntnu.cc:8788/deskcard` 驗證
- 若失敗,改用 `env.ASSETS.fetch(new Request(rewrittenUrl, request))`

### 3. 短網址回歸測試
確認 host=ntnu.cc 時下列路徑行為不變:
- `/abc`(短碼轉址)
- `/api/*`、`/admin/*`
- 既有靜態檔(`/NTNU_Red.png`、`/og-image.png` 等)

### 4. VI 資產對不上 SPEC
[public/assets/ntnu-vi/](public/assets/ntnu-vi/) 實際是教室或建築照片(`A101` / `A104` / `A701~A721` / `B101~B109`)
**不是** SPEC2 §2.2 / §4.2 所說的「校徽各版本 + colors.json + 字體圖檔」。
桌牌 MVP 目前 fallback 用 `/NTNU_Red.png` 當校徽。
- **要不要補真的 VI 素材?**
- **還是修 SPEC2 描述以符合現況?**
- 需要使用者拍板

### 5. 桌牌雙面反轉 — 仍需列印實測
雖然 html2canvas 已可正確擷取 `rotate(180deg)`,但**對折立桌時翻過來看的方向**仍需印一張驗證。

### 6. templates.js inline CSS sibling 同步
[functions/lib/templates.js](functions/lib/templates.js) baseTemplate 的 inline CSS 與 [public/assets/ntnu-theme.css](public/assets/ntnu-theme.css) 是 sibling 複本,改動其一要手動同步。

---

## 🔴 還沒動的 SPEC2 項目

(目前 SPEC2 列表已全部至少有一版產出,後續工作以「驗證 + 修缺陷」為主,見上方 🟡 區。)

---

## 部署前 checklist

1. [ ] `wrangler pages dev` 起本機,Host header 模擬測 `tools.ntnu.cc` rewrite
2. [ ] 短網址路徑回歸測試(`/abc`、`/api/*`、`/admin/*`)
3. [ ] 桌牌 PDF 跑一次中文姓名(html2canvas 版,**預期可正常顯示**)
4. [ ] 列印實測對折桌牌雙面方向
5. [ ] 主域名 `/` 三張 ecosystem 卡片在桌機 / 平板 / 手機的視覺平衡
6. [ ] CSP([public/_headers](public/_headers))確認:cdnjs 已涵蓋 html2canvas + jspdf,**不需改動**
