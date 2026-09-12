# 앱으로 내보내기 (Capacitor)

웹은 예전 그대로다. 이 문서는 **같은 코드를 안드로이드·iOS 앱으로 감싸는 법**이다.

예전에는 TWA(Bubblewrap)로 냈다. TWA 는 크롬 탭이라 네이티브 광고 SDK 가 붙을
자리가 없어서, 광고에 서버 검증(SSV)을 붙이려고 Capacitor 로 옮겼다.
`android-build/` 는 옛 TWA 라 지금은 안 쓴다 — **키스토어만 거기서 가져다 쓴다.**

---

## 한 번만 하는 준비

### 1. 서명 열쇠

스토어는 처음 올린 열쇠로만 갱신을 받는다. **TWA 때 쓰던 그 열쇠여야 한다.**

```bash
cp android/keystore.properties.example android/keystore.properties
```

열고 비밀번호 두 곳을 채운다. 이 파일은 `.gitignore` 에 걸려 있어 커밋되지 않는다.
환경변수(`FF_KEYSTORE` · `FF_KEYSTORE_PASSWORD` · `FF_KEY_ALIAS` · `FF_KEY_PASSWORD`)로
줘도 된다 — CI 에서는 그쪽이 낫다.

값이 없으면 서명 설정을 아예 안 만든다. debug 빌드는 그냥 되고, release 빌드는
"서명이 없다"고 분명히 멈춘다.

### 2. 빌드 도구

**Capacitor 8 은 JDK 21 을 쓴다.** Bubblewrap 이 깔아 둔 JDK 17 로 돌리면
`invalid source release: 21` 로 멈춘다 — 그것도 그래들을 다 내려받은 뒤에야
멈춰서 처음이면 30분을 태운다.

```bash
brew install openjdk@21          # 한 번만. keg-only 라 기존 17 을 안 건드린다
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/android-sdk
```

안드로이드 SDK 는 Bubblewrap 이 깔아 둔 것을 그대로 쓴다
(`~/.bubblewrap/config.json` 에 경로가 있다). SDK 경로는
`android/local.properties` 에도 적히는데, 기기마다 달라서 커밋되지 않는다:

```bash
echo "sdk.dir=$HOME/android-sdk" > android/local.properties
```

### 3. AdMob

안드로이드 값은 이미 코드에 들어 있다.

| | |
|---|---|
| 앱 ID | `ca-app-pub-2889493659015752~3465946132` — `AndroidManifest.xml` |
| 보상형 단위 | `ca-app-pub-2889493659015752/1319611593` — `public/native.js` |
| iOS | 아직 없음. 구글 시험용 그대로 |

**남은 것은 셋이다.**

1. 그 광고 단위의 **서버 측 확인(SSV)** 주소에 넣는다:
   `https://flip-flap.onrender.com/api/admob-ssv`
   (세 칸 중 첫 번째만 채운다 — 아래 둘은 저장할 때 한 번 쓰는 테스트용이다)
2. AdMob 콘솔 **[설정 > 테스트 기기]** 에 내 기기를 등록한다
3. `public/native.js` 의 `TESTING` 을 `false` 로 내리고, Render 에 `AD_MODE=ad`

> **순서를 지킨다.** SSV 주소를 넣기 전에 `AD_MODE=ad` 를 켜면 표는 나가는데
> 구글의 확인이 안 와서 아무도 보상을 못 받는다. 급하면 `AD_SSV=off` 로 검증만
> 잠시 끌 수 있지만, 그건 웹 광고와 같은 수준으로 되돌리는 것이다.

> **테스트 기기 등록을 먼저 한다.** `TESTING=false` 로 내린 뒤 내 폰에서 실제
> 광고를 보면 자기 노출·자기 클릭이라 계정이 정지될 수 있다. 등록해 두면
> false 여도 내 폰에서만 테스트 광고가 나온다.

> `TESTING = true` 인 동안은 단위가 진짜여도 테스트 광고만 나오고 수익은 0 원이다.

**최소 eCPM** 은 `Google 최적화 + 모든 가격` 그대로 둔다. 보상형은 이용자가
스스로 누른 광고라, 안 채워지면 수익을 못 버는 게 아니라 그 사람이 아무것도
못 받고 끝난다 — 단가보다 채워지는 게 중요하다. 하한은 노출이 쌓인 뒤에 만진다.

