/**
 * 濫用通報（檢舉）模組
 *
 * key 設計：`report:<13位時間戳>:<4碼亂數>`，value 為完整通報內容，
 * metadata 鏡射 {id, category, status, createdAt} 讓列表/統計只需 list 不需逐筆 get。
 * 隱私考量：只記錄通報者國別（Cloudflare header），不儲存 IP。
 */

export const REPORT_PREFIX = 'report:';

export const REPORT_CATEGORIES = {
  phishing: '釣魚 / 詐騙',
  malware: '惡意軟體',
  copyright: '侵害著作權',
  inappropriate: '不當內容',
  privacy: '侵害個人資料',
  other: '其他',
};

export const REPORT_CATEGORIES_EN = {
  phishing: 'Phishing / Scam',
  malware: 'Malware',
  copyright: 'Copyright infringement',
  inappropriate: 'Inappropriate content',
  privacy: 'Privacy violation',
  other: 'Other',
};

export const REPORT_STATUS = {
  pending: '待處理',
  disabled: '已下架',
  dismissed: '不成立',
};

export function isValidCategory(category) {
  return Object.prototype.hasOwnProperty.call(REPORT_CATEGORIES, category);
}

/**
 * 建立通報
 */
export async function createReport(kv, { id, category, detail, country }) {
  const reportKey = `${REPORT_PREFIX}${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();
  const record = {
    id,
    category,
    detail: (detail || '').slice(0, 500),
    country: country || 'Unknown',
    createdAt,
    status: 'pending',
    resolvedAt: null,
  };
  await kv.put(reportKey, JSON.stringify(record), {
    metadata: { id, category, status: 'pending', createdAt },
  });
  return { key: reportKey, record };
}

/**
 * 列出通報（metadata-only，最新在前；通報量遠低於連結量，單頁 list 即可涵蓋）
 */
export async function listReports(kv, { limit = 1000 } = {}) {
  const res = await kv.list({ prefix: REPORT_PREFIX, limit });
  const reports = res.keys.map(key => ({
    key: key.name,
    ...(key.metadata || {}),
  }));
  reports.sort((a, b) => (b.createdAt || b.key).localeCompare(a.createdAt || a.key));
  return { reports, complete: res.list_complete };
}

/**
 * 通報統計（供透明度頁與後台使用）
 */
export async function getReportAggregate(kv) {
  const { reports } = await listReports(kv);
  const byCategory = {};
  const byStatus = { pending: 0, disabled: 0, dismissed: 0 };
  for (const r of reports) {
    if (r.category) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    if (r.status && byStatus[r.status] !== undefined) byStatus[r.status]++;
  }
  return { total: reports.length, byCategory, byStatus };
}

/**
 * 更新通報狀態（同步 value 與 metadata 鏡射）
 */
export async function updateReportStatus(kv, reportKey, status) {
  if (!REPORT_STATUS[status]) throw new Error('INVALID_STATUS');
  const record = await kv.get(reportKey, { type: 'json' });
  if (!record) return null;
  record.status = status;
  record.resolvedAt = status === 'pending' ? null : new Date().toISOString();
  await kv.put(reportKey, JSON.stringify(record), {
    metadata: { id: record.id, category: record.category, status, createdAt: record.createdAt },
  });
  return record;
}
