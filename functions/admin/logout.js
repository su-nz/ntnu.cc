/**
 * 管理員登出
 * 路由：GET /admin/logout
 */

export async function onRequest(context) {
  const { request, env } = context;
  
  // 獲取 session key 並從 KV 中刪除（可選，因為有 TTL 會自動過期）
  const cookie = request.headers.get('Cookie') || '';
  const sessionMatch = cookie.match(/admin_session=([^;]+)/);
  
  if (sessionMatch) {
    const sessionKey = sessionMatch[1];
    // 刪除 KV 中的 session（可選）
    try {
      await env.LINKS_KV.delete(`session:${sessionKey}`);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }
  
  // 清除 cookie 並重導向到首頁
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': 'admin_session=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    },
  });
}
