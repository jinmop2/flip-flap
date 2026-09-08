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

  // 광고 단위 — 지금은 구글이 공개한 시험용이다. AdMob 콘솔에서 만든 것으로
  // 바꾸면 그때부터 진짜 광고가 나간다. 안드로이드와 iOS 는 단위가 따로다.
  var UNITS = {
    android: { reward: 'ca-app-pub-3940256099942544/5224354917' },
    ios:     { reward: 'ca-app-pub-3940256099942544/1791472922' },
  };
  // 시험용 단위를 쓰는 동안은 테스트 광고만 나온다. 실제 단위로 바꾸면서
  // 이 값을 안 내리면 수익이 0 원이다 — 구글이 테스트 노출은 안 쳐 준다.
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

  // 보상형 한 편. 끝까지 봤으면 true.
  // ticket 은 서버가 낸 표다 — 구글이 이 값을 그대로 서버로 되돌려 주므로,
  // 서버는 "이 표의 광고를 정말 끝까지 봤다" 를 구글에게서 직접 듣는다.
  function reward(ticket) {
    if (!native || !AdMob) return Promise.resolve(false);
    return start().then(function (up) {
      if (!up) return false;
      return AdMob.prepareRewardVideoAd({
        adId: unit('reward'),
        isTesting: TESTING,
        ssv: ticket ? { userId: String(ticket) } : undefined,
      })
        .then(function () { return AdMob.showRewardVideoAd(); })
        .then(function (r) {
          // 끝까지 본 경우에만 보상 정보가 돌아온다
          return !!(r && (r.type || r.amount !== undefined));
        })
        .catch(function (e) { console.warn('[광고] 재생 실패', e); return false; });
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

  window.FF = window.FF || {};
  window.FF.login = login;
  window.FF.ad = {
    ready: function () { return native && !!AdMob; },
    testing: function () { return TESTING; },
    reward: reward,
  };
})();
