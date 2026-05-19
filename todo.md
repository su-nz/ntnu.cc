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
- [x] **SPEC2 §3 主域名首頁升級**(2026-05-19 改設計):[public/index.html](public/index.html)
  - 一度做了 `#ecosystem` 三卡區塊,後續使用者決定簡化:**整段拿掉,改成 navbar 一個「工具箱」連結到 `tools.ntnu.cc`**
  - footer 服務欄仍保留工具箱連結
  - i18n 改用 `nav.tools` (中:工具箱 / 英:Toolbox)
  - 公告 banner 與 ecosystem section 都已從 HTML / CSS / i18n 移除
- [x] **SPEC2 §4.2 colors.json**:[public/assets/ntnu-vi/colors.json](public/assets/ntnu-vi/colors.json)
  - 五組色票:primary(師大紅系)/ accent(金/藍/灰)/ neutral / semantic / gradients
  - 工具子站可 `fetch('/assets/ntnu-vi/colors.json')` 取用,免重複寫死
- [x] **桌牌即時錯誤檢查(SPEC2 §5.2)**:[public/_sites/tools/deskcard/app.js](public/_sites/tools/deskcard/app.js)
  - 姓名/職稱/單位各自有建議字數上限(12 / 16 / 20),超過時 inline 紅字提示,但不阻擋(交給 auto-fit)
- [x] **桌牌名單本機自動保存(SPEC2 §5.3)**:`localStorage` key `ntnu.deskcard.records.v1`
  - 不引入 LocalForage(規格雖列,但目前資料量 + 結構簡單,原生 API 足矣)
  - 新增/更新/匯入/清空都會同步,重新進來自動載入並 toast 提示
- [x] **三個頁面 RWD 強化**:
  - [public/index.html](public/index.html) `#ecosystem` 區塊 < 768px 微調 padding / icon / 字級
  - [public/_sites/tools/index.html](public/_sites/tools/index.html) 補完整 < 768px 規則(原本沒任何 @media)
  - [public/_sites/tools/deskcard/index.html](public/_sites/tools/deskcard/index.html) 新增 1280 / 1100 / 768 三層斷點;< 1100 用 flex order 把預覽放最上面、名單放最下面;手機按鈕全寬

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

### 4. 桌牌雙面反轉 — 仍需列印實測
雖然 html2canvas 已可正確擷取 `rotate(180deg)`,但**對折立桌時翻過來看的方向**仍需印一張驗證。

### 5. templates.js inline CSS sibling 同步
[functions/lib/templates.js](functions/lib/templates.js) baseTemplate 的 inline CSS 與 [public/assets/ntnu-theme.css](public/assets/ntnu-theme.css) 是 sibling 複本,改動其一要手動同步。

---

## 🔴 SPEC2 中刻意保留未做的項目

這些屬於「另一個 MVP 級別」的工作,不在當前 scope:

- **§5.1 3/4 條狀 + 三折/四折版型 + 裁切線**:目前桌牌是 1/2 對折,SPEC 寫的是 3/4 條狀三折(立牌)。要做需要重新設計 .a4 結構 + 摺線標示,且需印實測。
- **§5.2 元件鎖定 + 拖拉**:目前文字位置完全固定(由 CSS center),沒有拖拉。要做需要引入 drag handle + 鎖定狀態機。
- **§8 階段一其他工具**:證書產生器 / 識別證排版仍標 `soon`。架構上已預留 `public/_sites/tools/cert/` 與 `/badge/` 路徑,直接照桌牌模式複製即可。

---

## 🔴 SPEC 與現況的描述差異(需使用者拍板)

- **VI 資產**:[public/assets/ntnu-vi/](public/assets/ntnu-vi/) 實際是教室/建築照(`A101` / `A701~A721` 等),非 SPEC2 §2.2 寫的「校徽各版本」。`colors.json` 已補上,但圖檔本身要不要補正版校徽尚未決定。

---

## 部署前 checklist

1. [ ] `wrangler pages dev` 起本機,Host header 模擬測 `tools.ntnu.cc` rewrite
2. [ ] 短網址路徑回歸測試(`/abc`、`/api/*`、`/admin/*`)
3. [ ] 桌牌 PDF 跑一次中文姓名(html2canvas 版,**預期可正常顯示**)
4. [ ] 列印實測對折桌牌雙面方向
5. [ ] 主域名 `/` 三張 ecosystem 卡片在桌機 / 平板 / 手機的視覺平衡
6. [ ] CSP([public/_headers](public/_headers))確認:cdnjs 已涵蓋 html2canvas + jspdf,**不需改動**
