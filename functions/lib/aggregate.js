/**
 * 統計聚合模組
 *
 * 背景：原本 public-stats / admin analytics 每次請求都 list 全部 link:/stats: key
 * 再逐一 get，成本 O(N)，資料量成長後會撞上 Workers 子請求上限且回應極慢。
 *
 * 設計（讀取 O(1)，寫入每次點擊多 2 個子請求）：
 *  - 每日聚合 key `agg:day:<YYYY-MM-DD>`：點擊/建立時累加 {clicks, created, byCountry}。
 *    與既有 per-link stats 相同的 read-modify-write 模式，極端併發下可能少計，
 *    但總點擊數以 link metadata 的鏡射值為準，不受影響。
 *  - 快照 key `agg:snapshot:v1`：彙總後的完整儀表板資料。10 分鐘內直接回傳；
 *    過期後回傳舊快照並在背景（waitUntil）重算（stale-while-revalidate），
 *    使用 lock key 防止重算風暴。
 *  - 重算成本：list link:（每 1000 筆 1 個子請求，讀 metadata 即可，不需逐筆 get）
 *    + 最近 60 天的 agg:day: get，與連結總數幾乎無關。
 *  - 歷史基線 `agg:baseline:v1`：由管理員手動觸發的一次性全掃描（可分批續跑），
 *    補齊部署此功能前的國家/日期分布，並回填 link metadata 的點擊鏡射。
 *
 * 所有新 key 皆使用 agg: 前綴，不與既有資料（link:/stats:/ratelimit:...）衝突。
 */

import { kvExpiration } from './utils.js';

export const SNAPSHOT_KEY = 'agg:snapshot:v1';
export const BASELINE_KEY = 'agg:baseline:v1';
const BASELINE_BUILDING_KEY = 'agg:baseline:building';
const LOCK_KEY = 'agg:lock';
const DAY_PREFIX = 'agg:day:';

const SNAPSHOT_FRESH_MS = 10 * 60 * 1000;      // 快照 10 分鐘內視為新鮮
const DAY_RETENTION_TTL = 60 * 60 * 24 * 400;  // 每日聚合保留約 400 天
const TREND_DAYS = 60;                          // 快照內保留的每日趨勢天數
const LINK_LIST_MAX_PAGES = 20;                 // 最多掃 20,000 筆連結 metadata

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * 累加每日聚合（點擊或建立時呼叫；失敗僅記 log，不影響主流程）
 * @param {Object} kv
 * @param {{ clicks?: number, created?: number, country?: string|null }} delta
 */
export async function bumpDailyAggregate(kv, { clicks = 0, created = 0, country = null } = {}) {
  const key = DAY_PREFIX + todayStr();
  try {
    const data = await kv.get(key, { type: 'json' }) || { clicks: 0, created: 0, byCountry: {} };
    data.clicks += clicks;
    data.created += created;
    if (country && clicks > 0) {
      if (!data.byCountry) data.byCountry = {};
      data.byCountry[country] = (data.byCountry[country] || 0) + clicks;
    }
    await kv.put(key, JSON.stringify(data), { expirationTtl: DAY_RETENTION_TTL });
  } catch (error) {
    console.error('bumpDailyAggregate error:', error);
  }
}

/**
 * 取得聚合快照（一般讀取入口）。
 * 新鮮 → 直接回傳；過期 → 回傳舊資料並背景重算；不存在 → 當場計算。
 * @param {Object} kv
 * @param {Function} [waitUntil] - context.waitUntil，用於背景重算
 * @returns {Promise<Object>}
 */
export async function getAggregate(kv, waitUntil) {
  try {
    const snap = await kv.get(SNAPSHOT_KEY, { type: 'json' });
    if (snap) {
      const age = Date.now() - Date.parse(snap.generatedAt || 0);
      if (age < SNAPSHOT_FRESH_MS) return snap;
      if (waitUntil) {
        waitUntil(refreshSnapshot(kv));
        return snap;
      }
    }
    return await refreshSnapshot(kv) || snap || emptySnapshot();
  } catch (error) {
    console.error('getAggregate error:', error);
    return emptySnapshot();
  }
}

