// 방문·활동 통계 (자체 수집, 외부 서비스 없음)
// 저장: DATABASE_URL 있으면 Postgres ff_stats, 없으면 data/stats.json
// 조회: GET /stats?key=<STATS_KEY 환경변수>
const fs = require('fs');
const path = require('path');

let pool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    pool.query('CREATE TABLE IF NOT EXISTS ff_stats (day TEXT PRIMARY KEY, data JSONB)').catch(() => {});
  } catch (_) {}
}
const FILE = path.join(__dirname, 'data', 'stats.json');

const KST = 9 * 3600 * 1000;
const dayStr = () => new Date(Date.now() + KST).toISOString().slice(0, 10);

let days = {};                       // { '2026-07-08': { pv, uv, signups, games, multi, botmatch, tutorial, peak } }
let uniques = new Set();             // 오늘의 유니크 방문자 (IP 기준, 메모리)
let curDay = dayStr();
let dirty = false;

// 부팅 시 복원
(async () => {
  try {
    if (pool) {
      const { rows } = await pool.query('SELECT day, data FROM ff_stats');
      for (const r of rows) days[r.day] = r.data;
    } else if (fs.existsSync(FILE)) {
      days = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    }
  } catch (_) {}
})();

function today() {
  const d = dayStr();
  if (d !== curDay) { curDay = d; uniques = new Set(); }   // 자정(KST) 넘으면 유니크 리셋
  if (!days[d]) days[d] = { pv: 0, uv: 0, signups: 0, games: 0, multi: 0, botmatch: 0, tutorial: 0, peak: 0 };
  return days[d];
}
function save() {
  if (!dirty) return;
  dirty = false;
  const d = curDay, doc = days[d];
  if (!doc) return;
  if (pool) pool.query('INSERT INTO ff_stats(day, data) VALUES($1, $2) ON CONFLICT(day) DO UPDATE SET data = excluded.data', [d, doc]).catch(() => {});
  else { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(days)); } catch (_) {} }
}
setInterval(save, 30000);            // 30초마다 변경분 저장
process.on('SIGTERM', save);

module.exports = {
  pageview(ip) {
    const t = today(); t.pv++;
    if (ip && !uniques.has(ip)) { uniques.add(ip); t.uv++; }
    dirty = true;
  },
  bump(field, n = 1) { const t = today(); t[field] = (t[field] || 0) + n; dirty = true; },
  peak(n) { const t = today(); if (n > t.peak) { t.peak = n; dirty = true; } },
  // 최근 N일 요약 (내림차순)
  report(daysBack = 30) {
    const keys = Object.keys(days).sort().slice(-daysBack).reverse();
    return keys.map(d => ({ day: d, ...days[d] }));
  },
};
