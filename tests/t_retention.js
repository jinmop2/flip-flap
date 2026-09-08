// 리텐션 — 가입 후 며칠째에 다시 왔는지가 제대로 세어지는가.
// 여기서 값이 틀리면 무엇을 고칠지를 틀린 숫자로 정하게 된다.
const path = require('path');
const src = path.join(__dirname, '..');
process.env.FF_DATA_FILE = path.join(require('os').tmpdir(), 'ff_rt_' + Date.now() + '.json');
const A = require(src + '/accounts.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
};
const DAY = 86400000;

console.log('① 칸을 켜는 규칙');
{
  const u = { createdAt: Date.now() };
  ok('가입 당일은 0번 칸', A.markRetention(u) && u.rt[0] === '1', u.rt);
  ok('같은 날 두 번째는 안 켠다', A.markRetention(u) === false);
  ok('7일 뒤는 7번 칸', A.markRetention(u, Date.now() + 7 * DAY) && u.rt[7] === '1', u.rt);
  ok('그 사이 날들은 꺼져 있다', u.rt.slice(1, 7) === '000000', u.rt);
  ok('31일 뒤는 안 적는다', A.markRetention(u, Date.now() + 31 * DAY) === false);
  ok('길이는 31칸', u.rt.length === 31, String(u.rt.length));

  const noDate = {};
  ok('가입일이 없으면 건드리지 않는다', A.markRetention(noDate) === false && !noDate.rt);
}

console.log('\n② 분모 — 아직 그 날짜가 안 온 사람은 안 센다');
{
  // 오늘 가입한 사람은 D1 의 답을 알 수 없다. 분모에 넣으면 리텐션이 0 으로 깎인다.
  const r = A.retentionStats();
  ok('모양이 갖춰져 있다', r && r.d && r.d.d1 && r.d.d7 && r.d.d30, JSON.stringify(r));
  ok('측정 시작일이 있다', /^\d{4}-\d{2}-\d{2}$/.test(r.since || ''), r.since);
  ok('아무도 없으면 비율은 null', r.d.d30.of === 0 ? r.d.d30.pct === null : true);
}

console.log('\n③ 대략치 — 예전 가입자도 셀 수 있는가');
{
  const r = A.retentionRough();
  ok('모양이 갖춰져 있다', r && r.d && typeof r.of === 'number', JSON.stringify(r));
}

console.log('\n④ 운영 화면이 받아 가는가');
{
  const o = A.adminOverview();
  ok('요약에 리텐션이 실린다', !!o.retention && !!o.retentionRough);
  ok('D1·D7·D30 셋 다', !!(o.retention.d.d1 && o.retention.d.d7 && o.retention.d.d30));
}

console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
