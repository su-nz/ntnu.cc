# SPEC 驗收檢查表

根據 SPEC.md 第 9 節驗收標準進行功能對照檢查。

## 9.1 功能驗收

### 建立短網址
- [x] POST `/api/create` 成功返回 `id` 與 `shortUrl`（域名為 `https://ntnu.cc`）
  - 實作位置：[functions/api/create.js](functions/api/create.js)
- [x] 自動生成 ID 無衝突（6 位英數字隨機生成，衝突時重試）
- [x] 自定義 ID 若衝突回 `409`

### 轉址行為
- [x] GET `/{id}` 顯示 CAPTCHA
  - 實作位置：[functions/[id].js](functions/[id].js)
- [x] POST `/{id}` 驗證通過後以 302 導向至目標 URL
- [x] 不存在的 `id` 返回 404

### 監控通知
- [x] 建立成功在 Discord 收到通知
  - 實作位置：[functions/lib/discord.js](functions/lib/discord.js)
- [x] 異常事件（存取拒絕、惡意網域、系統錯誤）發送告警

---

## 9.2 安全驗收（Security Checklist）

### 認證安全
- [x] `ADMIN_API_KEY` 長度 ≥ 32 字元（範本建議）
- [x] API Key 僅透過 `Authorization` Header 傳送
  - 實作位置：[functions/lib/validation.js](functions/lib/validation.js) - `validateApiKey()`
- [x] 連續 5 次認證失敗後 IP 被鎖定
  - 實作位置：[functions/lib/security.js](functions/lib/security.js) - `recordFailedAttempt()`

### 輸入驗證
- [x] 目標 URL 僅接受 `http://` 或 `https://` 協定
  - 實作位置：[functions/lib/validation.js](functions/lib/validation.js) - `validateUrl()`
- [x] 禁止內網 IP、localhost、自身域名（防 SSRF）
- [x] 短碼 ID 僅允許 `[a-zA-Z0-9-]`，長度 1-32
  - 實作位置：[functions/lib/validation.js](functions/lib/validation.js) - `validateId()`
- [x] 保留字（admin、api 等）無法作為短碼

### XSS 防護
- [x] 所有動態內容經過 HTML 編碼
  - 實作位置：[functions/lib/utils.js](functions/lib/utils.js) - `escapeHtml()`
- [x] CSP Header 已設定並阻擋 inline script
  - 實作位置：[functions/lib/utils.js](functions/lib/utils.js) - `getSecurityHeaders()`

### 速率限制
- [x] `/api/create` 每 IP 每分鐘 ≤ 10 次
  - 實作位置：[functions/api/create.js](functions/api/create.js)
- [x] `/{id}` 每 IP 每分鐘 ≤ 60 次
- [x] 超限回應 429 並顯示剩餘等待時間

### 秘密管理
- [x] `ADMIN_API_KEY`、`TURNSTILE_SECRET`、`DISCORD_WEBHOOK_URL` 未出現在程式碼庫
- [x] `.env` 檔案已加入 `.gitignore`

### HTTP 安全標頭
- [x] 已設定 HSTS、X-Content-Type-Options、X-Frame-Options、CSP
  - 實作位置：[functions/lib/utils.js](functions/lib/utils.js) - `getSecurityHeaders()`
  - 實作位置：[functions/_middleware.js](functions/_middleware.js)

### 惡意網域防護
- [x] 靜態黑名單檢查功能
  - 實作位置：[functions/lib/validation.js](functions/lib/validation.js) - `isBlockedDomain()`
- [ ] Safe Browsing API 整合（選配，未實作）

### 日誌與稽核
- [x] 關鍵事件有記錄（透過 Discord 通知）
- [x] 敏感資訊（API Key）於日誌中已脫敏
  - 實作位置：[functions/lib/discord.js](functions/lib/discord.js) - `maskIp()`

---

## 功能模組對照表

| SPEC 需求 | 實作檔案 | 狀態 |
|-----------|----------|------|
| 4.1 短碼頁面與轉址（含 CAPTCHA） | `functions/[id].js` | ✅ |
| 4.1 POST 管理端 API | `functions/api/create.js` | ✅ |
| 4.1 管理員介面 | `functions/admin/index.js` | ✅ |
| 4.1 統計查詢 | `functions/api/stats/[id].js` | ✅ |
| 2.1 使用者轉址頁 | `functions/lib/templates.js` | ✅ |
| 2.1 IP 限制頁 | `functions/lib/templates.js` | ✅ |
| 2.1 管理員後台 | `functions/admin/index.js` | ✅ |
| 2.1 分析儀表板 | `functions/admin/analytics.js` | ✅ |
| 2.4 Discord 通知 | `functions/lib/discord.js` | ✅ |
| 6.1 API Key 驗證 | `functions/lib/validation.js` | ✅ |
| 6.2 URL 驗證 | `functions/lib/validation.js` | ✅ |
| 6.2 ID 驗證 | `functions/lib/validation.js` | ✅ |
| 6.3 速率限制 | `functions/lib/security.js` | ✅ |
| 6.5 IP 白名單 | `functions/lib/utils.js` | ✅ |
| 6.7 安全標頭 | `functions/lib/utils.js` | ✅ |
| 全域中間件 | `functions/_middleware.js` | ✅ |