### 4. 소셜 로그인

리디렉션 주소는 웹과 같다(`/auth/*/callback`). 앱에서 시작한 로그인은 서버가
`com.mongdung.flipflap://auth#ktoken=…` 로 돌려보내므로 콘솔 설정은 그대로다.

- **카카오** — 앱에서 막히면 [플랫폼]에 안드로이드 패키지명과 키 해시를 등록한다
- **애플** — `APPLE_CLIENT_ID`(서비스 ID)를 Render 에 넣으면 버튼이 나온다.
  안 넣으면 버튼이 아예 안 보인다. iOS 에 낼 거라면 **필수**다(심사 규정 4.8).

---

## 낼 때마다 하는 일

```bash
# 1. 화면 한 벌을 만들고 앱에 넣는다
node tools/build-app.mjs
npx cap sync android

# 2. 판 번호를 올린다 (android/app/build.gradle 의 versionCode)
#    스토어는 늘 더 큰 번호만 받는다. TWA 가 4 까지 썼으므로 5 부터다.

# 3. 시금석 한 바퀴 (하나라도 빨가면 1 로 끝난다)
npm test
npm test -- q4 rejoin      # 이름에 그 글자가 든 것만
npm test -- --slow         # 오래 걸린 순서도 같이

# 4. 빠뜨린 게 없는지 훑는다 (막는 게 있으면 1 로 끝난다)
npm run preflight
node tools/preflight.mjs --net     # 스토어에 적어 둔 주소까지 두드려 본다

# 5. 스토어에 올릴 묶음
cd android && ./gradlew bundleRelease      # → app/build/outputs/bundle/release/*.aab

# 기기에 바로 넣어 보려면
cd android && ./gradlew assembleDebug      # → app/build/outputs/apk/debug/app-debug.apk
```

`node tools/build-app.mjs` 를 빠뜨리면 **앱 안의 화면만 옛 버전으로 남는다.**
웹은 이미 새것이라 눈치채기 어렵다 — 낼 때마다 첫 줄부터 다시 돈다.
`preflight` 가 이것도 본다 (app-www 가 public/ 보다 낡았는지).

### 비밀번호를 파일에 안 적고 만드는 길

`android/keystore.properties` 에 적어 두면 편하지만, 그건 비밀번호가 디스크에
평문으로 남는다는 뜻이다. 한 번만 낼 거면 환경변수로 주는 편이 낫다 —
`read -s` 로 받으면 셸 기록에도 안 남는다.

```bash
read -s -p "키스토어 비밀번호: " P; echo
cd android
FF_KEYSTORE=../../android-build/android.keystore \
FF_KEYSTORE_PASSWORD="$P" FF_KEY_ALIAS=flipflap FF_KEY_PASSWORD="$P" \
./gradlew bundleRelease
unset P
```

이 길로 실제로 만들어 봤다(버리는 열쇠로). AAB 에 서명이 붙고
`base/assets/public/` 에 화면 33개가, `mipmap-*` 에 진짜 아이콘이 들어간다.
남은 것은 **진짜 열쇠뿐**이다.

`android/keystore.properties` 가 없으면 `bundleRelease` 는 **거기서 멈춘다.**
예전엔 안 멈추고 서명 없는 13MB AAB 를 뱉었다 — 스토어는 그걸
알아듣기 힘든 말로 되돌려 보낸다. 열쇠는 **TWA 때 쓰던 그것**이어야 한다.

---

## TWA 에서 갈아탄 사람은 한 번 로그아웃된다

TWA 는 **크롬의** 저장 공간을, Capacitor 앱은 **웹뷰의** 저장 공간을 쓴다.
같은 앱으로 업데이트돼도 그 둘은 이어지지 않아, `ff_auth`(로그인 표시)가
안 넘어온다. 계정·전적·코인은 서버에 그대로 있지만 **쓰던 사람 눈에는
처음 깔았을 때와 똑같이 보인다.**

첫 실행에서 한 번만 "계정과 기록은 그대로 있습니다 — 다시 로그인해
주세요" 를 띄운다(`ff_twa_note`). 문의가 오면 이 이야기다.

게스트는 애초에 서버 계정이 없다(`sessionStorage`) — 잃을 것이 없다.

---

