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

1. https://admob.google.com 에서 앱을 만들고 **앱 ID**(`ca-app-pub-…~…`)를 받는다
2. **보상형 광고 단위**를 만들고 단위 ID(`ca-app-pub-…/…`)를 받는다
3. 그 단위 설정의 **서버 측 확인(SSV)** 주소에 넣는다:
   `https://flip-flap.onrender.com/api/admob-ssv`
4. 코드 두 곳을 바꾼다
   - `android/app/src/main/AndroidManifest.xml` → `APPLICATION_ID` 의 값
   - `public/native.js` → `UNITS` 의 단위 ID, 그리고 **`TESTING = false`**
5. Render 환경변수에 `AD_MODE=ad`

> **순서를 지킨다.** SSV 주소를 넣기 전에 `AD_MODE=ad` 를 켜면 표는 나가는데
> 구글의 확인이 안 와서 아무도 보상을 못 받는다. 급하면 `AD_SSV=off` 로 검증만
> 잠시 끌 수 있지만, 그건 웹 광고와 같은 수준으로 되돌리는 것이다.

> `TESTING = true` 인 동안은 테스트 광고만 나오고 수익은 0 원이다.

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

# 3. 스토어에 올릴 묶음
cd android && ./gradlew bundleRelease      # → app/build/outputs/bundle/release/*.aab

# 기기에 바로 넣어 보려면
cd android && ./gradlew assembleDebug      # → app/build/outputs/apk/debug/app-debug.apk
```

`node tools/build-app.mjs` 를 빠뜨리면 **앱 안의 화면만 옛 버전으로 남는다.**
웹은 이미 새것이라 눈치채기 어렵다 — 낼 때마다 첫 줄부터 다시 돈다.

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
