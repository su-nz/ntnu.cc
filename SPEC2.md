# ntnu.cc 資訊入口網站 — 系統規格書 v2

> 本規格延伸自既有 `ntnu.cc` 短網址服務 (Cloudflare Pages + Functions + KV),將網域定位升級為「師大資訊入口」,以短網址為主體,以 `tools.ntnu.cc` 子網域承載視覺自動化工具箱。

---

## 1. 專案定位 (Vision & Positioning)

* **主體服務**:`ntnu.cc/{shortcode}` 短網址轉址 (現況,不動)。
* **新增定位**:`ntnu.cc` 根域名升級為「師大資訊入口網站」,首頁同時承擔短網址介紹與其他子服務的導覽入口。
* **子服務承載**:以子網域 (`tools.ntnu.cc`、未來 `docs.ntnu.cc` 等) 做粗分類,每個子網域內再以路徑切分具體工具 (`tools.ntnu.cc/deskcard`、`tools.ntnu.cc/cert`...)。
* **第一個落地的子服務**:`tools.ntnu.cc` — 師大視覺自動化工具箱,定位為「免登入、純前端處理、嚴格遵循師大 VI 規範」的行政/活動工具集合。
* **發展策略**:前期以純前端工具出發 → 中期引入模板生態系 → 長期可擴充為校園雲端設計協作平台。

---

## 2. 系統架構 (System Architecture)

### 2.1 高層架構圖

```
                          Cloudflare Pages (單一專案)
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
   ntnu.cc                    tools.ntnu.cc              (預留) *.ntnu.cc
   (主體 / 入口)              (工具箱樞紐)               (未來子服務)
        │                            │
        ├── /{shortcode}             ├── /              (工具總覽)
        │   → KV 轉址 (現況)         ├── /deskcard      (桌牌產生器)
        ├── /api/*                   ├── /cert          (證書產生器)
        ├── /admin/*                 ├── /badge         (識別證排版)
        └── / (首頁:介紹 +          └── /assets/*      (共用 VI 資產)
              其他服務導覽)
```

### 2.2 與既有架構的對齊原則

| 既有架構特性 | 新規劃延續方式 |
|---|---|
| 純 Cloudflare Pages,無 build step | 工具子站一律手寫 HTML/CSS/JS,需要的第三方函式庫一律走 CDN (`cdn.jsdelivr.net` / `cdnjs.cloudflare.com`,已在 CSP 白名單) |
| Pages Functions + KV 為唯一後端 | 工具預設純前端、資料不落地;若日後需後端 (如雲端模板庫),才新增 Functions endpoint + 對應 KV namespace |
| UI 主題集中在 [functions/lib/templates.js](functions/lib/templates.js) 的 CSS 變數 | 工具子站抽出共用 stylesheet (`/assets/ntnu-theme.css`),延用既有變數命名 (`--primary` `#9B2335`、陰影系統),確保視覺一致 |
| 安全 header 在 [_middleware.js](functions/_middleware.js) 統一注入 | 子網域共用同一份 middleware,僅在 host 判斷分支裡掛載不同的靜態路徑 |
| `public/ntnu dataset/` 已收藏 34 張 NTNU VI 圖檔 (校徽各版本) | 直接搬遷至 `public/assets/ntnu-vi/`,作為工具子站的 VI 資產來源 |

### 2.3 子網域路由策略 (Host-based routing)

* Cloudflare Pages 一個專案綁定多個 custom domain (`ntnu.cc`、`tools.ntnu.cc`,未來可加 wildcard)。
* 在 [functions/_middleware.js](functions/_middleware.js) 取 `request.headers.get('host')`,改寫請求路徑:
  * `tools.ntnu.cc/foo` → 內部 rewrite 至 `/_sites/tools/foo`,從 `public/_sites/tools/` 取靜態檔。
  * `ntnu.cc/foo` 維持既有短網址行為。
* 靜態資源 (`/assets/*`、`*.png` 等) 兩個 host 共用,不做 rewrite。
* 重要:rewrite 必須在「靜態副檔名跳出」之前完成,避免動到 favicon、og-image 等檔案。

### 2.4 目錄結構 (調整後)

