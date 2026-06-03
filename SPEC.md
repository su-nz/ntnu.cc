# 短網址服務與監控系統規格（ntnu.cc）

## 1. 專案概述
- 目標：建立一個安全、可擴展、可監控的短網址服務，基於 Cloudflare Pages Functions 與 Cloudflare KV，並整合 Discord Webhook/Bot 進行通知與告警。
- 服務域名：ntnu.cc（範例短網址：`https://ntnu.cc/abc123`）
- 核心特性：快速查詢、暫時性導向（302）、管理 API 驗證、Discord 即時通知、可選的存取分析。

## 2. 系統架構

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              使用者端（Client）                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │  一般使用者      │    │  管理員          │    │  API 呼叫端             │  │
│  │  GET /{id}      │    │  /admin          │    │  POST /api/create      │  │
│  │  POST /{id}     │    │  /admin/analytics│    │  GET /api/stats/{id}   │  │
│  └────────┬────────┘    └────────┬─────────┘    └───────────┬────────────┘  │
└───────────┼──────────────────────┼──────────────────────────┼───────────────┘
            │                      │                          │
            ▼                      ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Cloudflare Edge Network（邊緣節點）                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Cloudflare Pages Functions                                         │    │
│  │  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐ │    │
│  │  │ functions/[id].js│ │ functions/admin/ │ │ functions/api/       │ │    │
│  │  │ - IP 檢查        │ │ - index.js       │ │ - create.js          │ │    │
│  │  │ - CAPTCHA 驗證   │ │ - analytics.js   │ │ - stats/[id].js      │ │    │
│  │  │ - 302 轉址       │ │ - KV 列表/搜尋   │ │ - 黑名單檢查         │ │    │
│  │  │ - 統計更新       │ │ - 刪除/導出      │ │ - Discord 通知       │ │    │
│  │  └──────────────────┘ └──────────────────┘ └──────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌───────────────────────────────────┼───────────────────────────────────┐  │
│  │                      環境變數 & 綁定                                   │  │
│  │  ADMIN_API_KEY │ TURNSTILE_* │ DISCORD_WEBHOOK_URL │ ALLOWED_CIDRS   │  │
│  └───────────────────────────────────┼───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────────┐
│  Cloudflare KV     │    │  Cloudflare        │    │  外部服務              │
│  (LINKS_KV)        │    │  Turnstile         │    │                        │
│  ┌──────────────┐  │    │  ┌──────────────┐  │    │  ┌──────────────────┐  │
│  │ link:{id}    │  │    │  │ CAPTCHA 驗證 │  │    │  │ Discord Webhook  │  │
│  │ → 目標 URL   │  │    │  │ 防機器人     │  │    │  │ - 建立通知       │  │
│  ├──────────────┤  │    │  └──────────────┘  │    │  │ - 異常告警       │  │
│  │ stats:{id}   │  │    └────────────────────┘    │  ├──────────────────┤  │
│  │ → 點擊統計   │  │                              │  │ Safe Browsing API│  │
│  └──────────────┘  │                              │  │ - 惡意網域檢查   │  │
└────────────────────┘                              │  └──────────────────┘  │
                                                    └────────────────────────┘
