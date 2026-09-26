/**
 * 公開統計 API
 * 不需要認證，回傳基本統計數據供首頁展示。
 *
 * 效能：改為讀取聚合快照（agg:snapshot:v1），一般情況只需 1 次 KV 讀取；
 * 快照過期時回傳舊資料並在背景重算（stale-while-revalidate），
 * 不再於每次請求 list 全部 key 逐一 get（舊實作為 O(N)，資料量大會撞子請求上限）。
 */

import { getAggregate } from '../lib/aggregate.js';

export async function onRequestGet(context) {
  const { env } = context;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60' // 邊緣快取 1 分鐘
  };

  // 格式化數字
  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  try {
    const agg = await getAggregate(env.LINKS_KV, context.waitUntil.bind(context));

    return new Response(JSON.stringify({
      success: true,
      data: {
        totalLinks: agg.totalLinks,
        totalClicks: agg.totalClicks,
        todayCreated: agg.todayCreated,
        todayClicks: agg.todayClicks,
        activeLinks: agg.activeLinks,
        securityBlocks: 0, // 已不再統計暫時性 ratelimit key 數（無實質意義且成本高）
        formatted: {
          totalLinks: formatNumber(agg.totalLinks),
          totalClicks: formatNumber(agg.totalClicks),
          todayCreated: formatNumber(agg.todayCreated),
          todayClicks: formatNumber(agg.todayClicks),
          activeLinks: formatNumber(agg.activeLinks),
          securityBlocks: '0'
        },
        top5: (agg.top10 || []).slice(0, 5).map(l => ({ id: l.id, clicks: formatNumber(l.clicks) })),
        updatedAt: agg.generatedAt
      }
    }), { status: 200, headers });

  } catch (error) {
    console.error('Public stats error:', error);

    // 發生錯誤時回傳預設值
    return new Response(JSON.stringify({
      success: true,
      data: {
        totalLinks: 0,
        totalClicks: 0,
        todayCreated: 0,
        todayClicks: 0,
        activeLinks: 0,
        securityBlocks: 0,
        formatted: {
          totalLinks: '0',
          totalClicks: '0',
          todayCreated: '0',
          todayClicks: '0',
          activeLinks: '0',
          securityBlocks: '0'
        },
        top5: [],
        updatedAt: new Date().toISOString()
      }
    }), { status: 200, headers });
  }
}