---

## 資料結構對照

| KV Key 格式 | 用途 | 實作狀態 |
|-------------|------|----------|
| `link:{id}` | 短碼對應的目標 URL | ✅ |
| `stats:{id}` | 點擊統計 | ✅ |
| `disabled:{id}` | 停用標記 | ✅ |
| `session:{key}` | 管理員 Session | ✅ |
| `ratelimit:{ip}:{endpoint}` | 速率限制計數 | ✅ |
| `lockout:{ip}` | IP 鎖定狀態 | ✅ |
| `failed:{ip}` | 失敗嘗試計數 | ✅ |

---

## 錯誤狀態碼對照

| 狀態碼 | 情境 | 實作狀態 |
|--------|------|----------|
| 200 | 建立成功、查詢成功 | ✅ |
| 302 | 轉址成功 | ✅ |
| 400 | 無效請求 | ✅ |
| 401 | API Key 驗證失敗 | ✅ |
| 403 | 惡意網域阻擋 | ✅ |
| 404 | ID 不存在 | ✅ |
| 405 | 方法不允許 | ✅ |
| 409 | ID 衝突 | ✅ |
| 429 | 速率限制 | ✅ |
| 500 | 伺服器錯誤 | ✅ |

---

## Discord 通知事件對照

| 事件類型 | Embed 顏色 | 實作狀態 |
|----------|------------|----------|
| Link Created | 綠色 `#2ECC71` | ✅ |
| Access Denied | 橙色 `#E67E22` | ✅ |
| Blocked Domain | 紅色 `#E74C3C` | ✅ |
| System Error | 紅色 `#E74C3C` | ✅ |
| Rate Limited | 橙色 `#E67E22` | ✅ |
| Login Failed | 紅色 `#E74C3C` | ✅ |
| Link Deleted | 紫色 `#9B59B6` | ✅ |

---

## 管理員介面功能

- [x] 列出 `link:*` keys（支援分頁）
- [x] 顯示短碼 ID、目標 URL、點擊數
- [x] 搜尋：依短碼 ID 或目標 URL 關鍵字篩選
- [x] 刪除：選取單筆或多筆短碼後刪除（需確認）
- [x] 導出：匯出為 CSV 或 JSON 格式
- [x] Session 管理（1 小時有效期）

## 分析儀表板功能

- [x] 總短網址數、總點擊數統計
- [x] 熱門短碼排行（前 10 名）
- [x] 來源國家統計（長條圖）
- [x] 單一短碼查詢
- [x] JSON 格式匯出

---

## 待辦/選配功能

- [ ] Google Safe Browsing API 整合（SPEC 標註為選配）
- [ ] JWT Session 取代 UUID Session（SPEC 建議升級）
- [ ] Cloudflare Access 整合（SPEC 強烈建議）
- [ ] CSRF Token 保護（POST/DELETE 請求）
- [ ] VirusTotal/PhishTank 整合

---

## 檔案結構總覽

```
ntnu.cc/
├── functions/
│   ├── [id].js              # 短碼轉址處理 (GET/POST)
│   ├── _middleware.js       # 全域中間件
│   ├── api/
│   │   ├── create.js        # 建立短網址 API
│   │   ├── health.js        # 健康檢查
│   │   ├── links.js         # 批量刪除 API
│   │   ├── list.js          # 列出所有短網址
│   │   └── stats/
│   │       └── [id].js      # 統計查詢 API
│   ├── admin/
│   │   ├── index.js         # 管理後台
│   │   └── analytics.js     # 分析儀表板
│   └── lib/
│       ├── utils.js         # 工具函數
│       ├── validation.js    # 驗證模組
│       ├── security.js      # 安全模組
│       ├── discord.js       # Discord 通知
│       └── templates.js     # HTML 模板
├── public/
│   ├── index.html           # 首頁
│   ├── 404.html             # 404 頁面
│   ├── robots.txt           # 爬蟲規則
│   └── sitemap.xml          # 網站地圖
├── package.json
├── wrangler.toml
├── .gitignore
├── .dev.vars.example
├── SPEC.md
├── README.md
└── CHECKLIST.md             # 本檔案
```

---

**驗收結論：所有核心功能已完成實作，符合 SPEC 規格要求。**