```
ntnu.cc/
├── functions/
│   ├── _middleware.js          # ★ 改:新增 host-based routing
│   ├── [id].js                 # 既有:短碼轉址 (僅 host=ntnu.cc 觸發)
│   ├── api/                    # 既有:短網址 API
│   ├── admin/                  # 既有:管理後台
│   ├── lib/                    # 既有
│   └── tools/                  # ★ 新:工具子站專用 Functions (預留,初期可能為空)
│       └── _middleware.js      #   工具子站的額外安全/快取規則 (如有)
├── public/
│   ├── index.html              # ★ 改:升級為入口首頁 (短網址介紹 + 子服務導覽卡)
│   ├── 404.html                # 既有
│   ├── assets/
│   │   ├── ntnu-theme.css      # ★ 新:從 templates.js 抽出的共用主題
│   │   ├── ntnu-ui.js          # ★ 新:共用 UI helper (toast、modal、檔案拖放)
│   │   └── ntnu-vi/            # ★ 新:VI 資產 (由 public/ntnu dataset/ 搬遷)
│   │       ├── logo/           #   校徽各版本
│   │       ├── colors.json     #   標準色票
│   │       └── ...
│   └── _sites/
│       └── tools/              # ★ 新:tools.ntnu.cc 站台根目錄
│           ├── index.html      #   工具總覽
│           ├── deskcard/
│           │   ├── index.html  #   桌牌產生器入口
│           │   └── app.js      #   工具邏輯 (純前端)
│           ├── cert/           #   (階段一第二個)
│           └── badge/          #   (階段一第三個)
├── package.json
├── wrangler.toml               # ★ 改:確認 custom domain 設定
└── SPEC2.md                    # 本文件
```

> 註:`public/_sites/` 前綴的 underscore 是給人類看的「這是 host-routed 內部目錄、不對外直接 expose」的慣例。Cloudflare Pages 本身不會特別處理。

---

## 3. 入口首頁 (`ntnu.cc/`) 重新設計

既有 [public/index.html](public/index.html) 是純短網址說明頁。改版後:

* **主視覺區**:保留短網址作為主打 (Hero 仍突出「ntnu.cc/xxxxxx」)。
* **下方新增「師大服務生態」區塊**:卡片式陳列子服務,每張卡片含 icon、一句話描述、CTA 連結:
  * 🎴 視覺工具箱 → `tools.ntnu.cc`
  * (未來) 📄 文件中心 → `docs.ntnu.cc`
  * (未來) 📚 資源索引 → `links.ntnu.cc`
* **配色/字型/陰影**完全延用既有 CSS 變數,不引入新設計語言。

---

## 4. 工具箱共用基礎 (`tools.ntnu.cc` Platform Layer)

工具子站之間共用以下層級 (純前端、無框架):

### 4.1 主題層 (`/assets/ntnu-theme.css`)
* 從 [functions/lib/templates.js](functions/lib/templates.js:40) 既有 `:root` 變數抽離。
* 提供基礎排版、按鈕、表單、卡片、modal 樣式。

### 4.2 VI 資產層 (`/assets/ntnu-vi/`)
* **色彩系統**:`colors.json` 內含師大紅、金黃、水藍、古典灰等標準色值,工具可直接 fetch 載入。
* **官方素材**:校徽 (標籤式、圓形、單色、反白)、校名中英文字體圖檔、百年校慶幾何紋路、校園地標剪影 (後續逐步補齊)。
* **字體**:思源黑體 / 思源宋體透過 jsDelivr 載入 (已在 CSP 白名單);PDF 內嵌字體則以 Base64 subset 方案處理。

### 4.3 通用引擎層 (各工具用 `<script src>` 載入)
| 用途 | 函式庫 | 載入方式 |
|---|---|---|
| Excel/CSV 解析 | SheetJS (`xlsx`) | CDN |
| PDF 輸出 (結構化批次) | pdfmake | CDN |
| PDF 輸出 (DOM 截圖) | jsPDF + html2canvas | CDN |
| 瀏覽器本地儲存 | LocalForage (IndexedDB wrapper) | CDN |
| 共用 UI helper | `/assets/ntnu-ui.js` (自寫,toast/modal/拖放) | 本站 |

### 4.4 工具註冊機制
* 在 [public/_sites/tools/index.html](public/_sites/tools/index.html) 維護一份「工具清單 JSON」,新增工具時改一處即可在總覽頁出現。
* 每個工具是一個獨立資料夾,路徑即路由 (Cloudflare Pages 預設行為),零設定。

---

## 5. 第一階段核心工具:A4 摺紙桌牌產生器 (`tools.ntnu.cc/deskcard`)

### 5.1 摺紙物理佈局
* A4 (210mm × 297mm) 橫式或直式列印。
* 3/4 條狀版型:A4 上 3/4 為立牌主體 (三折或四折),剩餘 1/4 為裁切區。
* 畫布繪製虛線 (摺疊線) 與實線 (裁切線)。
* **雙面反轉渲染**:摺疊後雙面顯示,編輯器自動產生「正面」與「背面 (180° 反轉)」對齊圖層,使用者不需手動旋轉。

