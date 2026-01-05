/**
 * 公開統計 API
 * 不需要認證，回傳基本統計數據供首頁展示
 */

export async function onRequestGet(context) {
  const { env } = context;
  
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60' // 快取 1 分鐘
  };
  
  try {
    // 取得所有短網址
    const linksList = await env.LINKS_KV.list({ prefix: 'link:' });
    const totalLinks = linksList.keys.length;
    
    // 計算總點擊數和今日數據
    let totalClicks = 0;
    let todayClicks = 0;
    let todayCreated = 0;
    let activeLinks = 0;
    
    const today = new Date().toISOString().split('T')[0];
    const topLinks = [];
    
    for (const key of linksList.keys) {
      const id = key.name.replace('link:', '');
      
      // 檢查是否停用
      const disabled = await env.LINKS_KV.get(`disabled:${id}`);
      if (!disabled) {
        activeLinks++;
      }
      
      // 取得統計數據
      const statsData = await env.LINKS_KV.get(`stats:${id}`, { type: 'json' });
      if (statsData) {
        const linkClicks = statsData.clicks || 0;
        totalClicks += linkClicks;
        
        // 計算今日點擊
        if (statsData.clicksByDate && statsData.clicksByDate[today]) {
          todayClicks += statsData.clicksByDate[today];
        }
        
        // 收集熱門連結資訊
        if (linkClicks > 0) {
          topLinks.push({ id, clicks: linkClicks });
        }
      }
      
      // 檢查今日建立（透過 metadata）
      if (key.metadata && key.metadata.createdAt) {
        const createdDate = key.metadata.createdAt.split('T')[0];
        if (createdDate === today) {
          todayCreated++;
        }
      }
    }
    
    // 取得安全攔截數（速率限制計數）
    const rateLimitList = await env.LINKS_KV.list({ prefix: 'ratelimit:' });
    const securityBlocks = rateLimitList.keys.length;
    
    // 排序取得前 5 名熱門
    topLinks.sort((a, b) => b.clicks - a.clicks);
    const top5 = topLinks.slice(0, 5);
    
    // 格式化數字
    const formatNumber = (num) => {
      if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
      } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
      }
      return num.toString();
    };
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        totalLinks,
        totalClicks,
        todayCreated,
        todayClicks,
        activeLinks,
        securityBlocks,
        formatted: {
          totalLinks: formatNumber(totalLinks),
          totalClicks: formatNumber(totalClicks),
          todayCreated: formatNumber(todayCreated),
          todayClicks: formatNumber(todayClicks),
          activeLinks: formatNumber(activeLinks),
          securityBlocks: formatNumber(securityBlocks)
        },
        top5: top5.map(l => ({ id: l.id, clicks: formatNumber(l.clicks) })),
        updatedAt: new Date().toISOString()
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
