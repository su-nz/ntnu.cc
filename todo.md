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

---

## 🟡 未驗證 / 已知風險(下次優先處理)

### 1. 桌牌 PDF 中文字體 — 八成會壞
pdfmake 用內建 Roboto VFS,中文很可能變方塊或退回不同機器各異的系統字體。
- **選項 A**:把 Noto Sans TC subset 轉 Base64 注進 pdfmake VFS
- **選項 B**:改用 jsPDF + html2canvas(SPEC2 §4.3 的備援方案)
- **驗收**:在 Windows / Mac 各跑一次 PDF 下載,中文姓名能正常顯示

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

### 5. 桌牌雙面反轉的實際效果
pdfmake 不支援 transform rotate,目前是「把背面文字從下往上排」來模擬反轉視覺。
- **必須列印實測**:對折後翻過來看,姓名/職稱方向是否正確
- 若不正確,需改用 jsPDF 或在 SVG layer 做真正的 180° rotate

### 6. 預覽 vs PDF auto-fit 公式不一致
預覽用 px、PDF 用 pt,字級上下限各寫各的。
- 長姓名(>10 字)可能畫面看起來剛好、PDF 卻溢出,反之亦然
- 應該抽成同一個公式

---

## 🔴 還沒動的 SPEC2 項目

### SPEC2 §3:主域名首頁升級
[public/index.html](public/index.html) 還是純短網址介紹頁,需要加入「師大服務生態」卡片區塊:
- 🎴 視覺工具箱 → `tools.ntnu.cc`(已可連)
- 📄 文件中心 → `docs.ntnu.cc`(未來)
- 📚 資源索引 → `links.ntnu.cc`(未來)

配色/字型/陰影沿用既有 CSS 變數,不引入新設計語言。

---

## 部署前 checklist

1. [ ] `wrangler pages dev` 起本機,Host header 模擬測 `tools.ntnu.cc` rewrite
2. [ ] 短網址路徑回歸測試(`/abc`、`/api/*`、`/admin/*`)
3. [ ] 桌牌 PDF 跑一次中文姓名(預期會壞)
4. [ ] 列印實測對折桌牌雙面方向
5. [ ] CSP([public/_headers](public/_headers))確認:cdnjs + jsdelivr 已涵蓋,**若補中文字體 from jsdelivr**,要同步加 `style-src` 與 `font-src` 白名單