### 5.2 編輯器功能
* **WYSIWYG 畫布**:依 A4 物理尺寸做 CSS 比例縮放,所見即所得。
* **動態文字縮放 (auto-fit)**:姓名/職稱過長時自動縮小字體,防止跑版。
* **元件鎖定**:校徽與背景浮水印預設鎖定,只開放文字框與個人 Logo 拖拉。
* **批次資料匯入**:支援 `.csv`/`.xlsx` 拖放、複製貼上 Excel 欄位 (SheetJS)。
* **欄位對應**:使用者自訂「A 欄 → 姓名、B 欄 → 職稱」,即時錯誤檢查 (字數過長、空欄位)。
* **分頁導覽器**:匯入 50 筆 → 左側顯示 50 頁縮圖,可單獨微調某頁。
* **輸出**:pdfmake 直接組多頁 PDF;字體 Base64 內嵌。

### 5.3 純前端不落地
* 整支工具在瀏覽器內完成,使用者上傳的名單不上傳到任何伺服器。
* 模板與常用名單透過 LocalForage 存在瀏覽器本機。

---

## 6. 技術選型 (與既有架構對齊後的決議)

| 區塊 | 選型 | 理由 |
|---|---|---|
| **執行環境** | Cloudflare Pages + Pages Functions (既有) | 不動現有部署模型 |
| **前端框架** | ❌ 無框架,純 HTML/CSS/JS | 維持零 build step,與 [public/index.html](public/index.html) 一致 |
| **樣式** | 自寫 CSS + CSS 變數 (沿用 templates.js 設計) | 不引入 Tailwind 以免改動部署流程 |
| **PDF 生成** | pdfmake (主) + jsPDF/html2canvas (備援) | 批次精準排版用 pdfmake;複雜視覺用截圖 |
| **資料處理** | SheetJS | 純前端、輕量 |
| **本地儲存** | LocalForage | IndexedDB 封裝,API 簡潔 |
| **後端 (預留)** | Pages Functions + 新 KV namespace | 階段二需要雲端模板/SSO 時才加 |
| **CDN 來源** | `cdn.jsdelivr.net`、`cdnjs.cloudflare.com` | 已在 [public/_headers](public/_headers) CSP 白名單 |

---

## 7. 安全與部署

* **CSP**:現有 [public/_headers](public/_headers) CSP 已涵蓋 jsDelivr / cdnjs,工具子站可直接用;若日後引入新 CDN 需更新 `_headers`。
* **靜態資產快取**:`/assets/*` 套用既有 `max-age=31536000` 長快取;HTML `no-cache`。
* **子網域 TLS**:Cloudflare Pages 為每個 custom domain 自動簽發憑證,新增 `tools.ntnu.cc` 只需在 DNS + Pages 設定面板各加一筆。
* **部署**:沿用 `npm run deploy` (`wrangler pages deploy ./public`),單一專案、單次部署同步更新所有子網域。

---

## 8. Roadmap

### 階段一:純前端工具箱 (0 → 1)
* 改造 `ntnu.cc/` 入口首頁,加入子服務導覽。
* 上線 `tools.ntnu.cc` 樞紐 + 桌牌產生器、證書產生器、識別證產生器。
* 主打「免登入、無伺服器、資料不落地、極速產出」。

### 階段二:使用者生態系與雲端化 (1 → 10)
* SSO:串接師大校務行政系統,區分教職員/學生權限 (新增 `functions/auth/*`)。
* 雲端模板庫:各系所上傳專屬模板,全校套用 (新增 KV `TEMPLATES_KV`)。
* 歷史紀錄雲端化:行政助教可儲存歷年活動名單。

### 階段三:AI 輔助文宣 (10 → 100)
* LLM 文案自動填入海報/桌牌欄位。
* 自動配色修正:上傳圖片與師大紅衝突時建議輔助色或遮罩。

---

## 9. 待辦清單 (進入實作前需確認)

1. ⬜ DNS 加入 `tools.ntnu.cc` CNAME,Pages 加入 custom domain。
2. ⬜ 把 `public/ntnu dataset/` 重新組織並搬到 `public/assets/ntnu-vi/`,順手把中文檔名改成英文 (避開 URL encode 問題)。
3. ⬜ 從 [functions/lib/templates.js](functions/lib/templates.js) 抽出共用 CSS 到 `public/assets/ntnu-theme.css`,並讓 templates.js 改 import 同一份檔案 (或保持複製、註明同步義務)。
4. ⬜ 修改 [functions/_middleware.js](functions/_middleware.js) 加入 host-based rewrite,並確認既有短網址行為 100% 不受影響 (含 `/api/*`、`/admin/*`、`/{id}`)。
5. ⬜ 建立 `public/_sites/tools/index.html` 樞紐頁。
6. ⬜ 桌牌產生器 MVP。