```

### 2.1 前端介面（Frontend）
- 技術：Cloudflare Pages 靜態託管（HTML/CSS/JS）。
- 頁面：
  - **使用者轉址頁** (`/{id}`)：顯示 CAPTCHA 驗證表單，通過後自動跳轉。
  - **IP 限制頁**：非允許網段時顯示，說明僅限師大校園網使用。
  - **管理員後台** (`/admin`)：登入後可檢視、搜尋、刪除短碼，並導出資料。
  - **分析儀表板** (`/admin/analytics`)：點擊趨勢、來源國家、熱門短碼圖表。
- 樣式：深色主題，響應式設計，支援桌面與行動裝置。

### 2.2 邊緣運算層（Cloudflare Pages Functions）
- 執行環境：Cloudflare Workers Runtime（V8 Isolates），全球邊緣節點運行。
- 模組：
  - **Redirect Engine** (`functions/[id].js`)：
    - 驗證來源 IP 是否在 `ALLOWED_CIDRS`。
    - 顯示 Turnstile CAPTCHA 頁面（GET）。
    - 驗證 CAPTCHA Token 後執行 302 轉址（POST）。
    - 更新 `stats:{id}` 點擊統計。
  - **Management API** (`functions/api/create.js`)：
    - 驗證 `ADMIN_API_KEY`。
    - 檢查 URL 合法性與黑名單。
    - 寫入 KV 並觸發 Discord 通知。
  - **Admin UI** (`functions/admin/index.js`)：
    - 驗證管理員權限後回傳 KV 列表 HTML。
    - 支援搜尋、刪除、導出。
  - **Analytics** (`functions/admin/analytics.js`)：
    - 讀取 `stats:*` 資料，回傳統計 JSON 或圖表頁面。
- 冷啟動：約 0ms（V8 Isolates 架構無傳統冷啟動問題）。

### 2.3 儲存層（Cloudflare KV）
- Namespace：`LINKS_KV`（需於 Cloudflare Dashboard 建立並綁定）。
- 資料結構：
  | Key 格式 | Value 內容 | 說明 |
  |----------|------------|------|
  | `link:{id}` | `https://example.com` | 短碼對應的目標 URL |
  | `stats:{id}` | `{"clicks":150,"last_access":"2026-01-05T12:00:00Z","countries":{"TW":120,"US":30}}` | 點擊統計（選配） |
- 特性：
  - 全球複寫，讀取延遲 < 50ms。
  - 最終一致性（寫入後約 60 秒全球同步）。
  - 免費方案：每日 100,000 次讀取、1,000 次寫入。

### 2.4 監控與通知（Discord Integration）
- 方式：透過 Discord Webhook 發送 Embed 訊息。
- 事件觸發：
  | 事件類型 | 觸發時機 | Embed 顏色 |
  |----------|----------|------------|
  | `Link Created` | 短網址建立成功 | 綠色 `#2ECC71` |
  | `Access Denied` | 錯誤 API Key 或頻率限制 | 橙色 `#E67E22` |
  | `Blocked Domain` | 惡意網域攔截 | 紅色 `#E74C3C` |
  | `System Error` | 伺服器端錯誤 | 紅色 `#E74C3C` |
- 訊息內容：短碼 ID、目標 URL、來源 IP/國家、時間戳記。

### 2.5 外部服務整合
- **Cloudflare Turnstile**：
  - 用途：防止機器人濫用轉址服務。
  - 設定：`TURNSTILE_SITE_KEY`（前端）、`TURNSTILE_SECRET`（後端驗證）。
- **Google Safe Browsing API**（選配）：
  - 用途：即時檢查目標 URL 是否為惡意網站。
  - 觸發：於 `/api/create` 建立短碼前查詢。
- **Discord Webhook**：
  - 用途：系統事件即時通知。
  - 設定：`DISCORD_WEBHOOK_URL` 環境變數。

## 3. 功能需求
### 3.1 核心轉址
- 短網址解析：在 $O(1)$ 時間複雜度內完成 Key→Value 檢索（KV 讀取）。
- 重新導向：使用 302 Found（暫時性），符合 SEO 與分析考量。
- 自定義 ID：
	- 使用者可指定 ID；若未指定，系統自動生成 6 位字元隨機字串（字母與數字）。
	- 避免與既有 ID 衝突（需先查 KV）。

### 3.2 監控（Discord）
- 建立通知：新短網址建立成功時推送通知。
- 異常告警：
	- 錯誤 API Key 嘗試。
	- 連續 404 次數過多。
- 存取分析（選配）：定期統計特定 ID 點擊次數並推送到 Discord。

## 4. 介面與流程
### 4.1 Cloudflare Pages Functions 對應
- 檔案結構（相對於 repo 根目錄）：
	- `functions/api/create.js`（或 `ts`）：POST 管理端 API。
	- `functions/[id].js`（或 `ts`）：短碼頁面與轉址流程（含 CAPTCHA）。
	- `functions/admin/index.js`：管理員介面（KV 列表檢視）。
	- （選配）`functions/api/stats/[id].js`：GET 查詢統計。

