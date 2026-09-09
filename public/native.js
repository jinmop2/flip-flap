// 앱에서만 도는 것들 — 지금은 광고 하나다.
//
// 이 게임에는 번들러가 없다(script 태그로 그냥 읽는다). Capacitor 플러그인은
// 보통 import 해서 쓰지만, 플러그인은 스스로 window.Capacitor.Plugins 에
// 등록되므로 거기서 꺼내 쓰면 번들러 없이도 된다.
//
// 웹에서는 이 파일이 아무것도 안 한다 — FF.ad.ready() 가 false 를 돌려주고,
// 부르는 쪽은 광고 없이 예전처럼 진행한다.
(function () {
  'use strict';

  // 광고 단위. 안드로이드와 iOS 는 단위가 따로다 —
  // iOS 는 아직 앱을 안 만들어서 구글 시험용 그대로 둔다.
  var UNITS = {
    android: { reward: 'ca-app-pub-2889493659015752/1319611593' },
    ios:     { reward: 'ca-app-pub-3940256099942544/1791472922' },   // 아직 시험용
  };
  // 실제 광고를 내보낼지 말지.
  //
  // true 인 동안은 단위가 진짜여도 테스트 광고만 나오고 수익은 0 원이다.
  // 그런데 내 폰에서 실제 광고를 보는 것은 자기 노출·자기 클릭이라 계정이
  // 정지될 수 있다 — 그래서 기본은 true 다.
  //
  // 내리기 전에: AdMob 콘솔 [설정 > 테스트 기기] 에 내 기기를 등록한다.
  // 그러면 false 로 두어도 내 폰에서만 테스트 광고가 나온다.
  var TESTING = true;

  var P = (window.Capacitor && window.Capacitor.Plugins) || {};
  var AdMob = P.AdMob || null;
  var native = !!window.FF_NATIVE;
  var started = false, starting = null;

  function platform() {
    var c = window.Capacitor;
    var p = c && (c.getPlatform ? c.getPlatform() : c.platform);
    return p === 'ios' ? 'ios' : 'android';
  }
  function unit(kind) { return (UNITS[platform()] || UNITS.android)[kind]; }

  // 처음 광고를 부를 때 한 번만 켠다. 앱을 켜자마자 켜면 첫 화면이 그만큼 늦다.
  function start() {
    if (started) return Promise.resolve(true);
    if (starting) return starting;
    starting = AdMob.initialize({ initializeForTesting: TESTING })
      .then(function () { started = true; return true; })
      .catch(function (e) { console.warn('[광고] 시작 실패', e); return false; })
      .then(function (r) { starting = null; return r; });
    return starting;
  }

  // 보상형 한 편.
  //
  // 돌려주는 값을 셋으로 나눈다. 예전에는 전부 false 였는데, 그러면 화면이
  // "광고를 끝까지 봐야 받을 수 있어요" 하나로만 말하게 된다 — 광고가 아예
  // 없었을 때도 이용자 탓으로 들린다. 물량이 적은 초기에는 이게 흔한 일이다.
  //
  //   'done'   끝까지 봤다 → 지급
  //   'empty'  틀 광고가 없었다 → 이용자 잘못이 아니다. 하루 몫도 안 깎인다
  //   'quit'   중간에 닫았다 → 보상 없음
  //
  // ticket 은 서버가 낸 표다 — 구글이 이 값을 그대로 서버로 되돌려 주므로,
  // 서버는 "이 표의 광고를 정말 끝까지 봤다" 를 구글에게서 직접 듣는다.
  function reward(ticket) {
    if (!native || !AdMob) return Promise.resolve('empty');
    return start().then(function (up) {
      if (!up) return 'empty';
      return AdMob.prepareRewardVideoAd({
        adId: unit('reward'),
        isTesting: TESTING,
        ssv: ticket ? { userId: String(ticket) } : undefined,
      })
        .catch(function (e) { console.warn('[광고] 못 불러옴', e); return null; })
        .then(function (loaded) {
          if (loaded === null) return 'empty';                  // 채울 광고가 없었다
          return AdMob.showRewardVideoAd()
            .then(function (r) {
              // 끝까지 본 경우에만 보상 정보가 돌아온다
              return (r && (r.type || r.amount !== undefined)) ? 'done' : 'quit';
            })
            .catch(function (e) { console.warn('[광고] 재생 실패', e); return 'quit'; });
        });
    });
  }

  // ── 소셜 로그인 ──────────────────────────────────────────────────────────
  // 앱 안의 웹뷰에서 그냥 이동시키면 안 된다. 구글은 웹뷰 안의 로그인을 막고
  // (disallowed_useragent), 통과하더라도 앱 껍데기를 벗어나 돌아올 길이 없다.
  //
  // 그래서 시스템 브라우저로 열고, 서버가 끝나면 앱의 주소로 돌려보낸다.
  //   com.mongdung.flipflap://auth#ktoken=…
  // 그 주소가 열리면 아래 listener 가 받아 화면에 넘긴다.
  var Browser = P.Browser || null, App = P.App || null;

  function login(provider) {
    if (!native || !Browser) return false;
    Browser.open({ url: (window.FF_BASE || '') + '/auth/' + provider + '?app=1' });
    return true;
  }

  // 앱 주소로 돌아왔다 — 토큰을 꺼내 화면에 넘기고 브라우저를 닫는다
  if (native && App) {
    App.addListener('appUrlOpen', function (e) {
      var url = String((e && e.url) || '');
      var cut = url.indexOf('#');
      if (cut < 0) return;
      if (Browser) { try { Browser.close(); } catch (_) {} }
      var hash = url.slice(cut);
      // 화면 쪽 코드가 보는 것은 location.hash 하나다 — 거기에 얹고 다시 부른다
      try { location.hash = hash; } catch (_) {}
      if (window.FF && FF.onAuthReturn) FF.onAuthReturn(hash);
    });
  }

  // 약관·처리방침 같은 바깥 문서. 앱 안 웹뷰에서 열면 게임 화면을 덮어쓰고
  // 돌아올 길이 없다(뒤로가기가 없는 전체화면이다).
  function openExternal(url) {
    if (!native || !Browser) return false;
    Browser.open({ url: String(url) });
    return true;
  }

  // ── 안드로이드 뒤로가기 ──────────────────────────────────────────────────
  //
  // 손대지 않으면 뒤로가기가 앱을 통째로 끈다. 이 게임은 창을 history 에
  // 안 쌓으므로(모달을 pushState 로 열지 않는다) 웹뷰에는 돌아갈 자리가
  // 없고, Capacitor 는 그럴 때 앱을 닫는다 — 판 도중에도 그렇다.
  //
  // 그래서 ESC 가 하던 일을 그대로 시킨다. 닫을 것이 없을 때만 나가는데,
  // 그때도 한 번에 끄지 않는다 — 실수로 한 번 누른 것과 정말 끄려는 것을
  // 가릴 수 없기 때문이다(안드로이드 앱들이 다 이렇게 한다).
  var exitArmed = 0;
  if (native && App) {
    App.addListener('backButton', function () {
      // ① 열려 있는 창이 있으면 그것부터
      if (window.closeTopLayer && window.closeTopLayer()) return;
      // ② 판 안이면 안 끈다. 뒤로가기 한 번에 판이 날아가면 같이 두던
      //    사람들에게도 손해다 — 나가려면 화면의 나가기를 쓴다.
      if (document.body.classList.contains('ingame')
          || document.body.classList.contains('quad4')) {
        if (typeof toast === 'function') toast('나가려면 화면의 <b>나가기</b>를 눌러 주세요', 1800);
        return;
      }
      // ③ 로비에서 두 번 누르면 끈다
      var now = Date.now();
      if (now - exitArmed < 2000) { App.exitApp(); return; }
      exitArmed = now;
      if (typeof toast === 'function') toast('한 번 더 누르면 종료돼요', 1800);
    });
  }

  // ── 앱 알림 ──────────────────────────────────────────────────────────────
  //
  // 웹푸시는 서비스워커 위에서 도는데 앱에는 그게 없다. 그래서 앱은 파이어베이스로
  // 따로 받는다. 화면이 할 일은 두 가지뿐이다 — 권한을 묻고, 기기 토큰을
  // 서버에 넘긴다. 알림을 그리는 것은 안드로이드가 한다.
  var Push = P.PushNotifications || null;
  var fcmToken = null;

  // 토큰은 물어본다고 바로 오지 않는다(등록이 끝나야 온다). 기다리는 사람에게
  // 넘겨줄 수 있게 약속을 하나 만들어 둔다.
  var tokenWait = null, tokenGot = null;
  if (native && Push) {
    tokenWait = new Promise(function (res) { tokenGot = res; });
    Push.addListener('registration', function (t) {
      fcmToken = (t && t.value) || null;
      if (tokenGot) { tokenGot(fcmToken); tokenGot = null; }
    });
    Push.addListener('registrationError', function (e) {
      console.warn('[알림] 등록 실패', e);
      if (tokenGot) { tokenGot(null); tokenGot = null; }
    });
  }

  // 켠다. 성공하면 기기 토큰, 아니면 null.
  // 거절당하면 다시 묻지 않는다 — 안드로이드가 두 번째부터는 창을 안 띄운다.
  function pushOn() {
    if (!native || !Push) return Promise.resolve(null);
    if (fcmToken) return Promise.resolve(fcmToken);
    return Push.requestPermissions().then(function (r) {
      if (!r || r.receive !== 'granted') return null;
      Push.register();
      // 등록이 끝나야 토큰이 온다. 안 오면 그냥 접는다 — 여기서 매달리면
      // 스위치가 아무 반응 없이 멈춘 것처럼 보인다.
      return Promise.race([
        tokenWait,
        new Promise(function (res) { setTimeout(function () { res(null); }, 8000); }),
      ]);
    }).catch(function (e) { console.warn('[알림] 켜기 실패', e); return null; });
  }
  function pushOff() {
    if (native && Push) { try { Push.unregister(); } catch (_) {} }
    var t = fcmToken; fcmToken = null;
    return t;
  }

  window.FF = window.FF || {};
  window.FF.push = native && Push ? { on: pushOn, off: pushOff, token: function () { return fcmToken; } } : null;
  window.FF.login = login;
  window.FF.openExternal = openExternal;
  window.FF.ad = {
    ready: function () { return native && !!AdMob; },
    testing: function () { return TESTING; },
    reward: reward,
  };
})();