/**
 * 重算快照（帶 lock 防止併發重算）。回傳新快照，被 lock 擋下時回傳 null。
 */
export async function refreshSnapshot(kv) {
  try {
    const lock = await kv.get(LOCK_KEY);
    if (lock) return null;
    // KV expirationTtl 最小 60 秒；重算通常 1-2 秒內完成，短暫重複重算無害
    await kv.put(LOCK_KEY, '1', { expirationTtl: 60 });
  } catch {
    // lock 失敗照樣重算，最多重複計算一次
  }

  const snapshot = await computeSnapshot(kv);
  try {
    await kv.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
    await kv.delete(LOCK_KEY);
  } catch (error) {
    console.error('refreshSnapshot put error:', error);
  }
  return snapshot;
}

function emptySnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    totalLinks: 0, activeLinks: 0, totalClicks: 0,
    todayClicks: 0, todayCreated: 0,
    top10: [], daily: [], byCountry: {},
    baselineAt: null, partial: true,
  };
}

/**
 * 實際彙總計算。
 * 成本：ceil(N/1000) 次 list + ~TREND_DAYS 次 get，與 N 無逐筆 get 關係。
 */
export async function computeSnapshot(kv) {
  const now = Date.now();
  const today = todayStr();

  // --- 1. 連結總覽：只掃 list metadata，不逐筆 get ---
  let totalLinks = 0;
  let activeLinks = 0;
  let totalClicks = 0;
  let todayCreated = 0;
  const top = [];
  let cursor;
  let pages = 0;
  let listComplete = true;

  do {
    const res = await kv.list({ prefix: 'link:', limit: 1000, cursor });
    for (const key of res.keys) {
      totalLinks++;
      const md = key.metadata || {};
      const clicks = (md.stats && md.stats.clicks) || 0;
      totalClicks += clicks;

      const expired = md.expiresAt && Date.parse(md.expiresAt) <= now;
      if (!md.disabled && !expired) activeLinks++;

      if (md.createdAt && String(md.createdAt).startsWith(today)) todayCreated++;

      if (clicks > 0) top.push({ id: key.name.slice(5), clicks });
    }
    cursor = res.list_complete ? null : res.cursor;
    pages++;
    if (pages >= LINK_LIST_MAX_PAGES && cursor) {
      listComplete = false;
      cursor = null;
    }
  } while (cursor);

  top.sort((a, b) => b.clicks - a.clicks);
  const top10 = top.slice(0, 10);

  // --- 2. 每日趨勢 + 國家分布：讀 agg:day: 與歷史基線 ---
  const baseline = await kv.get(BASELINE_KEY, { type: 'json' });
  const baselineDate = baseline ? String(baseline.generatedAt).split('T')[0] : null;

  const dayKeys = [];
  for (let i = 0; i < TREND_DAYS; i++) {
    const d = new Date(now - i * 86400000).toISOString().split('T')[0];
    dayKeys.push(d);
  }
  dayKeys.reverse(); // 由舊到新

  const dayValues = await Promise.all(
    dayKeys.map(d => kv.get(DAY_PREFIX + d, { type: 'json' }).catch(() => null))
  );

  const byCountry = {};
  if (baseline && baseline.byCountry) {
    for (const [c, n] of Object.entries(baseline.byCountry)) {
      byCountry[c] = (byCountry[c] || 0) + n;
    }
  }

  const daily = [];
  let todayClicks = 0;
  for (let i = 0; i < dayKeys.length; i++) {
    const date = dayKeys[i];
    const dayData = dayValues[i] || { clicks: 0, created: 0, byCountry: {} };
    // 與基線重疊期以「取較大值」合併，避免同一天被重複計算
    const baselineClicks = (baseline && baseline.clicksByDate && baseline.clicksByDate[date]) || 0;
    const clicks = Math.max(dayData.clicks || 0, baselineClicks);
    daily.push({ date, clicks, created: dayData.created || 0 });
    if (date === today) todayClicks = clicks;

    // 國家分布：基線已涵蓋其建立日（含）之前的所有點擊，只累加基線之後的每日資料
    if (!baselineDate || date > baselineDate) {
      for (const [c, n] of Object.entries(dayData.byCountry || {})) {
        byCountry[c] = (byCountry[c] || 0) + n;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalLinks,
    activeLinks,
    totalClicks,
    todayClicks,
    todayCreated,
    top10,
    daily,
    byCountry,
    baselineAt: baseline ? baseline.generatedAt : null,
    listComplete,
  };
}

/**
 * 建立/續跑歷史基線（管理員手動觸發，可分批呼叫直到 done=true）。
 *
 * 每批處理最多 batchSize 個 stats: key：
 *  - 累計全時段 byCountry 與最近 clicksByDate
 *  - 回填 link metadata 的 stats 鏡射（僅在缺漏或落後時寫入，
 *    寫入模式與 updateStats 完全一致：保留原值/其餘 metadata/到期時間）
 *
 * @returns {Promise<{ done: boolean, processed: number, totalProcessed: number }>}
 */
export async function rebuildBaseline(kv, { batchSize = 100 } = {}) {
  const building = await kv.get(BASELINE_BUILDING_KEY, { type: 'json' }) || {
    cursor: null,
    byCountry: {},
    clicksByDate: {},
    totalClicks: 0,
    processed: 0,
    startedAt: new Date().toISOString(),
  };

  const res = await kv.list({ prefix: 'stats:', limit: Math.min(batchSize, 1000), cursor: building.cursor || undefined });

  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString().split('T')[0];

  for (const key of res.keys) {
    const id = key.name.slice(6);
    let stats;
    try {
      stats = await kv.get(key.name, { type: 'json' });
    } catch {
      continue;
    }
    if (!stats) continue;

    const clicks = stats.clicks || 0;
    building.totalClicks += clicks;
    building.processed++;

    const countrySource = stats.clicksByCountry || stats.countries || {};
    for (const [c, n] of Object.entries(countrySource)) {
      building.byCountry[c] = (building.byCountry[c] || 0) + n;
    }
    for (const [date, n] of Object.entries(stats.clicksByDate || {})) {
      if (date >= cutoff) {
        building.clicksByDate[date] = (building.clicksByDate[date] || 0) + n;
      }
    }

    // 回填 metadata 鏡射，讓快照的 totalClicks 從 list metadata 即可精準取得
    if (clicks > 0) {
      try {
        const { value, metadata } = await kv.getWithMetadata(`link:${id}`);
        if (value !== null) {
          const mirrored = (metadata && metadata.stats && metadata.stats.clicks) || 0;
          if (mirrored < clicks) {
            const linkExpiry = kvExpiration(metadata && metadata.expiresAt);
            if (linkExpiry.mode !== 'expired') {
              const newMeta = {
                ...(metadata || {}),
                stats: {
                  clicks,
                  lastAccess: stats.lastAccess || (metadata && metadata.stats && metadata.stats.lastAccess) || null,
                  createdAt:
                    (metadata && metadata.stats && metadata.stats.createdAt) ||
                    (metadata && metadata.createdAt) ||
                    stats.createdAt,
                },
              };
              await kv.put(
                `link:${id}`,
                value,
                linkExpiry.mode === 'active'
                  ? { metadata: newMeta, expiration: linkExpiry.expiration }
                  : { metadata: newMeta }
              );
            }
          }
        }
      } catch (error) {
        console.error(`Baseline mirror backfill error (${id}):`, error);
      }
    }
  }

  if (res.list_complete) {
    // 完成：寫入正式基線並清掉進度、讓快照立即重算
    const baseline = {
      generatedAt: new Date().toISOString(),
      startedAt: building.startedAt,
      totalClicks: building.totalClicks,
      byCountry: building.byCountry,
      clicksByDate: building.clicksByDate,
      processed: building.processed,
    };
    await kv.put(BASELINE_KEY, JSON.stringify(baseline));
    await kv.delete(BASELINE_BUILDING_KEY);
    await kv.delete(SNAPSHOT_KEY);
    return { done: true, processed: res.keys.length, totalProcessed: building.processed };
  }

  building.cursor = res.cursor;
  // 進度保留 1 小時，中斷過久就重來，避免殘留半套資料
  await kv.put(BASELINE_BUILDING_KEY, JSON.stringify(building), { expirationTtl: 3600 });
  return { done: false, processed: res.keys.length, totalProcessed: building.processed };
}