### 4.2 API 規格
- [POST] `/api/create`（管理端）
	- 認證：Header 或 Body 攜帶 `ADMIN_API_KEY`。
	- 參數：
		- `url`（必填）：原始目標 URL。
		- `id`（選填）：自定義短碼；若省略則系統生成。
	- 邏輯流程：
		1. 驗證 API Key。
		2. 檢查 URL 合法性（Regex 或 `new URL()` 驗證）。
		3. 若指定 `id`，先檢查是否衝突。
		4. 寫入 KV：`link:{id}` → 原始 URL。
		5. 觸發 Discord Webhook 推送「成功建立」訊息。
	- 成功回應：`{ id, shortUrl: "https://ntnu.cc/{id}", targetUrl }`
	- 失敗回應：`{ error, code }`（如 `UNAUTHORIZED`, `INVALID_URL`, `CONFLICT`, `SERVER_ERROR`）。

- [GET] `/{id}`（客戶端）
	- 邏輯流程：
		1. 取得使用者 IP（`cf-connecting-ip`）。
		2. 驗證 IP 是否在 `ALLOWED_CIDRS` 允許清單（如 `140.122.0.0/16`）。
		3. 若允許：顯示 CAPTCHA（Cloudflare Turnstile）頁面；使用者通過驗證後才執行轉址。
		4. 若不允許：回應 200 限制頁面（不進行跳轉）。
	- （選配）紀錄點擊：更新 `stats:{id}`：`{"clicks": n, "last_access": ISO8601 }`。

- [POST] `/{id}`（客戶端提交 CAPTCHA）
	- 邏輯流程：
		1. 取得使用者 IP（`cf-connecting-ip`）。
		2. 驗證 IP 是否在 `ALLOWED_CIDRS`；若不允許則返回限制頁面。
		3. 驗證 Turnstile Token（`cf-turnstile-response`）與 `TURNSTILE_SECRET`。
		4. 通過驗證後，從 KV 檢索 `link:{id}` → 存在則回 302；不存在回 404。

### 4.3 錯誤與狀態碼
- 200：建立成功（POST）。
- 302：轉址成功（GET）。
- 401：API Key 驗證失敗。
- 404：ID 不存在。
- 409：ID 衝突（自定義 ID 已被使用）。
- 429：速率限制觸發（由 WAF 或應用層）。
- 500：伺服器端錯誤。

## 5. 資料設計（Data Schema）
- KV Namespace 綁定名稱：`LINKS_KV`
- Key/Value 結構：
	- `link:{id}` → `https://original-url.com`（核心映射）
	- `stats:{id}` → `{"clicks": 150, "last_access": "..."}`（選配統計）

## 6. 安全與防護