## Play 콘솔에서 같이 해야 하는 것

- **앱에 광고 포함** 선언
- **데이터 보안** 양식 갱신 (광고 SDK 가 기기 정보를 모은다)
- 광고 ID 권한 — Capacitor 가 AdMob 플러그인과 함께 `AD_ID` 를 넣는다

---

## 아직 안 한 것

- **iOS** — `npx cap add ios` 는 맥에 Xcode 와 CocoaPods 가 있어야 한다.
  Sign in with Apple 은 코드가 준비돼 있고, `APPLE_CLIENT_ID` 만 넣으면 켜진다.
- **OTA(앱 안 화면만 갱신)** — 지금은 화면을 고치려면 스토어를 거쳐야 한다.
  안드로이드는 심사가 몇 시간이라 견딜 만하지만, iOS(1~3일)로 가면 필요해진다.
  그때는 직접 만들지 말고 `@capgo/capacitor-updater` 같은 것을 쓰는 게 낫다 —
  반쯤 만든 OTA 는 없느니만 못하다(잘못 밀면 깔린 앱이 전부 죽는다).

---

## 스토어 스크린샷

`store-assets/제출용/` 이 지금 올라가 있는 세트다(1080×1920, 규격 맞음).
그런데 **내용이 오래됐다.**

- `5-모드.png` 는 솔로플레이가 한 줄에 하나씩 늘어선 옛 화면이다. 지금은
  2×2 격자에 그린 표식을 쓴다.
- 그 화면에 **미니게임이 들어 있다.** 섯다식 배팅이라 사행성 모사로 분류될 수
  있어 입구를 막아 둔 모드다. 앱에 없는 것을 스토어 그림이 광고하고 있으면
  심사에서 걸린다 — 하필 걸리면 곤란한 종류다.
- `6-로비.png` 도 로고와 버튼이 그 뒤로 바뀌었다.

다시 찍으려면 폰에 앱을 깔고:

```bash
node tools/shots.mjs 모드      # → store-assets/새로/모드.png (1080×1920)
```

미리보기 창으로는 못 만든다 — 800px 언저리에서 잘라서 늘리면 글자가 뭉갠다.
기기 화면을 그대로 받는 게 가장 깨끗하다. 요즘 폰은 20:9 가 흔한데
플레이스토어는 긴 변이 짧은 변의 두 배를 넘으면 안 받으므로, 이 스크립트가
위아래를 앱 바탕색으로 채워 1080×1920 으로 맞춘다.

---

## 앱 알림 (FCM)

웹푸시는 서비스워커 위에서 돈다. 앱에는 서비스워커를 안 깔아서 그 길이 없다 —
그래서 앱은 파이어베이스로 따로 받는다. 화면에서는 스위치 하나로 보인다.

**설정이 없으면 조용히 꺼져 있다.** 스위치가 아예 안 보이고, 빌드도 그대로 된다.

켜려면 셋이 필요하다.

1. **파이어베이스 프로젝트** — https://console.firebase.google.com 에서 만들고
   안드로이드 앱(`com.mongdung.flipflap`)을 등록한다.
2. **`google-services.json`** — 그 화면에서 받아 `android/app/` 에 둔다.
   (`.gitignore` 에 걸려 있다. 있으면 그때부터 빌드가 알림을 켠다.)
3. **서비스 계정 열쇠** — 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성.
   받은 JSON 을 **통째로** Render 환경변수 `FCM_SERVICE_ACCOUNT` 에 넣는다.

> 저장소에 넣지 않는다. 그 열쇠 하나면 누구나 이 앱 이름으로 알림을 쏠 수 있다.

> 환경변수 칸에 여러 줄이 안 들어가면 `FCM_PROJECT_ID` · `FCM_CLIENT_EMAIL` ·
> `FCM_PRIVATE_KEY` 로 나눠 넣어도 된다. 줄바꿈을 `\n` 글자로 적어도 받는다.

넣고 나면 서버 부팅 로그에서 `앱 알림 꺼짐` 줄이 사라진다. 안 사라지면 열쇠를
못 읽은 것이다.

`android/app/build.gradle` 은 **Capacitor 가 관리한다** — `cap sync` 가 덮어쓴다.
서명 설정과 판 번호가 쓸려 나가지 않았는지 시험이 매번 본다(t_fcm).
