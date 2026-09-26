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
  // 同時清除新舊兩種 Path 的 cookie（Path 曾由 /admin 改為 /，避免舊 cookie 殘留）
  const headers = new Headers({ 'Location': '/' });
  headers.append('Set-Cookie', 'admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  headers.append('Set-Cookie', 'admin_session=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  return new Response(null, { status: 302, headers });
}