### 6.0 安全威脅模型與防護總覽

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            威脅模型（Threat Model）                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  攻擊者類型        │  攻擊目標              │  防護措施                      │
├───────────────────┼───────────────────────┼────────────────────────────────┤
│  未授權使用者      │  繞過 IP 限制存取      │  多層 IP 驗證、禁止代理繞過     │
│  暴力破解者        │  猜測 API Key          │  速率限制、Key 複雜度、鎖定機制 │
│  機器人/爬蟲       │  大量建立/存取短網址    │  Turnstile CAPTCHA、WAF        │
│  釣魚攻擊者        │  利用短網址散布惡意連結 │  黑名單、Safe Browsing、審核    │
│  中間人攻擊        │  竊取 API Key/Token    │  強制 HTTPS、HSTS              │
│  XSS/注入攻擊      │  注入惡意腳本或指令     │  輸入過濾、CSP、輸出編碼       │
│  列舉攻擊          │  猜測短碼取得目標 URL   │  隨機 ID、存取日誌、異常偵測   │
│  DoS/DDoS          │  癱瘓服務              │  Cloudflare DDoS 防護、WAF     │
│  內部威脅          │  管理員憑證外洩         │  環境變數隔離、稽核日誌        │
└───────────────────┴───────────────────────┴────────────────────────────────┘
```

### 6.1 認證與授權安全

#### 6.1.1 API Key 安全
- **複雜度要求**：
  - `ADMIN_API_KEY` 長度至少 32 字元，包含大小寫字母、數字、特殊符號。
  - 建議使用 `openssl rand -base64 48` 或類似工具生成。
- **傳輸方式**：
  - **必須**透過 `Authorization: Bearer <key>` Header 傳送，**禁止**於 URL Query String 傳送（避免日誌洩漏）。
  - 禁止於 GET 請求中傳送 API Key。
- **暴力破解防護**：
  - 連續 5 次驗證失敗後，該 IP 鎖定 15 分鐘。
  - 鎖定資訊可存於 KV：`lockout:{ip}` → `{count, until}`。
  - 每次失敗推送 Discord 告警（含來源 IP、User-Agent）。
- **Key 輪換**：
  - 建議每 90 天更換一次 `ADMIN_API_KEY`。
  - 支援同時存在新舊兩組 Key（過渡期 24 小時）。

#### 6.1.2 管理員介面安全
- **Session 管理**（建議升級）：
  - 目前：每次請求攜帶 API Key（無狀態）。
  - 建議：驗證成功後發放短期 JWT（有效期 1 小時），存於 HttpOnly Cookie。
  - JWT Payload：`{ sub: "admin", iat, exp, ip }`（綁定 IP 防止 Token 盜用）。
- **CSRF 防護**：
  - 所有 POST/DELETE 請求需攜帶 CSRF Token。
  - Token 產生：`crypto.randomUUID()` 存於 Session 或 Cookie。
  - 驗證：比對 Header `X-CSRF-Token` 與 Cookie/Session 中的值。
- **Cloudflare Access（強烈建議）**：
  - 於 `/admin` 與 `/admin/*` 路徑啟用 Cloudflare Access。
  - 設定允許的 Email 網域（如 `@ntnu.edu.tw`）或 IP 範圍。
  - 提供 MFA（多因素驗證）額外保護。

### 6.2 輸入驗證與過濾

#### 6.2.1 URL 驗證（嚴格模式）
```javascript
function validateUrl(input) {
  // 1. 長度限制
  if (!input || input.length > 2048) return { valid: false, error: "URL_TOO_LONG" };
  
  // 2. 協定白名單（僅允許 http/https）
  let url;
  try {
    url = new URL(input);
  } catch {
    return { valid: false, error: "INVALID_URL_FORMAT" };
  }
  
  if (!["http:", "https:"].includes(url.protocol)) {
    return { valid: false, error: "INVALID_PROTOCOL" }; // 阻擋 javascript:, data:, file:
  }
  
  // 3. 禁止本地/內網 IP（防止 SSRF）
  const hostname = url.hostname.toLowerCase();
  const ssrfPatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,           // Link-local
    /^0\./,                  // 0.0.0.0/8
    /^\[::1\]$/,             // IPv6 localhost
    /^\[fc|fd/i,             // IPv6 private
    /\.local$/i,             // mDNS
    /\.internal$/i,
    /\.corp$/i,
  ];
  if (ssrfPatterns.some(p => p.test(hostname))) {
    return { valid: false, error: "SSRF_BLOCKED" };
  }
  
  // 4. 禁止指向自身（防止無限迴圈）
  if (hostname === "ntnu.cc" || hostname.endsWith(".ntnu.cc")) {
    return { valid: false, error: "SELF_REFERENCE_BLOCKED" };
  }
  
  // 5. 禁止特殊字元（防止 Header Injection）
  if (/[\r\n\x00]/.test(input)) {
    return { valid: false, error: "INVALID_CHARACTERS" };
  }
  
  return { valid: true, url: url.href };
}
```

#### 6.2.2 短碼 ID 驗證
```javascript
function validateId(id) {
  // 僅允許英數字與連字號，長度 1-32
  if (!/^[a-zA-Z0-9-]{1,32}$/.test(id)) {
    return { valid: false, error: "INVALID_ID_FORMAT" };
  }
  
  // 保留字檢查（避免與系統路徑衝突）
  const reserved = ["admin", "api", "static", "assets", "_", "health", "robots.txt", "favicon.ico"];
  if (reserved.includes(id.toLowerCase())) {
    return { valid: false, error: "RESERVED_ID" };
  }
  
  return { valid: true };
}
```

#### 6.2.3 輸出編碼（XSS 防護）
- 所有動態插入 HTML 的內容必須經過編碼：
```javascript
function escapeHtml(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}
```
- **Content Security Policy (CSP)**：
```
Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self';
```

### 6.3 速率限制（Rate Limiting）

#### 6.3.1 分層限制策略
| 端點 | 限制 | 時間窗口 | 超限回應 |
|------|------|----------|----------|
| `POST /api/create` | 10 次 | 每分鐘 | 429 + 60 秒封鎖 |
| `GET /{id}` | 60 次 | 每分鐘 | 429 + 顯示等待頁 |
| `POST /{id}` (CAPTCHA) | 20 次 | 每分鐘 | 429 + 強制等待 |
| `/admin` 登入失敗 | 5 次 | 每 15 分鐘 | 401 + IP 鎖定 |
| `/admin/*` 操作 | 100 次 | 每分鐘 | 429 |

#### 6.3.2 實作方式
- **Cloudflare WAF 規則**（第一道防線）：
  - 設定 Rate Limiting Rule 於 Dashboard。
  - 動作：Block 或 Challenge（顯示 CAPTCHA）。
- **應用層計數器**（精細控 制）：
  - 使用 KV 儲存：`ratelimit:{ip}:{endpoint}` → `{count, reset_at}`
  - TTL 設為時間窗口長度（如 60 秒）。

### 6.4 惡意網域防護

#### 6.4.1 多層檢查機制
```
建立短網址請求 → 靜態黑名單檢查 → 動態 API 檢查 → 寫入 KV
                      ↓                    ↓
                  快速阻擋            即時威脅情報
```

- **靜態黑名單**（`BLOCKED_DOMAINS`）：
  - 格式：`domain1.com,*.phishing.net,evil.org`（支援 wildcard）
  - 更新：可透過管理介面或 API 動態更新。
- **Google Safe Browsing API**：
  - 於建立時查詢，若為惡意則拒絕。
  - 快取結果於 KV：`safebrowsing:{hash}` → `{safe: bool, checked_at}`（TTL 24 小時）。
- **額外建議**：
  - 整合 VirusTotal API 或 PhishTank 提供多源驗證。
  - 定期掃描既有短網址，若目標網站後續變為惡意則標記/停用。

#### 6.4.2 短網址濫用偵測
- 若同一 IP 短時間內建立大量指向不同網域的短網址，視為可疑行為。
- 觸發條件：同 IP 10 分鐘內建立 > 20 個短網址。
- 動作：暫停該 IP 建立權限 + Discord 告警。

### 6.5 網路存取限制（強化版）

#### 6.5.1 IP 驗證強化
- **多 Header 驗證**：
  - 優先使用 `cf-connecting-ip`（Cloudflare 提供）。
  - 若直接存取（繞過 CDN），檢查 `x-real-ip` 或 socket IP。
  - **關鍵**：拒絕 `X-Forwarded-For` 自行偽造（僅信任 Cloudflare Header）。
- **IPv6 處理**：
  - 若環境變數 `ALLOW_IPV6=false`（預設），IPv6 一律視為非允許。
  - 若需支援 IPv6，需額外設定 `ALLOWED_CIDRS_V6`。

#### 6.5.2 反代理/VPN 繞過
- 檢查 Cloudflare `cf-ipcountry`，若為 `T1`（Tor）或已知 VPN 國碼，可額外限制。
- 可整合 Cloudflare Bot Management 或 IP Intelligence API 偵測代理。

#### 6.5.3 設定範例
```
ALLOWED_CIDRS=140.122.0.0/16,2001:288:5400::/48
ALLOW_IPV6=true
BLOCK_TOR=true
BLOCK_KNOWN_VPN=false
```

### 6.6 秘密管理（Secrets Management）

#### 6.6.1 環境變數清單與用途
| 變數名稱 | 用途 | 安全等級 | 備註 |
|----------|------|----------|------|
| `ADMIN_API_KEY` | 管理 API 認證 | 🔴 極高 | 32+ 字元，定期輪換 |
| `TURNSTILE_SECRET` | CAPTCHA 後端驗證 | 🔴 極高 | 勿與 Site Key 混淆 |
| `DISCORD_WEBHOOK_URL` | 通知推送 | 🟠 高 | 含 Token，勿外洩 |
| `TURNSTILE_SITE_KEY` | CAPTCHA 前端顯示 | 🟢 低 | 公開可見 |
| `ALLOWED_CIDRS` | IP 白名單 | 🟢 低 | 可公開 |
| `BLOCKED_DOMAINS` | 網域黑名單 | 🟢 低 | 可公開 |

#### 6.6.2 安全實踐
- **嚴禁**：
  - 將任何 `🔴 極高` 或 `🟠 高` 等級變數寫入程式碼、Git 或前端。
  - 於錯誤訊息中暴露環境變數值。
  - 於日誌中記錄完整 API Key（可記錄前 8 字元供識別）。
- **建議**：
  - 使用 Cloudflare Pages 的「加密」環境變數功能。
  - Production 與 Preview 環境使用不同 Key。
  - 設定 `.gitignore` 排除 `.env`、`.dev.vars` 等檔案。

### 6.7 HTTP 安全標頭

所有回應應包含以下安全標頭：
```javascript
const securityHeaders = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com;",
};
```

### 6.8 日誌與稽核

#### 6.8.1 應記錄事件
| 事件類型 | 記錄內容 | 保留期限 |
|----------|----------|----------|
| 短網址建立 | ID, 目標 URL, 來源 IP, 時間, User-Agent | 90 天 |
| 轉址存取 | ID, 來源 IP, 國家, 時間, Referer | 30 天 |
| 管理員登入 | 成功/失敗, IP, 時間 | 180 天 |
| API Key 驗證失敗 | IP, 時間, 嘗試次數 | 180 天 |
| 惡意網域攔截 | 目標 URL, 來源 IP, 時間 | 180 天 |
| 速率限制觸發 | 端點, IP, 時間 | 30 天 |

#### 6.8.2 敏感資訊脫敏
- IP 位址：記錄完整（供安全分析），但對外顯示時可遮蔽最後一段。
- API Key：僅記錄前 8 字元，如 `abc12345...`。
- 目標 URL：完整記錄，但管理介面可選擇部分遮蔽。

### 6.9 應急回應計畫

#### 6.9.1 API Key 外洩
1. 立即於 Cloudflare Dashboard 更換 `ADMIN_API_KEY`。
2. 檢查近期建立的短網址，刪除可疑項目。
3. 審查存取日誌，確認是否有異常操作。
4. 推送 Discord 緊急告警通知團隊。

#### 6.9.2 發現惡意短網址
1. 立即將該短碼標記為停用（KV 加入 `disabled:{id}` 標記）。
2. 轉址時檢查停用標記，若存在則顯示警告頁面。
3. 記錄該短網址的建立資訊供後續調查。
4. 若為大規模攻擊，暫時關閉 `/api/create` 端點。

#### 6.9.3 DDoS 攻擊
1. 確認 Cloudflare DDoS 防護已啟用（自動）。
2. 若持續受攻擊，啟用「Under Attack Mode」。
3. 考慮暫時提高 Rate Limiting 嚴格程度。
4. 聯繫 Cloudflare 支援（若為付費方案）。

## 7. Discord 監控訊息格式
- 事件類型：`Link Created` / `Access Denied` / `System Error`
- 內容欄位：
	- 短網址 ID：`{id}`
	- 原始目標 URL：`{url}`
	- 請求來源國家：由 Cloudflare Header `cf-ipcountry`
	- 時間戳記：ISO 8601（UTC）
- 範例 Payload（Webhook）：
```json
{
	"embeds": [
		{
			"title": "Link Created",
			"color": 3066993,
			"fields": [
				{ "name": "ID", "value": "abc123", "inline": true },
				{ "name": "Short URL", "value": "https://ntnu.cc/abc123", "inline": true },
				{ "name": "Target URL", "value": "https://example.com" },
				{ "name": "Country", "value": "TW", "inline": true },
				{ "name": "Timestamp", "value": "2026-01-05T12:34:56Z", "inline": true }
			]
		}
	]
}
```

## 8. 部署流程
1. 環境初始化：建立 KV Namespace，並於 Cloudflare Pages 綁定為 `LINKS_KV`。
2. 安全性設定：於 Pages 專案環境變數設定 `ADMIN_API_KEY`, `DISCORD_WEBHOOK_URL`。
3. CI/CD：推送至 GitHub，觸發 Cloudflare Pages 自動部署。
4. 監控測試：
	 - 透過 `/api/create` 建立短網址。
	 - 驗證 Discord 頻道收到正確的 Embed 通知。
	 - 測試 404 與錯誤 API Key 場景之告警推送。

## 9. 驗收標準（Acceptance Criteria）

### 9.1 功能驗收
- 建立短網址：
	- POST `/api/create` 成功返回 `id` 與 `shortUrl`（域名為 `https://ntnu.cc`）。
	- 自動生成 ID 無衝突；自定義 ID 若衝突回 `409`。
- 轉址行為：
	- GET `/{id}` 顯示 CAPTCHA；POST `/{id}` 驗證通過後以 302 導向至目標 URL。
	- 不存在的 `id` 返回 404。
- 監控通知：
	- 建立成功與異常事件皆在 Discord 收到正確格式之 Embed。

### 9.2 安全驗收（Security Checklist）
- [ ] **認證安全**：
  - [ ] `ADMIN_API_KEY` 長度 ≥ 32 字元，含大小寫、數字、符號。
  - [ ] API Key 僅透過 `Authorization` Header 傳送，非 Query String。
  - [ ] 連續 5 次認證失敗後 IP 被鎖定。
- [ ] **輸入驗證**：
  - [ ] 目標 URL 僅接受 `http://` 或 `https://` 協定。
  - [ ] 禁止內網 IP、localhost、自身域名（防 SSRF）。
  - [ ] 短碼 ID 僅允許 `[a-zA-Z0-9-]`，長度 1-32。
  - [ ] 保留字（admin、api 等）無法作為短碼。
- [ ] **XSS 防護**：
  - [ ] 所有動態內容經過 HTML 編碼。
  - [ ] CSP Header 已設定並阻擋 inline script。
- [ ] **速率限制**：
  - [ ] `/api/create` 每 IP 每分鐘 ≤ 10 次。
  - [ ] 超限回應 429 並顯示剩餘等待時間。
- [ ] **秘密管理**：
  - [ ] `ADMIN_API_KEY`、`TURNSTILE_SECRET`、`DISCORD_WEBHOOK_URL` 未出現在程式碼庫。
  - [ ] `.env` 檔案已加入 `.gitignore`。
- [ ] **HTTP 安全標頭**：
  - [ ] 已設定 HSTS、X-Content-Type-Options、X-Frame-Options、CSP。
- [ ] **惡意網域防護**：
  - [ ] 靜態黑名單檢查功能正常。
  - [ ] Safe Browsing API 整合（若啟用）正常運作。
- [ ] **日誌與稽核**：
  - [ ] 關鍵事件有記錄（建立、存取、失敗、攻擊）。
  - [ ] 敏感資訊（API Key）於日誌中已脫敏。

### 9.3 滲透測試項目
建議於上線前執行以下測試：
| 測試項目 | 預期結果 |
|----------|----------|
| SQL/NoSQL 注入 | 無（KV 為 Key-Value，無 SQL） |
| XSS（反射型/儲存型） | 已阻擋，無彈窗 |
| CSRF | 有 Token 保護 |
| SSRF | 內網 IP 被拒絕 |
| 目錄遍歷 | 404 或 400 |
| API Key 暴力破解 | 5 次後鎖定 |
| Rate Limiting 繞過 | 無法繞過 |
| Open Redirect | 僅允許 KV 中的 URL |
| Header Injection | `\r\n` 被過濾 |


## 10. 管理員介面（Admin UI）
- 路由：`/admin`
- 權限：需於頁面提交 `ADMIN_API_KEY`（或以 Header `Authorization: Bearer <key>`），成功後顯示 KV 映射列表。
- 功能：
	- 列出 `link:*` keys（支援分頁：`limit`, `cursor`）。
	- 顯示短碼 ID、目標 URL、建立時間（若有紀錄）。
	- 搜尋：依短碼 ID 或目標 URL 關鍵字篩選。
	- 刪除：選取單筆或多筆短碼後刪除（需二次確認）。
	- 導出：將目前列表匯出為 CSV 或 JSON 格式下載。
- 錯誤：未授權顯示登入表單；授權失敗回 401。

## 11. 分析儀表板（Analytics Dashboard）
- 路由：`/admin/analytics`（或內嵌於 `/admin` 頁籤）
- 權限：同管理員介面，需驗證 `ADMIN_API_KEY`。
- 功能：
	- 點擊趨勢圖表：顯示最近 7 天 / 30 天的總點擊數折線圖。
	- 單一短碼分析：輸入短碼 ID，查看該短碼的點擊次數、最近存取時間。
	- 來源國家統計：依 `cf-ipcountry` 分組統計，顯示前 N 名國家/地區及佔比。
	- 熱門短碼排行：依點擊數排序，顯示前 10 名短碼。
- 資料來源：讀取 KV `stats:{id}` 統計資料；建議定期彙整或使用 Cloudflare Workers Analytics Engine。
