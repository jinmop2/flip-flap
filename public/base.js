// 웹과 앱을 가르는 한 줄.
//
// 웹에서는 화면과 서버가 같은 주소에 있어서 '/api/…' 같은 상대 주소가 그냥
// 통했다. 앱(Capacitor)으로 감싸면 화면은 기기 안(https://localhost)에 있고
// 서버는 밖에 있다 — 상대 주소는 기기 안을 가리키므로 아무것도 못 찾는다.
//
// 그래서 붙일 주소를 여기 한 곳에서 정한다. 웹에서는 빈 값이라 예전과 똑같이
// 돌고, 앱에서만 서버 주소가 붙는다.
(function () {
  var cap = window.Capacitor;
  var native = !!(cap && (cap.isNativePlatform ? cap.isNativePlatform() : cap.isNative));
  window.FF_NATIVE = native;
  // 앱에서 붙을 서버. 배포 주소가 바뀌면 여기만 고친다.
  window.FF_BASE = native ? 'https://flip-flap.onrender.com' : '';
  // 주소 하나를 만드는 자리 — 절대 주소(http…)는 그대로 둔다.
  window.ffUrl = function (p) {
    var s = String(p == null ? '' : p);
    if (/^[a-z]+:\/\//i.test(s)) return s;
    return (window.FF_BASE || '') + s;
  };
})();
