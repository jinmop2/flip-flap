# FLIP FLAP 배포 가이드 (Render 무료 배포)

다른 지역 친구와 실시간으로 플레이하려면 서버를 인터넷에 올려야 합니다.
아래 순서대로 하면 고정 주소가 생겨서 링크만 공유하면 됩니다.

## 사전 준비
- GitHub 계정 (https://github.com)
- Render 계정 (https://render.com — GitHub으로 가입 가능, 무료)

## 1단계 — GitHub에 코드 올리기

이 폴더(`my-game`)에서 터미널을 열고:

```bash
git init
git add .
git commit -m "FLIP FLAP 초기 버전"
git branch -M main
```

그다음 GitHub에서 새 저장소(New repository)를 하나 만들고(이름 예: `flip-flap`, Public/Private 무관),
안내에 나오는 주소로 연결해서 push:

```bash
git remote add origin https://github.com/<본인아이디>/flip-flap.git
git push -u origin main
```

## 2단계 — Render에서 배포

1. https://render.com 로그인 → **New +** → **Web Service**
2. 방금 만든 GitHub 저장소 선택 (Connect)
3. 설정값 (대부분 자동 인식됨):
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
4. **Create Web Service** 클릭 → 몇 분 후 배포 완료
   - `render.yaml`이 포함돼 있어 자동으로 위 설정이 잡힐 수도 있습니다.

## 3단계 — 친구와 플레이

배포가 끝나면 `https://flip-flap-xxxx.onrender.com` 같은 주소가 생깁니다.

1. 두 사람 모두 그 주소로 접속
2. 한 명이 **방 만들기** → 나오는 **방 코드**(예: `A1B2C`)를 친구에게 전달
3. 다른 한 명이 코드를 입력하고 **참가**
4. 게임 시작!

## 참고
- 코드 수정은 필요 없습니다. 클라이언트가 접속한 주소로 자동 연결되고(`io()`),
  서버가 `process.env.PORT`를 사용하도록 이미 되어 있습니다.
- **무료 플랜 주의점**: 15분간 아무도 접속하지 않으면 서버가 잠들어,
  다음 접속 시 깨어나는 데 30초~1분 걸립니다(첫 로딩이 느릴 수 있음). 게임 중에는 문제 없습니다.
- 코드를 고친 뒤 다시 배포하려면 `git commit` 후 `git push` 하면 Render가 자동 재배포합니다.
