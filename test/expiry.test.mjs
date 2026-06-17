/**
 * 短網址「有效期限」回歸測試
 *
 * 重現並驗證修復：
 *   舊 bug：每次點擊都會重寫 link:{id}（updateStats）卻不帶 expirationTtl，
 *           Cloudflare KV 會因此清掉原有 TTL → 連結被點過一次就永久有效。
 *
 * 本測試用忠實模擬 KV 語意的 MockKV（含「put 不帶過期 = 永久」這個關鍵行為），
 * 直接執行真正的 updateStats 與 functions/[id].js 轉址流程，斷言：
 *   - 點擊後 link/stats 的 TTL 仍被保留（不再變永久）
 *   - metadata 的 url/createdAt/createdBy/expiresAt 不會被洗掉
 *   - 永久連結、既有舊資料不受影響（不會被改動或誤刪）
 *   - 已過期連結一律 404，且不會被「重寫」而復活
 *   - 轉址快取時間不超過剩餘有效時間
 *
 * 執行：npm test   （或 node test/expiry.test.mjs）
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { isExpired, kvExpiration } from '../functions/lib/utils.js';
import { updateStats } from '../functions/lib/security.js';

// ---- 迷你斷言框架 ----
let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n# ${title}`);
}

// ---- 時間輔助 ----
const nowMs = () => Date.now();
const nowSec = () => Math.floor(Date.now() / 1000);
const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();

// ---- 忠實模擬 Cloudflare KV ----
// 關鍵語意：
//  - put 未帶 expiration / expirationTtl → 永久（這正是舊 bug 的根源）
//  - put 帶 expiration（絕對秒）或 expirationTtl（相對秒，最少 60）→ 設過期
//  - get / getWithMetadata 會在讀取時就讓已過期的 key 視為不存在
class MockKV {
  constructor() {
    this.store = new Map(); // key -> { value, metadata, expiration?(絕對秒) }
  }
  _alive(e) {
    if (!e) return false;
    if (e.expiration != null && Date.now() >= e.expiration * 1000) return false;
    return true;
  }
  async put(key, value, options = {}) {
    let expiration; // undefined = 永久
    if (options.expiration != null) {
      // 真實 KV 要求 expiration 在未來（且至少 +60s）。這裡擋「過去」以抓出
      // 「把已過期 key 重寫復活」這類錯誤。
      if (options.expiration <= nowSec()) {
        throw new Error(`KV.put: expiration 已是過去式（${key}）`);
      }
      expiration = options.expiration;
    } else if (options.expirationTtl != null) {
      if (options.expirationTtl < 60) {
        throw new Error(`KV.put: expirationTtl 小於 60（${key}）`);
      }
      expiration = nowSec() + options.expirationTtl;
    }
    this.store.set(key, {
      value: typeof value === 'string' ? value : String(value),
      metadata: options.metadata ?? null,
      expiration,
    });
  }
  async get(key, opts) {
    const e = this.store.get(key);
    if (!this._alive(e)) {
      this.store.delete(key);
      return null;
    }
    const type = typeof opts === 'string' ? opts : opts && opts.type;
    return type === 'json' ? JSON.parse(e.value) : e.value;
  }
  async getWithMetadata(key) {
    const e = this.store.get(key);
    if (!this._alive(e)) {
      this.store.delete(key);
      return { value: null, metadata: null };
    }
    return { value: e.value, metadata: e.metadata };
  }
  async delete(key) {
    this.store.delete(key);
  }
  // 測試輔助：取原始項目（略過過期判斷），用來檢查 TTL 是否被保留
  _raw(key) {
    return this.store.get(key);
  }
}

// ---- 模擬 Cache API（caches.default）----
function keyHref(req) {
  if (typeof req === 'string') return req;
  return req.url || req.href || req.toString();
}
class MockCache {
  constructor() {
    this.map = new Map(); // href -> { body, maxAge, storedAt }
  }
  async match(req) {
    const href = keyHref(req);
    const e = this.map.get(href);
    if (!e) return undefined;
    if (e.maxAge != null && Date.now() - e.storedAt >= e.maxAge * 1000) {
      this.map.delete(href);
      return undefined;
    }
    return new Response(e.body, { headers: { 'Content-Type': 'application/json' } });
  }
  async put(req, resp) {
    const href = keyHref(req);
    const cc = resp.headers.get('Cache-Control') || '';
    const m = cc.match(/max-age=(\d+)/);
    const maxAge = m ? parseInt(m[1], 10) : null;
    const body = await resp.text();
    this.map.set(href, { body, maxAge, storedAt: Date.now() });
  }
  async delete(req) {
    return this.map.delete(keyHref(req));
  }
  _entry(href) {
    return this.map.get(href);
  }
}

// 設定 caches 全域（[id].js 用 caches.default），需在 import 之前
const mockCache = new MockCache();
globalThis.caches = { default: mockCache };

// 動態 import 轉址處理（檔名含中括號，用 file URL 才能正確解析）
const idModuleUrl = pathToFileURL(
  path.resolve('functions/[id].js')
).href;
const { onRequest } = await import(idModuleUrl);

// 建立一個轉址用的 context
function makeCtx(kv, id) {
  const waited = [];
  const ctx = {
    request: new Request(`https://ntnu.cc/${id}`, {
      method: 'GET',
      headers: { 'CF-Connecting-IP': '140.122.1.1', 'CF-IPCountry': 'TW' },
    }),
    env: { LINKS_KV: kv, DEV_MODE: 'true' },
    params: { id },
    next: async () => new Response('next'),
    waitUntil: (p) => waited.push(p),
  };
  return { ctx, waited };
}
async function runRedirect(kv, id) {
  const { ctx, waited } = makeCtx(kv, id);
  const resp = await onRequest(ctx);
  await Promise.allSettled(waited); // 確保 updateStats 等非同步工作完成
  return resp;
}

// ============================================================
//  1) 純函式：isExpired / kvExpiration
// ============================================================
section('純函式 isExpired / kvExpiration');

check('isExpired(null) → false（永久）', isExpired(null) === false);
check('isExpired(未來) → false', isExpired(iso(60000)) === false);
check('isExpired(過去) → true', isExpired(iso(-1000)) === true);
check('isExpired(亂字串) → false（不誤殺）', isExpired('not-a-date') === false);

check('kvExpiration(null).mode === permanent', kvExpiration(null).mode === 'permanent');
check('kvExpiration(過去).mode === expired', kvExpiration(iso(-1000)).mode === 'expired');
check(
  'kvExpiration(剩 <60s).mode === expired',
  kvExpiration(iso(30 * 1000)).mode === 'expired'
);
{
  const r = kvExpiration(iso(3600 * 1000));
  check('kvExpiration(剩 1h).mode === active', r.mode === 'active');
  check(
    'kvExpiration(剩 1h).expiration ≈ now+3600s',
    typeof r.expiration === 'number' &&
      Math.abs(r.expiration - (nowSec() + 3600)) <= 2,
    `expiration=${r && r.expiration}`
  );
}

// ============================================================
//  2) updateStats：點擊後是否保留 TTL（核心修復）
// ============================================================
section('updateStats：點擊不再清掉 TTL');

// 用 public-create 的格式建立一個「1 小時後過期」的連結
async function seedTimedLink(kv, id, ttlSec = 3600) {
  const createdAt = new Date().toISOString();
  const expiresAt = iso(ttlSec * 1000);
  const meta = {
    url: 'https://example.com/page',
    createdAt,
    createdBy: '140.122.9.9',
    expiresAt,
  };
  await kv.put(`link:${id}`, meta.url, { expirationTtl: ttlSec, metadata: meta });
  await kv.put(
    `stats:${id}`,
    JSON.stringify({
      clicks: 0,
      createdAt,
      expiresAt,
      clicksByDate: {},
      clicksByCountry: {},
    }),
    { expirationTtl: ttlSec }
  );
  return { createdAt, expiresAt, meta };
}

{
  const kv = new MockKV();
  const { expiresAt } = await seedTimedLink(kv, 'timed', 3600);

  await updateStats(kv, 'timed', 'TW');

  const link = kv._raw('link:timed');
  const stats = kv._raw('stats:timed');

  check('點擊後 link 仍有 TTL（非永久）', link.expiration != null,
    `expiration=${link && link.expiration}`);
  check(
    'link TTL ≈ 原到期時間（沿用而非重設）',
    Math.abs(link.expiration - Math.floor(Date.parse(expiresAt) / 1000)) <= 2
  );
  check('點擊後 stats 仍有 TTL（非永久）', stats.expiration != null);
  check('link metadata.expiresAt 保留', link.metadata.expiresAt === expiresAt);
  check('link metadata.url 保留', link.metadata.url === 'https://example.com/page');
  check('link metadata.createdBy 保留', link.metadata.createdBy === '140.122.9.9');
  check('link metadata.stats.clicks === 1', link.metadata.stats.clicks === 1);
  check('stats.clicks === 1', JSON.parse(stats.value).clicks === 1);
}

{
  // 連點多次：每次都必須維持 TTL（模擬真實使用）
  const kv = new MockKV();
  await seedTimedLink(kv, 'multi', 3600);
  for (let i = 0; i < 5; i++) await updateStats(kv, 'multi', 'TW');
  const link = kv._raw('link:multi');
  check('連點 5 次後 link 仍有 TTL', link.expiration != null);
  check('連點 5 次後 clicks === 5', link.metadata.stats.clicks === 5);
}

// ---- 負向對照：證明 MockKV 確實能重現舊 bug（否則測試沒有意義）----
section('負向對照：舊寫法（重寫不帶 TTL）確實會弄丟 TTL');
{
  const kv = new MockKV();
  await seedTimedLink(kv, 'oldbug', 3600);
  check('前置：建立時有 TTL', kv._raw('link:oldbug').expiration != null);
  // 模擬「舊 updateStats」：重新 put 卻不帶任何過期設定
  const v = await kv.get('link:oldbug');
  await kv.put('link:oldbug', v, { metadata: { stats: { clicks: 1 } } });
  check(
    '舊寫法重寫後 TTL 被清掉（變永久）— 證明 bug 與測試皆為真',
    kv._raw('link:oldbug').expiration == null
  );
}

// ============================================================
//  3) updateStats：永久連結 / 既有舊資料 不被改動
// ============================================================
section('updateStats：永久連結與既有舊資料');

{
  // 永久連結（expiry=never）：點擊後仍永久
  const kv = new MockKV();
  const createdAt = new Date().toISOString();
  await kv.put(`link:never`, 'https://example.org', {
    metadata: { url: 'https://example.org', createdAt, createdBy: '1.1.1.1', expiresAt: null },
  });
  await kv.put(`stats:never`, JSON.stringify({ clicks: 0, createdAt, expiresAt: null }), {});

  await updateStats(kv, 'never', 'TW');

  const link = kv._raw('link:never');
  check('永久連結點擊後仍永久（無 TTL）', link.expiration == null);
  check('永久連結 clicks === 1', link.metadata.stats.clicks === 1);
  check('永久連結 metadata.url 保留', link.metadata.url === 'https://example.org');
}

{
  // 既有「舊 bug 殘留」連結：link metadata 只剩 {stats}、已無 expiresAt、已永久，
  // 但 stats JSON 還殘留一個「過去」的 expiresAt。
  // 期望：維持原樣（永久、可繼續計數），不被誤判而凍結或誤刪。
  const kv = new MockKV();
  const createdAt = new Date(Date.now() - 100 * 86400000).toISOString();
  await kv.put(`link:legacy`, 'https://old.example', {
    metadata: { stats: { clicks: 5, lastAccess: null, createdAt } },
  });
  await kv.put(
    `stats:legacy`,
    JSON.stringify({ clicks: 5, createdAt, expiresAt: iso(-50 * 86400000) }),
    {}
  );

  await updateStats(kv, 'legacy', 'TW');

  const link = kv._raw('link:legacy');
  check('舊永久連結維持永久（未被加上 TTL）', link.expiration == null);
  check('舊連結點擊數正常 +1（5 → 6，未凍結）', link.metadata.stats.clicks === 6);
  check('舊連結 value（轉址目標）未被改動', link.value === 'https://old.example');
}

// ============================================================
//  4) 轉址流程 [id].js：過期一律 404、且不復活
// ============================================================
section('轉址流程：有效 / 過期 / 永久');

{
  // 有效連結：200、會快取、點擊後 TTL 仍在（端對端證明 bug 修好）
  const kv = new MockKV();
  await seedTimedLink(kv, 'ok', 3600);
  const resp = await runRedirect(kv, 'ok');
  check('有效連結轉址回應 200', resp.status === 200);
  const link = kv._raw('link:ok');
  check('端對端：點擊後 link TTL 仍保留', link && link.expiration != null,
    link ? `expiration=${link.expiration}` : 'link 不存在');
  const cached = mockCache._entry('https://cache.ntnu.cc/link/ok');
  check('有效連結會寫入快取', !!cached);
  check('快取 max-age === 300（剩餘遠大於 5 分鐘）', cached && cached.maxAge === 300,
    cached ? `maxAge=${cached.maxAge}` : '');
}

{
  // 防呆：KV 尚未實際刪除（無 KV TTL），但 metadata.expiresAt 已過期 → 必須 404，
  // 且不可呼叫 updateStats 把它重寫復活。
  const kv = new MockKV();
  const createdAt = new Date(Date.now() - 7200 * 1000).toISOString();
  await kv.put(`link:expd`, 'https://example.com', {
    metadata: {
      url: 'https://example.com',
      createdAt,
      createdBy: '1.2.3.4',
      expiresAt: iso(-1000), // 已過期
    },
  });
  await kv.put(
    `stats:expd`,
    JSON.stringify({ clicks: 3, createdAt, expiresAt: iso(-1000) }),
    {}
  );

  const resp = await runRedirect(kv, 'expd');
  check('過期連結轉址回應 404', resp.status === 404);
  const stats = JSON.parse(kv._raw('stats:expd').value);
  check('過期連結未觸發統計更新（clicks 維持 3）', stats.clicks === 3,
    `clicks=${stats.clicks}`);
}

{
  // 防呆：過期資訊來自舊快取 → 必須 404，並清掉該快取項
  const kv = new MockKV();
  const href = 'https://cache.ntnu.cc/link/cch';
  // 直接塞一筆「已過期」的快取
  await mockCache.put(new URL(href), new Response(
    JSON.stringify({ targetUrl: 'https://example.com', disabled: false, expiresAt: iso(-1000) }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } }
  ));
  check('前置：快取項存在', !!mockCache._entry(href));

  const resp = await runRedirect(kv, 'cch');
  check('快取中的過期連結回應 404', resp.status === 404);
  check('過期快取項已被刪除', !mockCache._entry(href));
}

{
  // 永久連結轉址：200、快取 max-age 300
  const kv = new MockKV();
  const createdAt = new Date().toISOString();
  await kv.put(`link:perm`, 'https://example.net', {
    metadata: { url: 'https://example.net', createdAt, createdBy: '1.1.1.1', expiresAt: null },
  });
  await kv.put(`stats:perm`, JSON.stringify({ clicks: 0, createdAt, expiresAt: null }), {});
  const resp = await runRedirect(kv, 'perm');
  check('永久連結轉址回應 200', resp.status === 200);
  const link = kv._raw('link:perm');
  check('永久連結點擊後仍永久', link && link.expiration == null);
}

// ============================================================
//  5) 轉址快取時間不超過剩餘有效時間
// ============================================================
section('快取時間上限 = min(300, 剩餘秒數)');

{
  // 剩約 120 秒 → 快取 max-age 應被壓到 ~120（且 >0）
  const kv = new MockKV();
  const createdAt = new Date().toISOString();
  const expiresAt = iso(120 * 1000);
  await kv.put(`link:cap`, 'https://example.com', {
    expirationTtl: 120,
    metadata: { url: 'https://example.com', createdAt, createdBy: '1.1.1.1', expiresAt },
  });
  await kv.put(`stats:cap`, JSON.stringify({ clicks: 0, createdAt, expiresAt }), { expirationTtl: 120 });

  await runRedirect(kv, 'cap');
  const cached = mockCache._entry('https://cache.ntnu.cc/link/cap');
  check('剩 120s 的連結會快取', !!cached);
  check(
    '快取 max-age 介於 (0, 120]（不超過剩餘）',
    cached && cached.maxAge > 0 && cached.maxAge <= 120,
    cached ? `maxAge=${cached.maxAge}` : ''
  );
}

// ---- 結果 ----
console.log(`\n========================================`);
console.log(`通過 ${passed}　失敗 ${failed}`);
if (failed > 0) {
  console.log(`\n失敗項目：`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log(`全部通過 ✅`);
}
