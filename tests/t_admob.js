// 보상형 광고 — 구글이 서명한 확인이 온 표만 지급하는가.
// 여기가 뚫리면 누구나 주소 한 번으로 코인을 받아 간다.
const path = require('path');
const crypto = require('crypto');
const src = path.join(__dirname, '..');
const ssv = require(src + '/admob-ssv.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); }
};

// 구글 대신 우리가 열쇠 한 벌을 만들어 서명해 본다 — 서명 확인 자체가 도는지를 본다
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const der = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
const sign = (q) => b64url(crypto.sign('sha256', Buffer.from(q, 'utf8'), privateKey));

(async () => {
  console.log('① 서명 확인');
  {
    // 열쇠 받아오는 곳을 우리 것으로 바꿔 끼운다 (그물을 안 탄다)
    const g = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({ keys: [{ keyId: 7, base64: der }] }) });

    const body = 'ad_network=5450213213286189855&ad_unit=123&reward_amount=1&reward_item=coin'
               + '&timestamp=1700000000000&transaction_id=abc&user_id=TICKET1';
    const good = body + '&signature=' + sign(body) + '&key_id=7';

    const a = await ssv.verify(good);
    ok('바른 서명은 통과', a.ok === true, JSON.stringify(a));
    ok('표(user_id)를 꺼낸다', a.ticket === 'TICKET1', a.ticket);
    ok('거래 번호도 꺼낸다', a.txn === 'abc', a.txn);

    // 한 글자만 바꿔도 안 되어야 한다 — 이게 안 걸리면 확인이 무의미하다
    const tampered = body.replace('reward_amount=1', 'reward_amount=9') + '&signature=' + sign(body) + '&key_id=7';
    const b = await ssv.verify(tampered);
    ok('값을 고치면 막힌다', b.ok === false, JSON.stringify(b));

    const noSig = await ssv.verify(body);
    ok('서명이 없으면 막힌다', noSig.ok === false, JSON.stringify(noSig));

    const badKey = await ssv.verify(body + '&signature=' + sign(body) + '&key_id=999');
    ok('모르는 열쇠는 막힌다', badKey.ok === false, JSON.stringify(badKey));

    global.fetch = g;
  }

  console.log('\n② 확인이 온 표만 지급한다');
  {
    process.env.FF_DATA_FILE = path.join(require('os').tmpdir(), 'ff_ad_' + Date.now() + '.json');
    process.env.AD_MODE = 'ad';
    delete require.cache[require.resolve(src + '/accounts.js')];
    const A = require(src + '/accounts.js');
    const cfg = A.adConfig();
    ok('광고 모드가 켜진다', cfg.ad === true, JSON.stringify(cfg));
    ok('서버 검증이 기본으로 켜진다', cfg.ssv === true, JSON.stringify(cfg));
    ok('광고 모드 값이 다르다', cfg.perDay === 5 && cfg.coins === 50 && cfg.minSec === 15, JSON.stringify(cfg));
    ok('모르는 표에는 도장을 안 찍는다', A.bonusVerify('없는표').known === false);
  }

  console.log('\n③ 서버가 원문 질의를 쓰는가');
  {
    const s = require('fs').readFileSync(src + '/server.js', 'utf8');
    // express 가 갈라 놓은 req.query 를 다시 조립하면 서명이 안 맞는다
    ok('originalUrl 에서 잘라 쓴다', /req\.originalUrl\.slice\(req\.originalUrl\.indexOf\('\?'\) \+ 1\)/.test(s));
    ok('확인 실패는 400', /admobSsv\.verify[\s\S]{0,220}sendStatus\(400\)/.test(s));
    ok('오류는 500 으로 재시도를 부른다', /sendStatus\(500\)/.test(s));
  }

  console.log('\n④ 화면이 표를 광고에 넘기는가');
  {
    const c = require('fs').readFileSync(src + '/public/client.js', 'utf8');
    const n = require('fs').readFileSync(src + '/public/native.js', 'utf8');
    ok('광고에 표를 넘긴다', /FF\.ad\.reward\(st\.ticket\)/.test(c));
    ok('끝까지 안 보면 안 받는다', /how !== 'done'[\s\S]{0,80}광고를 끝까지 봐야/.test(c));
    // 광고가 없었던 것과 중간에 닫은 것은 다른 일이다 — 같은 말로 뭉뚱그리면
    // 물량이 없을 때도 이용자 탓으로 들린다
    ok('광고가 없을 때는 다르게 말한다', /how === 'empty'[\s\S]{0,120}볼 수 있는 광고가 없어요/.test(c));
    ok('못 불러온 것과 닫은 것을 가른다',
       /return 'empty';\s*\/\/ 채울 광고가 없었다/.test(n) && /\? 'done' : 'quit'/.test(n));
    ok('확인이 늦으면 몇 번 더 묻는다', /got\.pending && i < 6/.test(c));
    ok('웹에서는 광고가 없다', /ready: function \(\) \{ return native && !!AdMob; \}/.test(n));
    ok('ssv 로 표를 실어 보낸다', /ssv: ticket \? \{ userId: String\(ticket\) \}/.test(n));
  }

  console.log('\n⑤ 실제 광고 값이 들어 있는가');
  {
    const n = require('fs').readFileSync(src + '/public/native.js', 'utf8');
    const m = require('fs').readFileSync(src + '/android/app/src/main/AndroidManifest.xml', 'utf8');
    // 구글 시험용 ID(3940256099942544)로 되돌아가면 테스트 광고만 나가고 수익은 0 원이다.
    // 화면으로는 구별이 안 되므로 여기서 지킨다. (iOS 는 아직 앱을 안 만들어 예외)
    ok('안드로이드 앱 ID 가 우리 것이다',
       /ca-app-pub-2889493659015752~/.test(m) && !/3940256099942544~/.test(m));
    ok('안드로이드 보상형 단위가 우리 것이다', /android: \{ reward: 'ca-app-pub-2889493659015752\//.test(n));
    // TESTING 은 켜 둘 수도 내릴 수도 있다 — 다만 무엇을 뜻하는지가 코드에 적혀 있어야 한다
    ok('테스트 여부가 한 곳에서 정해진다', /var TESTING = (true|false);/.test(n));
    ok('내 폰으로 실제 광고를 보면 안 된다고 적혀 있다', /자기 노출·자기 클릭/.test(n));
  }

  console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
