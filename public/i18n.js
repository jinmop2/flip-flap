// ── 언어 ──────────────────────────────────────────────────────────────────
//
// 문구가 1,200개가 넘고 화면·클라이언트·서버 세 군데에 흩어져 있다. 파일마다
// t('lobby.play') 같은 열쇠를 심으면 손댈 곳이 너무 많고, 하나 빠뜨리면 화면에
// "lobby.play" 가 그대로 뜬다.
//
// 그래서 한국어 원문을 열쇠로 쓴다.
//   · 번역이 없으면 한국어가 그대로 나온다 — 깨진 열쇠가 보이는 일이 없다.
//   · 서버가 보내 준 문구(아이템 이름·오류 메시지)도 같은 표로 덮인다.
//   · 대신 한국어 원문을 고치면 짝이 끊긴다. tests/t_i18n.js 가 지켜본다.
//
// 바꾸는 방법은 "이미 그려진 글자를 훑어 바꾸기" 다. 그리는 쪽 코드를 건드리지
// 않아도 되고, 나중에 새로 만들어지는 DOM 도 MutationObserver 가 잡는다.
(function (root) {
  'use strict';

  // ── 사전 ────────────────────────────────────────────────────────────────
  // 한국어 원문 → 영어. 순서는 화면 순서를 따른다.
  const EN = {

    // ── TWELVE ──
    'AI는 쉬움·보통·전문가 세 급이에요. 전문가는 남은 카드를 세고,\n         칩을 0까지 쓰지 않으며, 클로즈로 상대 칩을 말리는 수까지 씁니다.': 'The AI comes in three grades. Expert counts the unseen cards, never spends its last chip, and uses closed auctions to drain yours.',
    '카드가 아니라 칩으로 값을 부르는 경매예요': 'An auction where you bid chips, not cards',
    '덱을 눌러 카드를 뒤집으세요': 'Tap the deck to flip a card',
    '상대가 카드를 뒤집는 중…': 'They are flipping a card…',
    '손패에서 한 장을 내놓으세요': 'Put up one card from your hand',
    '상대가 출품하는 중…': 'They are putting up a card…',
    '경매 방식을 고르세요': 'Choose the auction type',
    '상대가 방식을 고르는 중…': 'They are choosing the type…',
    '오픈 경매': 'Open auction',
    '클로즈 경매': 'Closed auction',
    '부르기': 'Bid',
    '물러서기': 'Fold',
    '안 사기': "Don't buy",
    '다음 턴': 'Next turn',
    '상대가 부르는 중…': 'They are bidding…',
    '상대가 살지 고르는 중…': 'They are deciding whether to buy…',
    '칩이 모자라요 — 물러서야 해요': 'Not enough chips — you must fold',
    '칩이 2개 이상 있어야 해요': 'You need at least 2 chips',
    '출품 (비공개)': 'Offered (hidden)',
    '판 종료': 'Game over',
    '정산 중…': 'Settling…',
    '세트 완성': 'Set completed',
    '칩이 떨어졌어요': 'You ran out of chips',
    '상대의 칩이 떨어졌어요!': "Your opponent ran out of chips!",
    '칩이 다 떨어졌어요...': 'You ran out of chips...',
    '상대 시간 초과!': 'Opponent ran out of time!',
    '시간 초과...': 'Out of time...',
    '덱 소진 — 세트에 더 가까웠어요!': 'Deck empty — you were closer to a set!',
    '덱 소진 — 상대가 세트에 더 가까웠어요.': 'Deck empty — your opponent was closer.',
    '세트 완성!': 'Set complete!',
    '상대가 세트를 완성했어요.': 'Your opponent completed a set.',
    '한 판 더': 'One more',
    '신규': 'New',

    // ── 아직 안 덮여 있던 말들 ──
    '랭크게임': 'Ranked match',
    '🏆 랭크게임': '🏆 Ranked match',
    '빠른 입장': 'Quick join',
    '아직 안 나온 카드 &nbsp;': 'Cards not yet seen &nbsp;',
    '자리에서 일어나기': 'Leave the table',
    '메시지를 입력하세요': 'Type a message',
    '토너먼트는 로그인하면 참가할 수 있어요!': 'Sign in to enter tournaments!',
    '로그인하면 친구를 부를 수 있어요.': 'Sign in to invite friends.',
    '방장이 내보냈어요.': 'The host removed you.',
    '😢 상대가 도전을 받지 않았어요': '😢 They did not take the challenge',
    '👁 관전': '👁 Spectating',
    '소지금이 떨어졌어요.': 'You have run out of moons.',
    '🏆 승리!': '🏆 You win!',
    '접속이 끊겨 판이 종료됐어요. 다시 시작해주세요.': 'The connection dropped and the game ended. Please start again.',
    '아쉽네요…': 'So close…',
    '자리에 앉는 중…': 'Taking a seat…',
    '자리 배치 중…': 'Seating players…',
    '다른 클랜': 'Other clans',
    '우리 클랜': 'Our clan',
    '아직 만들어진 클랜이 없어요.': 'No clans have been founded yet.',
    '대화': 'Chat',
    '보내기': 'Send',
    '경매에서 지면 아이템이 들어와요': 'Lose an auction and an item arrives',


    '무작위 매칭 · RP 반영': 'Random matching · counts for RP',
    '기록 안 됨': 'Not recorded',
    '방': 'Rooms',
    'AI 2명 · 손패 6장': '2 AI · 6 cards',
    'AI 3명 · 손패 6장': '3 AI · 6 cards',

    '솔로플레이': 'Solo play',
    '클래식': 'Classic',
    '기타': 'More',
    '급수·RP·레벨·보상이 어떻게 움직이는지 한자리에 모았습니다.':
      'Ranks, RP, levels and rewards — all in one place.',

    // ── 이번에 새로 들어온 문구 ──
    '들어가기': 'Enter',
    '내 방': 'My room',
    '친구 부르기': 'Invite a friend',
    '친구 초대': 'Invite a friend',
    '눌러서 부르기': 'Tap to invite',
    '부르기': 'Invite',
    '지금 부를 수 있는 친구가 없어요.': 'No friends are free right now.',
    '코드를 공유해 보세요.': 'Try sharing the code.',
    '불러오는 중…': 'Loading…',
    '닫기': 'Close',
    '게임 시작': 'Start game',
    '상대를 기다려요': 'Waiting for players',
    '빈자리': 'Empty seat',
    '방장': 'Host',
    '게스트': 'Guest',
    // 미니게임 — 달
    '0 달': '0 moons',
    '🃏 두 장 승부': '🃏 Two-card showdown',
    '🪙 200 → 2000달': '🪙 200 → 2,000 moons',
    '코인을 달로 바꿔 앉습니다 · 일어설 때 남은 달을 코인으로 돌려받습니다':
      'Coins become moons when you sit · leftover moons return as coins when you stand',
    '같은 줄끼리 붙으면': 'Within the same rank,',
    '뒷자리 합': 'the lower back-digit sum',
    '이 작은 쪽, 그것도 같으면': 'wins; if those tie,',
    '더 강한 카드': 'the stronger single card',
    '를 쥔 쪽이 이깁니다.': 'takes it.',
    // 토너먼트
    '8강 · 4강은 단판,': 'Quarter- and semi-finals are single games,',
    '결승은 3판 2선승': 'the final is best of three',
    '· 모든 경기는 2인전': '· every match is 1v1',
    '참가비': 'Entry fee',
    '· 우승': '· Winner',
    '· 준우승': '· Runner-up',
    '매시 정각과 30분에 열려요. 시작할 때 자리가 비면 AI 가 채웁니다.':
      'Starts every hour on the hour and at half past. Empty seats are filled by AI.',
    // 룰북 탭
    '2인용': '1v1',
    '3인용': '3 players',
    '4인용': '4 players',
    // ── 로비·기본 ──
    '랭킹': 'Ranking',
    '게임방법': 'How to Play',
    '튜토리얼': 'Tutorial',
    '솔로플레이': 'Solo Play',
    'AI와 대전': 'vs AI',
    '멀티플레이': 'Multiplayer',
    '온라인 대전': 'Online Match',
    '아이템전': 'Item Battle',

    '이벤트': 'Event',
    '다인전': 'Multiplayer',
    '3·4인': '3-4 Players',
    '친구 초대': 'Invite a Friend',
    '앱으로 추가': 'Add to Home',
    '버그 제보': 'Report a Bug',
    '홈': 'Home',
    '미션': 'Missions',
    '상점': 'Shop',
    '친구': 'Friends',
    '클랜': 'Clan',
    '뽑기': 'Gacha',
    '교환소': 'Exchange',
    '닫기': 'Close',
    '취소': 'Cancel',
    '확인': 'OK',
    '나가기': 'Leave',
    '설명': 'Guide',
    '설정': 'Settings',
    '로그인': 'Log In',
    '로그아웃': 'Log Out',
    '회원가입': 'Sign Up',
    '게스트로 시작': 'Play as Guest',
    'Google로 시작': 'Continue with Google',
    '카카오로 시작': 'Continue with Kakao',
    '게스트': 'Guest',
    '게스트 · 기록이 저장되지 않아요': 'Guest — progress is not saved',
    '기록이 저장되지 않아요': 'Progress is not saved',

    // ── 설정 ──
    '⚙️ 설정': 'Settings',
    '배경음악': 'Music',
    '효과음': 'Sound Effects',
    '턴 안내': 'Turn Hints',
    '언어': 'Language',
    '한국어': '한국어',
    'English': 'English',

    // ── 게임 화면 ──
    '나': 'You',
    '상대': 'Opponent',
    '나 (진행자)': 'You (Auctioneer)',
    'AI': 'AI',
    '컴퓨터': 'Computer',
    '쉬움': 'Easy',
    '보통': 'Normal',
    '어려움': 'Hard',
    '전문가': 'Expert',
    '진행': 'Turn',
    '진행자': 'Auctioneer',
    '턴': 'Turn',
    '덱': 'Deck',
    '중앙 카드': 'Center Card',
    '공개 카드': 'Face-up Card',
    '출품 카드': 'Offered Card',
    '출품 (비공개)': 'Offered (hidden)',
    '출품 (교체 가능)': 'Offered (swappable)',
    '내 배팅': 'Your Bid',
    '상대 배팅': 'Opponent Bid',
    '획득 없음': 'Nothing won',
    '획득 카드': 'Cards Won',
    '낙찰': 'Won',
    '완성!': 'Complete!',
    '완성! \u2713': 'Complete! \u2713',
    '오픈': 'Open',
    '클로즈': 'Closed',
    '오픈 경매': 'Open Auction',
    '클로즈 경매': 'Closed Auction',
    '경매품 공개 · 배팅 비공개': 'Lot shown, bids hidden',
    '경매품 비공개 · 배팅 공개': 'Lot hidden, bids shown',
    '선공 결정': 'Deciding who goes first',
    '남은 카드': 'Cards Left',
    '한 판 더!': 'Play Again',
    '로비로': 'Back to Lobby',
    '친구에게 도전장 보내기': 'Send a Challenge',
    '게임 종료': 'Game Over',
    '결과 공개!': 'Revealing!',
    '승리!': 'Victory!',
    '패배...': 'Defeat...',
    '무승부': 'Draw',
    '경매 방식을 고르세요': 'Choose the auction type',
    '배팅 카드를 고른 뒤 확정을 누르세요': 'Pick a bid card, then confirm',
    '내놓을 카드를 고른 뒤 확정을 누르세요': 'Pick a card to offer, then confirm',
    '두구두구… 공개!': 'And the winner is...',
    '내 차례!': 'Your turn!',
    '\ud83d\udd14 내 차례! — FLIP FLAP': '\ud83d\udd14 Your turn! — FLIP FLAP',
    '시간을 다 썼어요 — 남은 판은 AI 가 대신합니다': 'Out of time — AI will play for you',
    '서버가 응답하지 않아요 — 잠시 후 다시 눌러주세요': 'No response from the server — please try again',
    '다시 연결하는 중…': 'Reconnecting...',
    '연결이 끊겨 판을 이어갈 수 없어요.': 'Disconnected — this game cannot continue.',
    '손패가 없어 이번엔 입찰할 수 없어요': 'No cards left — you sit this one out',
    '다음 사람이 내는 중…': 'Waiting for the next player...',
    '나머지가 배팅하는 중…': 'Others are bidding...',
    '곧 시작합니다…': 'Starting soon...',
    '대기 중': 'Waiting',
    '빈 자리': 'Empty seat',
    '기다리는 중…': 'Waiting...',
    '준비 완료': 'Ready',
    '사람': 'Human',
    '불러오는 중…': 'Loading...',
    '불러오기 실패': 'Failed to load',

    // ── 미션 ──
    '일일 미션': 'Daily Missions',
    '수령': 'Claim',
    '완료!': 'Done!',
    '아직 전적이 없어요': 'No matches yet',
    '아직 아이템이 없어요': 'No items yet',

    // ── 내 정보 ──
    '내 정보': 'My Profile',
    '인벤토리': 'Inventory',
    '칭호': 'Titles',
    '전적': 'History',
    '장착': 'Equipped',
    '장착 중': 'Equipped',
    '보유': 'Owned',
    '꾸미기·기타': 'Cosmetics & Misc',
    '카드 뒷면': 'Card Backs',
    '카드 앞면': 'Card Faces',
    '테이블': 'Tables',
    '명패': 'Name Plates',
    '아바타': 'Avatars',
    '이모트': 'Emotes',
    '승리 연출': 'Victory Effects',
    '낙찰 도장': 'Win Stamps',
    '카드 놓기 연출': 'Card-Place Effects',
    '그 밖에': 'Other',

    // ── 상점·뽑기 ──
    '구매': 'Buy',
    '구매 완료!': 'Purchased!',
    '교환소에서': 'In Exchange',
    '파편': 'Shards',
    '상품을 선택하세요': 'Select an item',
    '쿠폰 번호 입력': 'Enter coupon code',
    '등록': 'Redeem',
    '뽑는 중…': 'Rolling...',
    '무언가 온다…': 'Something is coming...',
    '확률·천장 보기': 'Rates & Pity',
    '노멀': 'Normal',
    '레어': 'Rare',
    '에픽': 'Epic',
    '전설': 'Legendary',
    '파편으로만 얻는 것': 'Shard-only items',
    '파편이 더 필요해요': 'Need more shards',
    '카드를 누르면 먼저 열려요 · 빈 곳을 누르면 전부': 'Tap a card to open it early — tap elsewhere to open all',

    // ── 상점 아이템 (이름) ──
    '랜덤 닉네임 염색약': 'Random Nickname Dye',
    '닉네임 변경권': 'Nickname Change Ticket',
    '희귀 염색약 확정권': 'Rare Dye Guarantee',
    '미드나잇 카드백': 'Midnight Card Back',
    '황금 카드백': 'Golden Card Back',
    '오방색 카드백': 'Obangsaek Card Back',
    '루비 카드백': 'Ruby Card Back',
    '은하수 카드백': 'Galaxy Card Back',
    '크리스탈 카드백': 'Crystal Card Back',
    '파편 카드백': 'Shard Card Back',
    '흑요석 카드백': 'Obsidian Card Back',
    '한지 카드백': 'Hanji Card Back',
    '파티 이모트 팩': 'Party Emote Pack',
    '동물 이모트 팩': 'Animal Emote Pack',
    '승부사 이모트 팩': 'Duelist Emote Pack',
    '도발 이모트 팩': 'Taunt Emote Pack',
    '나무 명패': 'Wooden Plate',
    '네온 명패': 'Neon Plate',
    '황금 명패': 'Golden Plate',
    '행운의 명패': 'Lucky Plate',
    '레벨50 한정 명패': 'Level 50 Exclusive Plate',
    '루비 명패': 'Ruby Plate',
    '크리스탈 명패': 'Crystal Plate',
    '파편 명패': 'Shard Plate',
    '염색 스포이드': 'Dye Pipette',
    '지금 닉네임 색을 담아 둔다 · 언제든 한 번 그 색으로 되돌린다 (1회용)':
      'Stores your current name color · restores it once, whenever you like (single use)',
    '담아 둔 색': 'Saved color',
    '이 색으로': 'Restore',
    '지금 그 색': 'Already on',
    '흑요석 명패': 'Obsidian Plate',
    '한지 명패': 'Hanji Plate',
    '블루 테이블': 'Blue Table',
    '퍼플 테이블': 'Purple Table',
    '골드 테이블': 'Gold Table',
    '그린 펠트 테이블': 'Green Felt Table',
    '크리스탈 테이블': 'Crystal Table',
    '파편 테이블': 'Shard Table',
    '흑요석 테이블': 'Obsidian Table',
    '한지 테이블': 'Hanji Table',
    '네온 카드': 'Neon Card Face',
    '클래식 카드': 'Classic Card Face',
    '황금 숫자 카드': 'Golden Numeral Card Face',
    '크리스탈 카드': 'Crystal Card Face',
    '파편 카드': 'Shard Card Face',
    '흑요석 카드': 'Obsidian Card Face',
    '먹글씨 카드': 'Ink Brush Card Face',
    '파편 아바타': 'Shard Avatar',
    '초심자 아바타': 'Beginner Avatar',
    '승부사 아바타': 'Duelist Avatar',
    '여우 아바타': 'Fox Avatar',
    '딜러 아바타': 'Dealer Avatar',
    '도둑고양이 아바타': 'Alley Cat Avatar',
    '왕 아바타': 'King Avatar',
    '괴도 아바타': 'Phantom Thief Avatar',
    '파편 폭발': 'Shard Burst',
    '색종이 축포': 'Confetti Cannon',
    '금화비': 'Rain of Gold',
    '벼락': 'Lightning',
    '불꽃놀이': 'Fireworks',
    'WIN 도장': 'WIN Stamp',
    '붉은 인장': 'Crimson Seal',
    '별 도장': 'Star Stamp',
    '왕관 도장': 'Crown Stamp',
    '먼지': 'Dust',
    '반짝임': 'Sparkle',
    '불티': 'Embers',

    // ── 상점 아이템 (설명) ──
    '닉네임 색을 랜덤으로! 골드 8%·무지개 2%': 'Randomize your nickname color! Gold 8%, Rainbow 2%',
    '닉네임을 한 번 바꿀 수 있어요': 'Change your nickname once',
    '희귀 색상(청록·핑크·라임) 확정 — 레벨20 보상': 'Guarantees a rare color (teal, pink, lime) — Level 20 reward',
    '깊은 밤하늘 카드 뒷면 (상대에게도 보여요)': 'A deep night sky back (your opponent sees it too)',
    '번쩍이는 황금 카드 뒷면': 'A gleaming golden back',
    '전통 오방색 카드 뒷면': 'A traditional five-color back',
    '와인빛으로 물든 카드 뒷면': 'A back steeped in wine red',
    '별이 흐르는 프리미엄 카드 뒷면': 'A premium back with drifting stars',
    '빛을 쪼개는 수정 결정면 뒷면': 'A crystal-faceted back that splits the light',
    '깨진 빛이 맞물린 뒷면 · 파편으로만': 'Interlocking shards of light — shards only',
    '검은 유리에 금이 흐르는 뒷면': 'Black glass veined with gold',
    '닥종이 결에 먹으로 친 뒷면': 'Ink brushed over mulberry paper',
    '광대·악마·해골 등 장난스러운 8종': '8 playful emotes — clown, devil, skull and more',
    '강아지·고양이·여우 등 동물 8종': '8 animal emotes — dog, cat, fox and more',
    '칼·방패·트로피 등 승부용 8종': '8 competitive emotes — sword, shield, trophy and more',
    '티백·느린박수·하품 등 약올리기 8종': '8 taunts — teabag, slow clap, yawn and more',
    '닉네임을 감싸는 소박한 나무 명패': 'A plain wooden plate around your name',
    '보랏빛 네온 명패 · 경험치 +5%': 'Violet neon plate — +5% XP',
    '번쩍이는 황금 명패 · 코인 획득 +4%': 'Gleaming gold plate — +4% coins',
    '장착 중이면 매일 출석 보상 +50🪙': 'While equipped, daily login reward +50🪙',
    '레벨 50 달성자 한정 · 코인·경험치 각 +3%': 'Level 50 only — +3% coins and +3% XP',
    '와인빛 루비 명패 · 연승 보너스 1.25배': 'Wine-red ruby plate — 1.25x win-streak bonus',
    '얼음처럼 맑은 명패 · 경험치 +8%': 'Clear as ice — +8% XP',
    '금이 간 결정 명패 · 파편 획득 +10% · 파편으로만': 'Cracked crystal plate — +10% shards — shards only',
    '금이 흐르는 검은 명패 · 코인 획득 +6%': 'Black plate veined with gold — +6% coins',
    '먹으로 쓴 이름표 · 경험치 +3%': 'A name brushed in ink — +3% XP',
    '차분한 심해 블루 테이블': 'A calm deep-sea blue table',
    '고급스러운 자주빛 테이블': 'An elegant violet table',
    '럭셔리 카지노 골드 테이블': 'A luxury casino gold table',
    '클래식 카지노 그린 펠트': 'Classic casino green felt',
    '살얼음이 낀 듯한 서늘한 테이블': 'A cool table glazed with thin ice',
    '조각난 빛이 깔린 테이블 · 파편으로만': 'A table strewn with broken light — shards only',
    '검은 유리를 깐 듯한 테이블': 'A table laid with black glass',
    '닥종이를 깐 차분한 테이블': 'A calm table lined with mulberry paper',
    '숫자가 네온으로 빛나는 카드 앞면': 'Numbers glowing in neon',
    '트럼프풍 세리프 숫자 카드 앞면': 'Playing-card serif numerals',
    '숫자가 황금빛으로 빛나는 카드 앞면': 'Numbers shining in gold',
    '숫자가 수정처럼 맑게 비치는 앞면': 'Numbers clear as crystal',
    '숫자가 갈라져 빛나는 앞면 · 파편으로만': 'Numbers fractured and glowing — shards only',
    '숫자가 금빛으로 새겨진 앞면': 'Numbers engraved in gold',
    '붓으로 쓴 듯한 숫자 앞면': 'Numbers as if written with a brush',
    '조각으로 이루어진 얼굴 · 파편으로만': 'A face made of shards — shards only',
    '이제 막 시작한 얼굴': 'A face that has only just begun',
    '중절모를 눌러쓴 승부사': 'A gambler under a pulled-down fedora',
    '속내를 알 수 없는 여우': 'A fox whose mind you cannot read',
    '판을 굴리는 딜러': 'The dealer who runs the table',
    '남의 패를 노리는 고양이': 'A cat eyeing everyone else\u2019s hand',
    '경매장의 왕': 'The king of the auction house',
    '정체를 감춘 괴도': 'A phantom thief in disguise',
    '이기면 화면이 조각나 흩어진다 · 파편으로만': 'On victory the screen shatters — shards only',
    '승리하면 색종이가 쏟아진다': 'Confetti pours down when you win',
    '승리하면 금화가 떨어진다': 'Gold coins rain down when you win',
    '승리하면 벼락이 내리친다': 'Lightning strikes when you win',
    '승리하면 밤하늘에 불꽃이 터진다': 'Fireworks burst overhead when you win',
    '기본 낙찰 도장': 'The default win stamp',
    '옛 도장처럼 붉게 찍힌다': 'Stamped in red like an old seal',
    '별이 박히듯 찍힌다': 'Stamped like a star set in place',
    '왕관이 내려앉는다': 'A crown settles into place',
    '기본 — 옅은 먼지가 인다': 'Default — a faint puff of dust',
    '카드를 낼 때 반짝인다': 'Sparkles when you place a card',
    '카드를 낼 때 불티가 튄다': 'Embers scatter when you place a card',

    // ── 칭호 ──
    '창단 멤버': 'Founding Member',
    '초대 패왕': 'Invite Overlord',
    '새내기 졸업': 'Out of the Nest',
    '승리의 맛': 'Taste of Victory',
    '승리 수집가': 'Victory Collector',
    '연승 제조기': 'Streak Machine',
    '파죽지세': 'Unstoppable',
    '무패의 폭풍': 'Undefeated Storm',
    '배신의 달인': 'Betrayal Adept',
    '배신의 화신': 'Betrayal Incarnate',
    '배신의 군주': 'Lord of Betrayal',
    '전문가 사냥꾼': 'Expert Hunter',
    '기계 사냥꾼': 'Machine Hunter',
    '기계 학살자': 'Machine Slayer',
    '온라인 데뷔': 'Online Debut',
    '경매왕': 'Auction King',
    '경매 제왕': 'Auction Emperor',
    '성실한 단골': 'Steady Regular',
    '개근상': 'Perfect Attendance',
    '터줏대감': 'Old Guard',
    '숙련된 승부사': 'Skilled Duelist',
    '노련한 승부사': 'Seasoned Duelist',
    '완숙한 승부사': 'Masterful Duelist',
    '큰손': 'Big Spender',
    '갑부': 'Tycoon',
    '재벌': 'Magnate',
    '백전노장': 'Veteran of 100',
    '천전노장': 'Veteran of 1,000',
    '만전노장': 'Veteran of 10,000',
    '사이클 입문': 'Cycle Novice',
    '사이클 장인': 'Cycle Artisan',
    '사이클 마스터': 'Cycle Master',

    // ── 일일 미션 ──
    '아무 대전 3판 플레이': 'Play 3 games of any mode',
    '아무 대전 5판 플레이': 'Play 5 games of any mode',
    '1승 거두기': 'Win 1 game',
    '3승 거두기': 'Win 3 games',
    '멀티플레이 1판': 'Play 1 online match',
    '전문가 AI와 1판': 'Play 1 game vs the Expert AI',
    '2연승 달성하기': 'Get a 2-win streak',
    '졸개의 배신 성공하기': "Land the Servant's Betrayal",
    '싸이클링 — 네 종류 모두 우승': 'Cycling — win with all four kinds',

    // ── 급수·단 ──
    '10급': '10 Kyu', '9급': '9 Kyu', '8급': '8 Kyu', '7급': '7 Kyu', '6급': '6 Kyu',
    '5급': '5 Kyu', '4급': '4 Kyu', '3급': '3 Kyu', '2급': '2 Kyu', '1급': '1 Kyu',
    '초단': '1 Dan', '2단': '2 Dan', '3단': '3 Dan', '4단': '4 Dan', '5단': '5 Dan',
    '6단': '6 Dan', '7단': '7 Dan', '8단': '8 Dan', '9단': '9 Dan',

    // ── 아이템전 (이름·설명·안내) ──
    '돋보기': 'Magnifier',
    '모래시계': 'Hourglass',
    '연막탄': 'Smoke Bomb',
    '소매치기': 'Pickpocket',
    '손바꿈': 'Hand Swap',
    '복사기': 'Duplicator',
    '뒤집개': 'Reversal',
    '재경매': 'Re-auction',
    '에누리': 'Haggle',
    '도둑고양이': 'Alley Cat',
    '폭군': 'Tyrant',
    '운명의 주사위': 'Dice of Fate',
    '상대 손패 2장을 훔쳐본다': 'Peek at 2 cards in the opponent\u2019s hand',
    '상대의 남은 시간을 30초 깎는다': "Cut 30 seconds from the opponent's clock",
    '이번 경매품을 상대에게만 가린다': 'Hide this lot from the opponent only',
    '상대 손패 1장을 뺏고 내 카드 1장을 넘긴다': 'Take 1 card from their hand and give them 1 of yours',
    '내 손패 1장을 덱의 카드와 바꾼다': 'Swap 1 card in your hand with one from the deck',
    '내가 낙찰받은 카드 1장을 복제한다': 'Duplicate 1 card you have won',
    '이번 경매만 약한 카드가 이긴다': 'This auction only, the weaker card wins',
    '진 경매를 무효로 하고 다시 배팅한다': 'Void a lost auction and bid again',
    '이번 경매를 이겨도 배팅 카드를 뺏기지 않는다': 'Win this auction without giving up your bid card',
    '상대가 낙찰받은 카드 1장을 훔친다': 'Steal 1 card the opponent has won',
    '이번 턴 진행자 권한을 뺏는다': 'Seize the auctioneer role for this turn',
    '경매품 2장을 덱에서 새로 뽑아 바꾼다': 'Replace both lot cards with fresh ones from the deck',
    '경매를 다시 한다!': 'The auction runs again!',
    '경매품이 통째로 바뀌었다!': 'The whole lot has been replaced!',
    '배팅 카드를 지킨다!': 'Your bid card is protected!',
    '상대 카드를 슬쩍했다!': 'Lifted a card from the opponent!',
    '상대의 시야를 가렸다!': "Blocked the opponent's view!",
    '상대의 전리품을 훔쳤다!': "Stole the opponent's prize!",
    '손패를 덱의 카드와 바꿨다!': 'Swapped a card with the deck!',
    '진행자 자리를 빼앗았다!': 'Seized the auctioneer seat!',
    '이번 경매는 약한 카드가 이긴다!': 'This auction, the weaker card wins!',
    '아이템 사용': 'Use Item',
    '사용': 'Use',
    '일반': 'Basic',
    '가지고 있지 않은 아이템이에요.': 'You do not have that item.',
    '없는 아이템이에요.': 'No such item.',
    '지금은 쓸 수 없는 아이템이에요.': 'That item cannot be used right now.',
    '지금은 쓸 수 없어요.': 'Cannot be used right now.',
    '이번 턴엔 이미 아이템을 썼어요.': 'You have already used an item this turn.',
    '배팅을 낸 뒤에는 쓸 수 없어요.': 'Cannot be used after you submit a bid.',
    '내 손패의 카드가 아니에요.': 'That card is not in your hand.',
    '상대 손패가 비어 있어요.': "The opponent's hand is empty.",
    '손패가 부족해요.': 'Not enough cards in hand.',
    '손패가 2장 이상이어야 진행자를 뺏을 수 있어요.': 'You need at least 2 cards to seize the auctioneer role.',
    '덱에 카드가 없어요.': 'The deck is empty.',
    '덱에 카드가 부족해요.': 'Not enough cards left in the deck.',
    '아직 경매품이 없어요.': 'There is no lot yet.',
    '아직 가져간 카드가 없어요.': 'You have not won any cards yet.',
    '상대가 가져간 카드가 없어요.': 'The opponent has not won any cards yet.',
    '이미 내가 진행자예요.': 'You are already the auctioneer.',
    '이미 뒤집혀 있어요.': 'It is already reversed.',

    // ── 다인전 안내 ──
    '대기방에 있어야 초대할 수 있어요.': 'You must be in the waiting room to invite.',
    '로그인해야 초대할 수 있어요.': 'Log in to send invites.',
    '이미 끝난 방이에요.': 'That room has already closed.',
    '서버가 혼잡해요. 잠시 후 다시 시도해주세요.': 'The server is busy. Please try again shortly.',
    'RP 정산': 'RP',
    'RP 미반영 — 같은 IP': 'No RP — same IP',
    'RP 미반영 — 사람': 'No RP — needs more humans',
    'RP 미반영 — 짧은 판': 'No RP — game too short',

    // ── 화면 라벨 ──
    'FLIP FLAP — 경매·블러핑 심리전 카드 보드게임': 'FLIP FLAP — an auction & bluffing card game',
    '로그인하면 랭크·코인·전적이 저장돼요': 'Log in to save your rank, coins and history',
    'AI 대전': 'vs AI',
    '⚡ 빠른 대전': '⚡ Quick Match',
    '빠른대전 (온라인)': 'Quick Match (online)',
    '➕ 방 만들기': '➕ Create Room',
    '# 코드로 참가': '# Join by Code',
    '열린 방': 'Open Rooms',
    '열린 방이 없어요. 방을 만들어보세요!': 'No open rooms — why not make one?',
    '방 이름': 'Room name',
    '게임 시작': 'Start game',
    '← 나가기': '\u2190 Leave',
    '빈자리': 'Empty seat',
    '기다리는 중': 'Waiting',
    '방장': 'Host',
    '모드': 'Mode',
    '게스트': 'Guest',
    '상대를 기다려요': 'Waiting for an opponent',
    '방장이 시작하길 기다리는 중…': 'Waiting for the host to start...',
    '클래식': 'Classic',
    '기본 규칙': 'Standard rules',
    '아이템전': 'Item Battle',
    '지면 아이템': 'Items when you lose',
    '다인전': 'Multiplayer',
    '3·4인': '3-4 players',
    '방장만 고를 수 있어요.': 'Only the host can choose.',
    '친구 초대': 'Invite a friend',
    '눌러서 부르기': 'Tap to invite',
    '친구 부르기': 'Invite friends',
    '지금 부를 수 있는 친구가 없어요.': 'No friends available right now.',
    '코드를 공유해 보세요.': 'Try sharing the room code.',
    '상대가 아직 없어요.': 'No opponent yet.',
    'AI와 하는 다인전은 솔로플레이에 있어요': 'Multiplayer against AI lives in Solo Play',
    '비밀번호': 'Password',
    '만들기': 'Create',
    '참가': 'Join',
    '시작': 'Start',
    '목록': 'List',
    '요청': 'Requests',
    '받은 요청': 'Received',
    '보낸 요청': 'Sent',
    '친구찾기': 'Find Friends',
    '친구의': "Friend's",
    '새로고침': 'Refresh',
    '코드 복사': 'Copy Code',
    '링크 복사': 'Copy Link',
    '💬 카톡 공유': '💬 Share on KakaoTalk',
    '🌐 공개': '🌐 Public',
    '🔒 비밀': '🔒 Private',
    '종료 ×': 'Close ×',
    '상대를 찾는 중': 'Looking for an opponent',
    '서버 연결 중…': 'Connecting...',
    '상대 연결 끊김': 'Opponent disconnected',
    '재접속 안 하면 몰수승!': 'If they do not return, you win by forfeit!',
    '게임 나가기': 'Leave Game',
    '게임 설명': 'Game Guide',
    '게임에서 나갈까요?': 'Leave this game?',
    '계속하기': 'Keep Playing',
    '내 손패': 'Your Hand',
    '턴 -': 'Turn -',
    '아직 안 나온 카드': 'Cards not yet seen',
    '이미 나옴': 'Already seen',
    '상대 이모트 차단': 'Mute opponent emotes',
    '🔔 상대 이모트': '🔔 Opponent Emotes',
    '🎵 배경음악': '🎵 Music',
    '🔊 효과음': '🔊 Sound Effects',
    '🌐 언어': '🌐 Language',
    '🌐 언어 / Language': '🌐 Language',
    '3인전': '3 Players',
    '4인전': '4 Players',
    'AI 2명': '2 AI',
    'AI 3명': '3 AI',
    '손패 6장': '6 cards each',
    '※ 베타 — 전적·코인에 반영되지 않습니다': '※ Beta — does not affect your record or coins',
    '진행자도 함께 입찰합니다 (첫 경매만 제외)': 'The auctioneer bids too',
    '배팅 카드는': 'Bid cards go',
    '약하게 부른 사람부터': 'to the weakest bidder first',
    '강한 경매품을 가져갑니다': '— they take the strongest card',
    '경매품 공개 · 배팅 비밀': 'Lot shown, bids hidden',
    '경매품 비밀 · 배팅 공개': 'Lot hidden, bids shown',
    '접속 중인 친구만 부를 수 있어요.': 'Only friends who are online can be invited.',
    '상대 정보': 'Player Info',
    '명패 고르기': 'Choose a Name Plate',
    '이름 옆에 붙는 명패예요. 효과는 대전 보상에 바로 반영됩니다.': 'A plate shown beside your name. Its effect applies to match rewards immediately.',
    '환영합니다!': 'Welcome!',
    '게임에서 사용할': 'Choose the',
    '닉네임': 'nickname',
    '을 정해주세요.': 'you will use in game.',
    '다른 플레이어에게 이 이름으로 보여요.': 'This is how other players will see you.',
    '이 닉네임으로 시작': 'Start with this name',
    '나중에 정할게요': "I'll decide later",
    '지금 안 정하면, 나중엔 상점의 닉네임 변경권이 필요할 수 있어요': 'If you skip now, you may need a Nickname Change Ticket from the shop later',
    '계정 삭제': 'Delete Account',
    '탈퇴 시 전적·코인·아이템이 모두 사라지며 되돌릴 수 없어요.': 'Deleting your account erases your record, coins and items permanently.',
    '을 정확히 입력하세요.': 'exactly to confirm.',
    '다 채우면': 'When complete, press',
    '을 눌러 코인을 받으세요 · 매일 자정 리셋': 'to collect your coins · resets daily at midnight',
    '아래 버튼을 눌러 뽑아보세요': 'Press a button below to roll',
    '1회': 'x1',
    '10연': 'x10',
    '졸개의 배신! 6-10이 2-1을 잡았다': "The Servant's Betrayal! 6-10 takes down 2-1",
    '▸ 화면을 탭하면 계속': '▸ Tap anywhere to continue',

    // ── 게임 진행 안내 ──
    '서버 연결됨': 'Connected',
    '서버 연결 실패': 'Connection failed',
    '연결 끊김 — 재접속 중…': 'Disconnected — reconnecting...',
    '상대 재접속됨': 'Opponent reconnected',
    '상대가 나갔어요.': 'Your opponent left.',
    '상대가 게임을 떠났어요 — 몰수승!': 'Your opponent left the game — you win by forfeit!',
    '접속이 끊겨 몰수패 처리됐어요.': 'You were disconnected and lost by forfeit.',
    '상대 시간 초과!': "Opponent's time is up!",
    '시간 초과...': 'Out of time...',
    '진행자(AI) 먼저 배팅 중': 'The AI auctioneer is bidding first',
    '진행자가 먼저 배팅합니다 — 대기 중': 'The auctioneer bids first — please wait',
    'AI 배팅 중': 'AI is bidding',
    'AI 생각 중': 'AI is thinking',
    'AI가 뽑는 중': 'AI is drawing',
    '상대가 고르는 중...': 'Opponent is choosing...',
    '상대가 방식 선택 중...': 'Opponent is choosing the auction type...',
    '상대가 출품 중...': 'Opponent is offering a card...',
    '상대가 카드를 뽑는 중...': 'Opponent is drawing a card...',
    '배팅 완료 — 대기 중...': 'Bid submitted — waiting...',
    '카드 정산 중…': 'Settling cards...',
    '중앙 카드 공개 — 출품할 카드를 선택하세요': 'Center card revealed — pick a card to offer',
    '경매 방식 선택 — 출품카드는 다른 손패 클릭 시 교체돼요': 'Choose the auction type — tap another card to swap your offer',
    '내 배팅 (선택 중)': 'Your bid (choosing)',
    '내 선택 ✓': 'Your pick ✓',
    '상대 선택': "Opponent's pick",
    '출품카드': 'Offered card',
    '세트 근접도가 완전히 같아요!': 'You are exactly as close to a set as each other!',
    '상대가 세트에 더 가까웠어요.': 'Your opponent was closer to a set.',
    '무승부!': 'Draw!',
    '승': 'W', '패': 'L', '무': 'D',
    '총 승리': 'Total wins',
    '총 RP': 'Total RP',
    '재대결': 'Rematch',
    '상대에게 재대결 신청 — 대기 중…': 'Rematch requested — waiting...',
    '⚔️ 승자에게 도전하기': '⚔️ Challenge the winner',
    '⚔️ 도전장 전송 — 수락 대기…': '⚔️ Challenge sent — waiting for a reply...',
    '⚔️ 배팅 완료 — 곧 공개!': '⚔️ Bids are in — revealing soon!',
    '도전 받기': 'Accept Challenge',
    '도전장을 보내지 못했어요.': 'Could not send the challenge.',
    '친구가 대전을 신청했어요. 지금 바로 대결할까요?': 'A friend has challenged you. Play now?',
    '관전하던 유저가 대전을 신청했어요. 받아들일까요?': 'A spectator has challenged you. Accept?',
    '받아들인다!': 'Accept!',
    '나중에': 'Later',
    '나중에 할게요': 'Maybe later',
    '수락': 'Accept',
    '거절': 'Decline',
    '수락하고 입장': 'Accept & Join',
    '게임 참가하기': 'Join Game',
    '게임 하러 가기': 'Go Play',
    '돌아가기': 'Back',
    '비밀방은 비밀번호를 입력해야 해요.': 'Private rooms need a password.',
    '❌ 비밀번호가 틀렸어요. 다시 입력하세요': '❌ Wrong password — try again',
    '방을 만드는 중…': 'Creating room...',
    '만드는 중…': 'Creating...',
    '확인 중…': 'Checking...',
    '요청 중…': 'Sending...',
    '⚠️ 서버 연결이 늦어지고 있어요 — 잠시 후 새로고침해 주세요': '⚠️ The server is slow to respond — try refreshing in a moment',
    '⚠️ 이전 게임이 끝나 로비로 돌아가요': '⚠️ The previous game ended — returning to the lobby',
    'AI 대전은 언제든 다시 시작할 수 있어요.': 'You can start an AI game again any time.',
    '컴퓨터와의 대전이에요': 'This is a game against the computer',
    '다른 기기(또는 창)에서 같은 계정으로 접속했어요.': 'This account was opened on another device or window.',
    '이 창의 연결을 종료합니다.': 'This session will be closed.',
    '⏳ 이모트는 3초에 한 번만 보낼 수 있어요': '⏳ You can send an emote once every 3 seconds',

    // ── 보상 안내 ──
    '보상 지급 제외': 'No reward',
    '너무 짧은 판 — 보상 없음': 'Game too short — no reward',
    '같은 상대 반복 대전 — 보상 없음': 'Too many games with the same opponent — no reward',
    '같은 접속에서의 대전 — 보상 없음': 'Same connection — no reward',
    '같은 접속·친선 대전 — 보상 없음': 'Same connection or friendly — no reward',
    '오늘의 싸이클링 완성!': "Today's Cycling complete!",
    '튜토리얼 완료!': 'Tutorial complete!',
    '지급!': 'awarded!',

    // ── 상점·뽑기 안내 ──
    '상점은 로그인하면 이용할 수 있어요!': 'Log in to use the shop!',
    '미션은 로그인하면 이용할 수 있어요!': 'Log in to use missions!',
    '상점을 불러오지 못했어요. 잠시 후 다시 열어주세요.': 'Could not load the shop. Please try again shortly.',
    '뽑기에 실패했어요': 'The roll failed',
    '교환에 실패했어요': 'The exchange failed',
    '교환': 'Exchange',
    '교환할 수 있는 게 없어요': 'Nothing to exchange',
    '목록을 불러오는 중…': 'Loading list...',
    '보유 중 ✓': 'Owned ✓',
    '이미 가진 것': 'Already owned',
    '장착하기': 'Equip',
    '장착 해제': 'Unequip',
    '사용 중': 'In use',
    '천장': 'Pity',
    '표시된 확률은 천장까지 반영한 실제 값입니다.': 'The rates shown include the pity system — they are the real odds.',
    '쿠폰 번호를 입력해주세요.': 'Please enter a coupon code.',
    '쿠폰을 사용했어요!': 'Coupon redeemed!',
    '로그인하면 쿠폰을 쓸 수 있어요.': 'Log in to use coupons.',
    '✅ 구매 완료!': '✅ Purchased!',
    '✓ 복사됨': '✓ Copied',
    '복사하세요:': 'Copy this:',
    '링크를 복사했어요! 친구에게 붙여넣어 보내세요.': 'Link copied! Paste it to a friend.',
    '링크를 복사했어요! 친구에게 붙여넣어 도전장을 보내세요.': 'Link copied! Paste it to send a challenge.',
    '공유를 지원하지 않는 브라우저예요. 링크를 복사했으니 카톡에 붙여넣어 보내세요!': 'This browser cannot share directly — the link is copied, just paste it.',
    'FLIP FLAP 초대': 'FLIP FLAP invite',
    'FLIP FLAP 도전장': 'FLIP FLAP challenge',
    'FLIP FLAP에 오신 걸 환영해요!': 'Welcome to FLIP FLAP!',

    // ── 색 이름 (닉네임 염색) ──
    '빨강': 'Red', '파랑': 'Blue', '초록': 'Green', '주황': 'Orange', '보라': 'Purple',
    '청록': 'Teal', '핑크': 'Pink', '라임': 'Lime', '왼쪽': 'Left',

    // ── 친구·클랜 화면 ──
    '친구 신청을 보냈어요.': 'Friend request sent.',
    '친구가 됐어요!': 'You are now friends!',
    '친구 목록에서 서로 사라져요.': 'You will disappear from each other\u2019s friend list.',
    '아직 친구가 없어요.': 'No friends yet.',
    '받은 요청이 없어요.': 'No requests received.',
    '보낸 요청이 없어요.': 'No requests sent.',
    '신청취소': 'Cancel request',
    '나예요.': 'That is you.',
    '클랜장': 'Leader',
    '부클랜장': 'Co-leader',
    '클랜원': 'Members',
    '클랜 만들기': 'Create Clan',
    '클랜 찾기': 'Find Clans',
    '클랜 이름 (2~12자)': 'Clan name (2–12 characters)',
    '태그 (영문·숫자 2~4자)': 'Tag (2–4 letters or digits)',
    '클랜 공지 (최대 60자)': 'Clan notice (up to 60 characters)',
    '클랜을 만들면 클랜장이 됩니다. 클랜원은 최대 30명이에요.': 'Creating a clan makes you its leader. Up to 30 members.',
    '아직 만들어진 클랜이 없어요.': 'No clans have been created yet.',
    '첫 번째 클랜을 만들어보세요!': 'Be the first to make one!',
    '클랜에서 탈퇴할까요?': 'Leave the clan?',
    '클랜에서 탈퇴했어요.': 'You left the clan.',
    '클랜에서 즉시 제외됩니다.': 'They will be removed from the clan immediately.',
    '클랜이 해체되었어요.': 'The clan was disbanded.',
    '클랜장 자리는 남은 클랜원 중 RP가 가장 높은 사람에게 넘어가요. 혼자라면 클랜이 해체됩니다.': 'Leadership passes to the remaining member with the highest RP. If you are alone, the clan is disbanded.',
    '이후에는 클랜을 관리할 수 없게 됩니다.': 'You will no longer be able to manage the clan.',
    '언제든 다시 가입 신청할 수 있어요.': 'You can apply to join again any time.',
    '탈퇴': 'Leave',
    '탈퇴(위임)': 'Leave (hand over)',
    '위임': 'Hand over',
    '추방': 'Kick',
    '아직 대화가 없어요.': 'No messages yet.',
    '첫 메시지를 남겨보세요!': 'Say something first!',
    '클랜원에게 메시지…': 'Message your clan...',
    '클랜원만 볼 수 있어요 · 메시지를 누르면 신고·차단': 'Clan members only · tap a message to report or block',
    '보내기': 'Send',
    '신고': 'Report',
    '차단': 'Block',
    '부적절한 내용': 'Inappropriate content',
    '이 메시지를 신고할까요?': 'Report this message?',
    '이 사람의 메시지가 보이지 않게 돼요. 언제든 해제할 수 있어요.': 'You will stop seeing their messages. You can undo this any time.',
    '이름만 보여요': 'Name only',
    '아직 랭킹이 없어요. 첫 플레이어가 되어보세요!': 'No rankings yet — be the first!',

    // ── 계정 ──
    '닉네임을 입력해주세요.': 'Please enter a nickname.',
    '닉네임에 바로 적용됐어요!': 'Applied to your nickname!',
    '닉네임을 지금 안 정할까요?': 'Skip choosing a nickname for now?',
    '나중에 바꾸려면 상점의 닉네임 변경권이 필요할 수 있어요.': 'Changing it later may need a Nickname Change Ticket from the shop.',
    '지금 정하기': 'Choose now',
    '지금 바꿀 수 있어요': 'You can change it now',
    '정말 계정을 삭제할까요?': 'Really delete your account?',
    '전적·레벨·코인·아이템·칭호가 모두 영구 삭제되며 복구할 수 없어요.': 'Your record, level, coins, items and titles are permanently deleted and cannot be restored.',
    '진행 중인 게임은 몰수패로 처리될 수 있어요.': 'Any game in progress may be recorded as a forfeit loss.',
    '마지막 확인이에요': 'One last check',
    '본인 확인을 위해 비밀번호를 입력해주세요.': 'Enter your password to confirm.',
    '로그인 상태에서만 삭제할 수 있어요.': 'You must be logged in to delete your account.',
    '이 작업은 되돌릴 수 없습니다. 정말 진행할까요?': 'This cannot be undone. Continue?',
    '영구 삭제': 'Delete permanently',
    '삭제하기': 'Delete',
    '삭제': 'Delete',
    '삭제에 실패했어요.': 'Deletion failed.',
    '계정이 삭제됐어요. 이용해주셔서 감사합니다.': 'Your account has been deleted. Thank you for playing.',
    '실패했어요.': 'That failed.',
    '보내지 못했어요': 'Could not send',
    '보내지 못했어요.': 'Could not send.',

    // ── 설치 안내 ──
    '아이폰 설치 방법 📲': 'Install on iPhone 📲',
    '안드로이드 설치 방법 📲': 'Install on Android 📲',
    '브라우저 메뉴(⋮)를 누르고': 'Open the browser menu (⋮)',
    '브라우저 메뉴에서 "앱 설치"를 눌러 설치할 수 있어요!': 'Choose "Install app" from the browser menu.',
    '홈 화면에 FLIP FLAP 앱이 생겨요.': 'FLIP FLAP will appear on your home screen.',
    '건너뛰기 (Skip)': 'Skip',

    // ── 튜토리얼 (문장 통째로) ──
    // <b> 가 섞여 있어 조각 번역이 안 된다. tutShow 가 통째로 t() 를 태운다.
    '30초면 규칙을 다 배워요. 튜토리얼을 해볼까요? (완료하면 \ud83e\ude99100 보상!)':
      'You can learn the rules in 30 seconds. Try the tutorial? (\ud83e\ude99100 when you finish!)',
    '\ud83c\udf93 튜토리얼 하기': '\ud83c\udf93 Start Tutorial',
    '먼저 <b>선공 뽑기</b>!': 'First, <b>draw for first turn</b>!',
    '반짝이는 두 장 중 <b>한 장을 탭</b>하세요 — 강한 카드를 뽑으면 선공!':
      '<b>Tap one</b> of the two glowing cards — the stronger card goes first!',
    '카드 공개! 강한 카드를 뽑은 쪽이 첫 <b>경매 진행자</b>가 돼요. (진행자는 매 턴 교대)':
      'Cards revealed! Whoever drew stronger becomes the first <b>auctioneer</b>. (It alternates each turn.)',
    '이번 턴 진행자는 <b>나</b>! 경매품부터 공개해볼까요?':
      'You are the <b>auctioneer</b> this turn. Let\u2019s reveal the lot.',
    '왼쪽 <b>덱을 탭</b>!': '<b>Tap the deck</b> on the left!',
    '중앙 카드가 공개됐어요! 이제 <b>내 손패 1장</b>을 추가로 출품 — 이 2장이 경매품이 돼요.':
      'The center card is out! Now add <b>one card from your hand</b> — those two become the lot.',
    '아래 손패에서 <b>내놓을 카드를 탭</b>하세요': '<b>Tap the card you want to offer</b> from your hand below',
    '원하는 방식을 <b>탭</b>하세요': '<b>Tap</b> the type you want',
    '<b>배팅!</b> 강한 카드를 낸 사람이 경매품 2장을 다 가져가요. \u26a0\ufe0f 배팅한 카드는 <b>서로 교환</b>돼요.':
      '<b>Bid!</b> The stronger card takes both cards of the lot. \u26a0\ufe0f The bid cards are then <b>swapped between you</b>.',
    '손패에서 카드 탭 → <b>배팅 확정</b>': 'Tap a card, then <b>Confirm bid</b>',
    '두구두구… 결과 공개! 이긴 쪽이 경매품을 <b>자기 앞에</b> 깔아요.':
      'And the reveal! The winner lays the lot <b>in front of them</b>.',
    '\ud83c\udfaf 방금 딴 카드가 <b>테이블 앞에</b> 깔렸죠? <b>이렇게 깔린 카드로만</b> 세트를 만들 수 있어요 — 손에 든 카드는 세트가 안 돼요!':
      '\ud83c\udfaf See the cards you just won laid <b>in front of you</b>? <b>Only those</b> count toward a set — cards in hand do not!',
    '이번 턴 진행자는 <b>상대</b>예요. 곧 배팅 차례가 오니 잠깐만 \u2615':
      'Your <b>opponent</b> is auctioneer this turn. Your bid is coming up \u2615',
    '\ud83d\udc40 지금 손에 <b>6-10</b>이 있어요 — 상대가 2-1을 낼 것 같으면 <b>배신</b>을 노려보세요!':
      '\ud83d\udc40 You are holding <b>6-10</b> — if you think they will play 2-1, go for the <b>betrayal</b>!',
    '\ud83d\udc40 지금 손에 <b>2-1</b>이 있어요 — 최강이지만 <b>6-10</b>한테만 져요. 조심!':
      '\ud83d\udc40 You are holding <b>2-1</b> — the strongest card, but <b>6-10</b> beats it. Careful!',

    // ── 게임 상태 줄 ──
    '\ud83c\udccf 카드를 골라 선공을 정하세요!': '\ud83c\udccf Pick a card to decide who goes first!',
    '\ud83c\udca0 중앙덱을 클릭해 카드를 뽑으세요': '\ud83c\udca0 Tap the deck to draw a card',
    '게스트 (기록 없음)': 'Guest (no saved record)',

    // ── 다인전 화면 ──
    '내가 진행자! 덱을 눌러 카드를 뽑으세요': 'You are the auctioneer — tap the deck to draw',
    '내 차례! 마지막이라 앞사람 카드를 다 보고 정할 수 있어요':
      'Your turn — you bid last, so you can see every card before you',
    '출품 선택 중': 'Choosing offer',
    '배팅 선택 중': 'Choosing bid',

    // ── AI 이름 (다인전 상대) ──
    '경매왕 덕배': 'Auction King Deokbae',
    '허세왕 태식': 'Bluff King Taesik',
    '눈치백단 재훈': 'Sharp-Eyed Jaehoon',
    '한방 규현': 'One-Shot Gyuhyeon',
    '구두쇠 만수': 'Miser Mansu',
    '노림수 은지': 'Schemer Eunji',
    '침착한 소연': 'Calm Soyeon',
    '카운팅 지민': 'Counter Jimin',
    '큰손 미스박': 'Big Spender Park',
    '도박사 병철': 'Gambler Byeongcheol',

    '가입신청': 'Apply',
    '「친구찾기」에서 닉네임으로 추가해보세요!': 'Add someone by nickname from "Find Friends"!',
    '아직 아이템이 없어요 — 상점 구경 가기': 'No items yet — take a look at the shop',
    '중복은 파편이 됩니다 ·': 'Duplicates become shards ·',
    '교환소': 'Exchange',

    // ── 닉네임 규칙 안내 ──
    '닉네임 (2~8자)': 'Nickname (2\u20138 characters)',
    '닉네임은 2자 이상이어야 해요.': 'Your nickname needs at least 2 characters.',
    '닉네임은 8자 이내여야 해요.': 'Your nickname can be at most 8 characters.',
    '자음·모음만으로는 만들 수 없어요.': 'Letters alone (like \u314b\u314b) are not allowed.',
    '사용할 수 없는 표현이 들어 있어요.': 'That contains language we do not allow.',
    '사용할 수 없는 닉네임이에요.': 'That nickname cannot be used.',

    // ── 인게임 채팅 ──
    '채팅': 'Chat',
    '친구·클랜 채팅': 'Friend & clan chat',
    '‹ 목록': '\u2039 List',
    '메시지…': 'Message...',
    '아직 대화가 없어요': 'No messages yet',
    '로그인하면 채팅할 수 있어요': 'Log in to chat',
    '오프라인': 'Offline',
    '친구끼리만 대화할 수 있어요.': 'You can only chat with friends.',
    '상대를 찾을 수 없어요.': 'Could not find that player.',
    '내용을 입력해주세요.': 'Please type something.',
    '조금 천천히 보내주세요.': 'Please slow down a little.',
    '잠시 후 다시 보내주세요.': 'Please try again in a moment.',
    '사용할 수 없는 표현이 있어요.': 'That contains language we do not allow.',
    '클랜에 가입해야 채팅할 수 있어요.': 'Join a clan to use clan chat.',

    // ── 미니게임 (두 장 승부) ──
    '미니게임': 'Mini Game',
    '두 장 승부': 'Two-Card Duel',
    '족보 보기': 'Hand ranks',
    '설명서': 'How to play',
    '한 판 더': 'Play again',
    '족보': 'Hand ranks',
    '공개!': 'Showdown!',
    '승리!': 'You win!',
    '패배': 'You lose',
    '무승부': 'Draw',
    '넘기기': 'Pass',
    '카드를 눌러 확인하세요.': 'Tap your cards to look.',
    '이 판 승': 'Winner',
    '판 열기': 'Open',
    '크게 올림': 'Raise big',
    '살짝 올림': 'Raise small',
    '두 배 올림': 'Double up',
    '전부 걸기': 'Push all',
    '선': 'First',
    '일어서기': 'Stand up',
    '온라인 대전': 'Play online',
    'AI와 대전': 'Play vs AI',
    '상대를 찾는 중…': 'Looking for players...',
    '20초 안에 안 차면 AI가 빈자리를 채웁니다.': 'Empty seats are filled by AI after 20 seconds.',
    '테이블이 닫혔어요.': 'The table closed.',
    '연결이 끊겼어요.': 'You were disconnected.',
    '빈자리': 'Empty seat',
    '다음 판': 'Next hand',
    '기다리는 중…': 'Waiting...',
    '정산': 'Cash out',
    '첫 번째 배팅': 'First betting round',
    '두 번째 걸기': 'Second round',
    '공개!': 'Showdown!',
    '남은 사람이 가져갑니다.': 'The last one standing takes it.',
    '모두 접어서 끝난 판입니다. 패는 안 깝니다.': 'Everyone else folded — no cards are shown.',
    '아직 한 장 — 두 번째 장을 받아야 족보가 나옵니다.':
      'Only one card yet — the rank appears once you get the second.',
    '이미 자리에 앉아 있어요.': 'You are already at a table.',
    '자리에 앉아 있지 않아요.': 'You are not at a table.',
    '아직 판이 안 끝났어요.': 'This hand is not over yet.',
    '2인': '2 players',
    '3인': '3 players',
    '4인': '4 players',
    '맞추기': 'Match',
    '접기': 'Fold',
    '접음': 'Folded',
    '땡': 'Pair',
    '짝': 'Match',
    '끗': 'Sum',
    '졸개의 배신': 'Pawn\u2019s Betrayal',
    '가장 약한 두 장 · 땡을 전부 잡는다': 'Weakest two cards · beats every Pair',
    '지금 내 패': 'your hand',
    '졸개의 배신 — 땡은 전부 잡습니다. 땡이 아니면 가장 약한 패예요.':
      'Mirror 10 \u2014 beats both Overlord and Premium (the lit rungs).',
    '미니게임은 로그인하면 즐길 수 있어요!': 'Log in to play the mini game!',
    '진행 중인 판이 없어요.': 'No hand in progress.',
    '금액이 올바르지 않아요.': 'That amount is not valid.',
    '위로 갈수록 강합니다. 앞자리(큰 숫자) 두 장의 합으로 정합니다.':
      'Stronger toward the top. Ranked by the sum of the two big numbers.',
    '카드 두 장을 받아 서로 안 보이게 쥐고 배팅합니다.':
      'Each player takes two cards, keeps them hidden, and bets.',
    '같은 종류면 땡, 등급이 같으면 짝, 나머지는 끗.': 'Same kind = Pair, same grade = Match, else Sum.',

    // ── 토너먼트 ──
    '토너먼트': 'Tournament',
    '8강 · \ud83e\ude99200': 'Top 8 · \ud83e\ude99200',
    '곧 시작해요. 다음 회차에 참가해주세요.': 'Starting now — please join the next one.',
    '뒤 시작': 'until start',

    '\ud83e\ude99200 내고 참가': 'Enter for \ud83e\ude99200',
    '나가기 (참가비 환불)': 'Leave (entry fee refunded)',
    '빈 자리': 'Empty',
    '8강': 'Quarterfinal',
    '4강': 'Semifinal',
    '결승': 'Final',
    '\ud83c\udfc6 우승!': '\ud83c\udfc6 Champion!',
    '\ud83e\udd48 준우승': '\ud83e\udd48 Runner-up',
    '\ud83c\udfc6 대진표로': '\ud83c\udfc6 Back to bracket',
    '곧 경기가 시작돼요…': 'Your match will start shortly...',
    '내 경기가 시작되면 자동으로 판이 열려요.': 'Your match opens automatically when it starts.',
    '아쉽지만 상금은 없어요. 다음 대회에서 만나요!': 'No prize this time — see you in the next one!',
    '로그인해야 참가할 수 있어요.': 'You need to log in to enter.',
    '게임 중에는 참가할 수 없어요.': 'You cannot enter while in a game.',
    '이미 참가 중이에요.': 'You have already entered.',
    '이미 진행 중인 대회가 있어요. 잠시 후 다시 시도해주세요.': 'A tournament is already running. Please try again shortly.',
    '이미 진행 중인 대회가 있어요. 참가비를 돌려드렸어요.': 'A tournament is already running — your entry fee was refunded.',
    '토너먼트 우승': 'Tournament Champion',
    '토너먼트 강자': 'Tournament Contender',
    '무관의 제왕': 'Crownless King',
    '토너먼트 우승 1회': 'Win 1 tournament',
    '토너먼트 우승 5회': 'Win 5 tournaments',
    '토너먼트 우승 20회': 'Win 20 tournaments',

    // ── 친구·클랜 ──
    '접속 중': 'Online',
    '게임 중': 'In game',
    '접속 중 아님': 'Offline',
    '초대': 'Invite',
    '도전장': 'Challenge',
    '친구 신청': 'Add Friend',
    '게스트에게는 친구 신청을 보낼 수 없어요.': 'You cannot send a friend request to a guest.',
    '로그인하면 친구 신청을 보낼 수 있어요.': 'Log in to send friend requests.',
    '아직 친구가 없어요': 'No friends yet',
    '지금 게임 중이에요.': 'They are in a game right now.',
    '친구만 초대할 수 있어요.': 'You can only invite friends.',
    '지금 접속 중이 아니에요.': 'They are not online right now.',
    '자리가 다 찼어요.': 'All seats are taken.',

    // ── 안내·오류 ──
    '로그인이 필요해요.': 'You need to log in.',
    '이미 받았어요.': 'Already claimed.',
    '아직 다 못 채웠어요.': 'Not finished yet.',
    '없는 미션이에요.': 'No such mission.',
    '오늘 미션이 아니에요.': "That is not today's mission.",
    '잠시 후 다시 시도해 주세요.': 'Please try again in a moment.',
    '서버가 혼잡해요.': 'The server is busy.',
    '코인이 부족해요.': 'Not enough coins.',
    '바꾸지 못했어요': 'Could not change that',
    '문제가 생겼어요. 잠시 후 다시 시도해주세요.': 'Something went wrong. Please try again.',
  };

  // 값이 섞이는 문구는 통째로 짝지을 수 없다. 한국어 쪽 모양을 정규식으로 잡고
  // 영어 자리에 그대로 끼워 넣는다. ($1, $2 … 가 잡힌 값)
  const PATTERNS = [
    [/^내 차례 · (\d+)초 · 소지금 (\d+)달$/, 'Your turn \u00b7 $1s \u00b7 $2 Moons'],
    [/^내 차례 · (\d+)초 · 소지금 (\d+)달 · 맞출 돈 (\d+)달$/,
      'Your turn \u00b7 $1s \u00b7 $2 Moons \u00b7 to match $3'],
    [/^내 차례 · 소지금 (\d+)달$/, 'Your turn \u00b7 $1 Moons'],
    [/^내 차례 · 소지금 (\d+)달 · 맞출 돈 (\d+)달$/, 'Your turn \u00b7 $1 Moons \u00b7 to match $2'],
    [/^(\d+) 달 → $/, '$1 Moons \u2192 '],
    [/^(\d+) 달$/, '$1 Moons'],
    [/^\+(\d+) 달$/, '+$1 Moons'],
    [/^-(\d+) 달$/, '-$1 Moons'],
    [/^기다리는 중 (\d+)\/(\d+)$/, 'Waiting $1\/$2'],
    [/^다음 판 \((\d+)\/(\d+)\)$/, 'Next hand ($1\/$2)'],
    [/^(\d+)초 뒤 다음 판$/, 'Next hand in $1s'],
    [/^\/ (\d+)$/, '/ $1'],
    [/^(.+) 님이 고민하고 있어요…$/, '$1 is thinking...'],
    [/^\ud83e\ude99 (\d+) 회수 \((\+?-?\d+)\)$/, '\ud83e\ude99 $1 back ($2)'],
    [/^\ud83e\ude99 (-?\d+)$/, '\ud83e\ude99 $1'],
    [/^\ud83e\ude99 \+(\d+)$/, '\ud83e\ude99 +$1'],
    [/^콜 \ud83e\ude99(\d+)$/, 'Call \ud83e\ude99$1'],
    [/^내 배팅 \ud83e\ude99(\d+) · 상대 \ud83e\ude99(\d+)$/, 'You \ud83e\ude99$1 \u00b7 Opponent \ud83e\ude99$2'],
    [/^종류 합 (\d+) · 등급 합 (\d+)$/, 'Kind sum $1 \u00b7 grade sum $2'],
    [/^← 강함 · 여덟 자리 중 (\d+)번째 · 약함 →$/, '\u2190 strong \u00b7 rank $1 of 8 \u00b7 weak \u2192'],
    [/^(.+) \(합 (\d+)\)$/, '$1 (sum $2)'],
    [/^덱 (\d+)장$/, 'Deck $1'],
    [/^덱 (\d+)장 남음$/, '$1 left in deck'],
    [/^턴 (\d+)$/, 'Turn $1'],
    [/^(\d+)턴$/, 'Turn $1'],
    [/^(\d+)명 입장$/, '$1 joined'],
    [/^(\d+)인전 시작$/, 'Start $1-player game'],
    [/^Lv\.?(\d+)$/i, 'Lv.$1'],
    [/^(\d+)판$/, '$1 games'],
    [/^(\d+)승 (\d+)패$/, '$1W $2L'],
    [/^(\d+)\/(\d+)$/, '$1/$2'],
    [/^(.+) 님이 출품하는 중…$/, '$1 is offering a card...'],
    [/^(.+) 님이 방식을 고르는 중…$/, '$1 is choosing the auction type...'],
    [/^(.+) 님이 카드를 공개하는 중…$/, '$1 is revealing a card...'],
    [/^(.+) 님이 내는 중… \(순서대로 공개\)$/, '$1 is bidding... (revealed in order)'],
    [/^(.+) 님이 낙찰!$/, '$1 wins the lot!'],
    [/^내 차례! 뒤에 (\d+)명이 내 카드를 보고 냅니다$/, 'Your turn — $1 player(s) will bid after seeing your card'],
    [/^🪙 (\d+) 수령$/, 'Claim $1'],
    [/^🔷 (\d+) 파편$/, '$1 shards'],
    [/^(\d+) 파편$/, '$1 shards'],
    [/^(\d+)번 \((\d+)등급\) 배팅 확정$/, 'Confirm bid: $1 (rank $2)'],
    [/^(\d+)번 \((\d+)등급\) 출품 확정$/, 'Confirm offer: $1 (rank $2)'],
    [/^(\d+)짜리 · (\d+)장 \(등급 1–(\d+)\)$/, 'Kind $1 — $2 cards (ranks 1–$3)'],
    // 조각을 이어 붙여 만드는 문구들 — 원문이 소스에 통째로 없어 사전으로는 못 잡는다
    [/^\u{1F441} 오픈\(배팅 비밀\) — 손패에서 배팅 카드 선택!$/u, '\u{1F441} Open (bids hidden) — pick your bid card!'],
    [/^\u{1F648} 클로즈\(배팅 공개\) — 손패에서 배팅 카드 선택!$/u, '\u{1F648} Closed (bids shown) — pick your bid card!'],
    [/^내 배팅 \u2713$/, 'Your bid \u2713'],
    [/^상대 배팅 \u2713$/, 'Opponent bid \u2713'],
    [/^(.+) 배팅 \u2713$/, '$1 bid \u2713'],
    [/^(.+) 배팅$/, '$1 bid'],
    [/^게스트(\d+)$/, 'Guest$1'],
    [/^\u26a1 (.+) 선공!$/, '\u26a1 $1 goes first!'],
    [/^(.+) 님이 낙찰!\s+\(내 손패로 (\d+)-(\d+) 들어옴\)$/, '$1 wins the lot!  ($2-$3 comes into your hand)'],
    [/^내가 낙찰!\s+\(내 손패로 (\d+)-(\d+) 들어옴\)$/, 'You win the lot!  ($1-$2 comes into your hand)'],
    [/^(\d+)승 (\d+)패 ·$/, '$1W $2L ·'],
    [/^· 승률 (\d+)%$/, '· $1% win rate'],
    [/^(\d+)회 (\d+)$/, 'x$1 \u00b7 $2'],
    [/^(\d+)연 (\d+)$/, 'x$1 \u00b7 $2'],
    [/^파편부터 원하는 것을 확정으로 바꿀 수 있어요 — 위$/, 'shards let you pick exactly what you want — see'],
    [/^탭 \(지금 (\d+)개\)$/, 'tab (you have $1)'],
    [/^(\d+)\/(\d+)명 · (\d+) RP · 클랜장 (.+)$/, '$1/$2 members \u00b7 $3 RP \u00b7 Leader $4'],
    [/^다음 대회는 (\d+:\d+) 시작 \((.+)\) 뒤\)$/, 'Next tournament at $1 (in $2)'],
    [/^다음 대회는 (\d+:\d+) 시작 \((.+) 뒤\)$/, 'Next tournament at $1 (in $2)'],
    [/^지금은 대회가 진행 중이에요\. 다음 회차는 (\d+:\d+) 시작$/, 'A tournament is running. Next one starts at $1'],
    [/^(\d+)분 (\d+)초$/, '$1m $2s'],
    [/^(\d+)위$/, 'Rank $1'],
    [/^상금 \ud83e\ude99 (\d+)$/u, 'Prize \ud83e\ude99 $1'],
    [/^(\d+)\/(\d+)명 · 시작할 때 빈 자리는 AI 가 채워요$/, '$1/$2 joined · empty seats are filled by AI at start'],
    [/^탈락했어요 — 최종 (\d+)위\. 남은 경기를 지켜보세요\.$/, 'You are out — finished $1. Watch the rest.'],
    [/^(\d+)\/(\d+) 리치!$/, '$1/$2 — one away!'],
    [/^완성까지 (\d+)장$/, '$1 more to complete'],
  ];

  // ── 언어 고르기 ─────────────────────────────────────────────────────────
  const KEY = 'ff_lang';
  const SUPPORTED = ['ko', 'en'];
  // 저장해 둔 게 없으면 기기 언어를 따른다. 한국어권이면 한국어, 아니면 영어.
  function detect() {
    const list = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || 'en'];
    for (const l of list) {
      const s = String(l || '').toLowerCase();
      if (s.startsWith('ko')) return 'ko';
    }
    return 'en';
  }
  let lang = null;
  function getLang() {
    if (lang) return lang;
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (_) {}
    lang = SUPPORTED.includes(saved) ? saved : detect();
    return lang;
  }
  // 아직 사람이 고른 적이 없는가 (가입할 때 물어볼지 판단용)
  function langChosen() {
    try { return SUPPORTED.includes(localStorage.getItem(KEY)); } catch (_) { return false; }
  }
  function setLang(next) {
    if (!SUPPORTED.includes(next)) return;
    const prev = getLang();
    lang = next;
    try { localStorage.setItem(KEY, next); } catch (_) {}
    document.documentElement.lang = next;
    if (next === 'ko' && prev !== 'ko') restoreKo();
    else apply(document.body);
  }

  // 영어 → 한국어로 되돌리기. 글자를 덮어썼기 때문에 원문을 되살려야 하는데,
  // 통째로 갈아 끼운 덩어리만 원문을 들고 있다. 나머지는 영어 → 한국어 역방향
  // 표로 되돌린다. 새로고침을 시키면 진행 중인 판이 끊긴다.
  let REV = null;
  function restoreKo() {
    for (const el of document.querySelectorAll('[data-i18n-block]')) {
      if (el.dataset.i18nKo) { el.innerHTML = el.dataset.i18nKo; el.dataset.i18nDone = ''; 
        if (typeof paintIcons === 'function') { try { paintIcons(el); } catch (_) {} } }
    }
    if (!REV) { REV = {}; for (const k of Object.keys(EN)) if (!REV[EN[k]]) REV[EN[k]] = k; }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentNode;
        if (!p || SKIP_TAG[p.nodeName] || p.isContentEditable) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const hits = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) hits.push(n);
    for (const n of hits) {
      const key = n.nodeValue.trim(); if (!key) continue;
      if (Object.prototype.hasOwnProperty.call(REV, key)) n.nodeValue = n.nodeValue.replace(key, REV[key]);
    }
    for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]')) {
      for (const a of ATTRS) {
        const v = el.getAttribute(a); if (!v) continue;
        const key = v.trim();
        if (Object.prototype.hasOwnProperty.call(REV, key)) el.setAttribute(a, v.replace(key, REV[key]));
      }
    }
  }

  // ── 한 조각 바꾸기 ──────────────────────────────────────────────────────
  function t(s) {
    if (getLang() === 'ko') return s;
    const raw = String(s == null ? '' : s);
    const key = raw.trim();
    if (!key) return raw;
    const hit = Object.prototype.hasOwnProperty.call(EN, key) ? EN[key] : null;
    if (hit != null) return raw.replace(key, hit);        // 앞뒤 공백은 살린다
    for (const [re, out] of PATTERNS) {
      if (!re.test(key)) continue;
      // 끼워 넣는 값도 사전을 한 번 거친다. 안 그러면 "큰손 미스박 is bidding..."
      // 처럼 문장은 영어인데 이름만 한국어로 남는다.
      const done = key.replace(re, (...args) => {
        const groups = args.slice(1, -2).map((g) => {
          if (g == null) return g;
          const k = String(g).trim();
          return Object.prototype.hasOwnProperty.call(EN, k) ? EN[k] : g;
        });
        return out.replace(/\$(\d)/g, (_, i) => (groups[i - 1] == null ? '' : groups[i - 1]));
      });
      return raw.replace(key, done);
    }
    return raw;
  }

  // ── 화면 훑어 바꾸기 ────────────────────────────────────────────────────
  // 텍스트 조각만 건드린다. 닉네임처럼 사전에 없는 건 그대로 지나간다.
  const SKIP_TAG = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, SVG: 1, svg: 1 };
  const ATTRS = ['placeholder', 'title', 'aria-label'];

  // 긴 글은 낱개로 못 바꾼다. "기본은 2인전과 같다 —" / "세트" / "를 먼저 완성하면
  // 승리!" 처럼 <b> 사이사이로 잘려 있어서, 조각마다 짝을 지으면 영어 어순이 깨진다.
  // 그런 덩어리는 통째로 영어판을 따로 두고 갈아 끼운다.
  const BLOCKS = {
    // 아이템전 설명서 — 영어판
    rulesEtc: `
    <span class="close-x" onclick="rulesClose()">\u00d7</span>
    <h2>More</h2>
    <p style="color:#8a7a80">Ranks, RP, levels and rewards \u2014 all in one place.</p>

    <h3><span data-ico="\ud83c\udfc5"></span> Kyu and dan</h3>
    <p>A Go-style ladder. From <b>10 kyu up to 1 kyu</b> you rise automatically as RP accumulates,
       and <b>a rank you have reached is never taken away.</b></p>
    <div class="etc-table">
      <div class="etc-row etc-head"><span>Rank</span><span>RP needed</span></div>
      <div class="etc-row"><span>10 kyu \u2192 1 kyu</span><span>0 \u2192 2,025</span></div>
      <div class="etc-row"><span>1 dan</span><span>2,475</span></div>
      <div class="etc-row"><span>2 dan \u2013 9 dan</span><span>+350 each</span></div>
      <div class="etc-row"><span>ACE</span><span>top 100 by RP</span></div>
    </div>
    <p><b>From 1 dan you must pass a promotion series.</b> Reaching the RP only earns you the attempt \u2014
       you then need <b>3 wins out of 5</b>. Failing costs <b>100 RP</b>.</p>
    <p style="color:#8a7a80;font-size:.78rem">ACE holds only 100 seats, so places change hands by RP ranking.
       Dan and ACE players lose <b>10 RP per day after 3 days away</b> (kyu ranks never decay).</p>

    <h3><span data-ico="\ud83d\udcc8"></span> RP \u2014 ranked matches only</h3>
    <p><b>Only games from the ranked match button</b> move your RP.
       Created rooms, quick join, friend games, item battles and tournaments give coins and XP only.</p>
    <div class="etc-table">
      <div class="etc-row etc-head"><span>Result</span><span>RP</span></div>
      <div class="etc-row"><span>Win</span><span>+25</span></div>
      <div class="etc-row"><span>Loss</span><span>\u221218</span></div>
      <div class="etc-row"><span>From 3 wins in a row</span><span>+5 each (max +15)</span></div>
    </div>
    <p>A gap in strength changes the figure. Beating someone <b>300 RP above you</b> pays <b>1.3\u00d7</b>;
       beating someone that far below pays <b>0.7\u00d7</b>.</p>
    <p style="color:#8a7a80;font-size:.78rem">Multiplayer games settle by placement \u2014 1st +25, 2nd +8, 3rd \u22128, 4th \u221222.</p>

    <h3><span data-ico="\u2b50"></span> Levels and XP</h3>
    <p>Levels only ever go up. The XP needed for the next one:</p>
    <div class="etc-table">
      <div class="etc-row etc-head"><span>Range</span><span>XP needed</span></div>
      <div class="etc-row"><span>Levels 1\u20139</span><span>level \u00d7 25 + 25</span></div>
      <div class="etc-row"><span>Levels 10\u201319</span><span>level \u00d7 100</span></div>
      <div class="etc-row"><span>Level 20+</span><span>level \u00d7 150</span></div>
    </div>
    <p style="color:#8a7a80;font-size:.78rem">Founding a clan needs <b>level 5</b> and <b>\ud83e\ude99 1,000</b>.</p>

    <h3><span data-ico="\ud83e\ude99"></span> What a finished game pays</h3>
    <div class="etc-table">
      <div class="etc-row etc-head"><span>Opponent</span><span>Win</span><span>Loss</span></div>
      <div class="etc-row"><span>AI easy</span><span>\ud83e\ude99 5 \u00b7 5 XP</span><span>\u2014</span></div>
      <div class="etc-row"><span>AI normal</span><span>\ud83e\ude99 15 \u00b7 10 XP</span><span>3 XP</span></div>
      <div class="etc-row"><span>AI expert</span><span>\ud83e\ude99 40 \u00b7 20 XP</span><span>\ud83e\ude99 5 \u00b7 5 XP</span></div>
      <div class="etc-row"><span>A person</span><span>\ud83e\ude99 60 \u00b7 50 XP</span><span>\ud83e\ude99 25 \u00b7 20 XP</span></div>
    </div>
    <p style="color:#8a7a80;font-size:.78rem">Games that end too quickly (under 5 turns or 30 seconds) pay nothing.
       Against the same opponent only <b>3 games a day</b> count.</p>

    <h3><span data-ico="\ud83c\udf81"></span> Daily</h3>
    <ul>
      <li><b>Check-in</b> \u2014 \ud83e\ude99 30 a day, more on a streak</li>
      <li><b>First win of the day</b> \u2014 \ud83e\ude99 100 (against a person, or an expert AI)</li>
      <li><b>Cycling</b> \u2014 complete a 2, 3, 4 and 6 set once each for \ud83e\ude99 400</li>
      <li>Wearing the <b>\ud83c\udf40 lucky plate</b> adds \ud83e\ude99 50 to check-in</li>
    </ul>

    <h3><span data-ico="\ud83c\udfaa"></span> What each mode puts at stake</h3>
    <div class="etc-table">
      <div class="etc-row etc-head"><span>Mode</span><span>RP</span><span>Coins \u00b7 XP</span></div>
      <div class="etc-row"><span>Ranked match</span><span>\u25cb</span><span>\u25cb</span></div>
      <div class="etc-row"><span>Quick join</span><span>\u00d7</span><span>\u25cb</span></div>
      <div class="etc-row"><span>Created \u00b7 friend rooms</span><span>\u00d7</span><span>\u25cb</span></div>
      <div class="etc-row"><span>Item battle</span><span>\u00d7</span><span>\u25cb</span></div>
      <div class="etc-row"><span>Solo (vs AI)</span><span>\u00d7</span><span>\u25cb</span></div>
      <div class="etc-row"><span>Tournament</span><span>\u00d7</span><span>prize money</span></div>
    </div>

    <h3><span data-ico="\ud83c\udfc6"></span> Tournaments</h3>
    <p>They open <b>on the hour and at half past</b>. Entry \ud83e\ude99 200, winner \ud83e\ude99 1,000, runner-up \ud83e\ude99 200.
       Quarter- and semi-finals are single games, the final is best of three, and every match is 1v1.
       Empty seats are filled by AI at the start.</p>

    <h3><span data-ico="\ud83c\udf19"></span> Moons in the mini game</h3>
    <p>Coins become <b>moons</b> when you sit down \u2014 <b>\ud83e\ude99 200 = 2,000 moons</b> (10 moons per coin).
       You may buy in with up to \ud83e\ude99 200 and at least \ud83e\ude99 20, and whatever moons you have left
       come back as coins when you stand up.</p>

    <h3><span data-ico="\ud83c\udfb0"></span> Draws and shards</h3>
    <p>A duplicate turns into <b>shards</b>, and shards buy exactly what you want in the shop \u2014
       so bad luck still walks you toward the thing you were after.</p>
`,

    rulesItem: `
    <span class="close-x" onclick="toggleRulesItem(false)">\u00d7</span>
    <h2>Item Battle</h2>
    <p style="color:#8a7a80">The two-player rules, plus <b style="color:#ffe9a8">items</b> \u2014 and only the
       <b style="color:#ffe9a8">loser</b> of an auction gets them.</p>

    <h3><span data-ico="\ud83c\udf81"></span> How items arrive</h3>
    <div class="r4-steps">
      <div class="r4-step"><b>1</b><span>After every auction the <b>loser</b> receives one item. The winner gets nothing.</span></div>
      <div class="r4-step"><b>2</b><span>You can hold <b>three</b> at most. A full hand receives nothing.</span></div>
      <div class="r4-step"><b>3</b><span><b>One item per turn</b>, and never after you have played your bid card.</span></div>
    </div>
    <p>Items pile up on whoever is behind, so the game pulls itself back together.
       <b>Legendary items only drop to the player behind on sets</b>, so a lead does not snowball.</p>

    <h3><span data-ico="\ud83c\udfb2"></span> Drop rates</h3>
    <div class="r4-tbl">
      <div class="r4-row r4-head"><span>Tier</span><span>Behind</span><span>Ahead</span></div>
      <div class="r4-row"><span>Common (3)</span><span>60%</span><span>60%</span></div>
      <div class="r4-row"><span>Rare (6)</span><span>32%</span><span>40%</span></div>
      <div class="r4-row"><span>Legendary (4)</span><span>8%</span><span>\u2014</span></div>
    </div>
    <p style="font-size:.78rem">A legendary roll turns into a rare one if you are ahead.</p>

    <h3><span data-ico="\ud83d\udd0d"></span> Common</h3>
    <ul>
      <li><b>Magnifier</b> \u2014 peek at two cards in their hand</li>
      <li><b>Hourglass</b> \u2014 take 30 seconds off their clock</li>
      <li><b>Swap</b> \u2014 trade one card in hand for the top of the deck</li>
    </ul>

    <h3><span data-ico="\ud83d\udca8"></span> Rare</h3>
    <ul>
      <li><b>Smoke</b> \u2014 hide this lot from your opponent only</li>
      <li><b>Reversal</b> \u2014 for this auction, the <b>weaker</b> card wins</li>
      <li><b>Pickpocket</b> \u2014 take one card from their hand, give one of yours</li>
      <li><b>Discount</b> \u2014 win without losing your bid card</li>
      <li><b>Charm</b> \u2014 blocks their next item <b>for this turn</b></li>
      <li><b>Re-auction</b> \u2014 void a lost auction and bid again</li>
    </ul>

    <h3><span data-ico="\ud83d\udc51"></span> Legendary <span style="font-size:.78rem;color:#8a7a80">\u2014 only when behind</span></h3>
    <ul>
      <li><b>Alley Cat</b> \u2014 steal a card they have won (never from a set that is one card away)</li>
      <li><b>Copier</b> \u2014 duplicate a card you have won</li>
      <li><b>Tyrant</b> \u2014 seize the auctioneer's seat this turn (needs 2+ cards in hand)</li>
      <li><b>Dice of Fate</b> \u2014 redraw both lot cards from the deck</li>
    </ul>

    <h3><span data-ico="\ud83e\uddff"></span> The Charm \u2014 a reading game</h3>
    <p>A charm is <b>set in advance</b>. Once placed it swallows the next item your opponent plays, and
       that item is gone for good. But it <b>only lasts the turn</b>, so a canny opponent throws a cheap
       item first to burn it. Knowing when to place it is the whole game.</p>
    <p style="color:#8a7a80;font-size:.78rem">You cannot place one when there is nothing to block \u2014 if they already used an item this turn, or hold none.</p>
    `,
    // 미니게임 설명서 — 영어판. 본 게임과 규칙이 달라 따로 둔다.
    // 미니게임 설명서 — 영어판. 본 게임과 규칙이 달라 따로 둔다.
    rulesMini: `
    <span class="close-x" onclick="toggleRulesMini(false)">\u00d7</span>
    <h2>Two-Card Duel</h2>
    <p style="color:#8a7a80">2\u20134 players. A Sutda-style mini game: take two cards, keep them <b style="color:#ffe9a8">hidden</b>, and bet.</p>

    <h3><span data-ico="\ud83c\udfb4"></span> How a hand goes</h3>
    <div class="r4-steps">
      <div class="r4-step"><b>1</b><span>Everyone puts in the base unit <b>40 Moons</b> and takes <b>one card</b>. The first player starts.</span></div>
      <div class="r4-step"><b>2</b><span>The round closes once everyone but one has <b>matched</b> or folded.</span></div>
      <div class="r4-step"><b>3</b><span>If two or more remain, each takes <b>one more card</b> and a second betting round runs.</span></div>
      <div class="r4-step"><b>4</b><span>When that closes, hands are shown and ranked. The winner takes the whole pot.</span></div>
      <div class="r4-step"><b>5</b><span>If only one player is left, they win outright \u2014 and <b>nobody shows</b>.</span></div>
      <div class="r4-step"><b>6</b><span><b>The winner becomes the first player</b> next hand.</span></div>
    </div>

    <h3><span data-ico="\ud83c\udf10"></span> Playing online</h3>
    <p>Pick <b>Play online</b> and you are matched with others waiting for the same table size.
       Empty seats are filled by AI after 20 seconds. Online you get <b>45 seconds</b> per turn \u2014
       run out and it passes (or folds) for you. If someone stands up the game keeps going;
       their seat is taken over by AI from the next hand.</p>

    <h3><span data-ico="\ud83e\ude99"></span> Moons and coins</h3>
    <p>Sitting down converts coins into <b>Moons</b>, the money used at the table \u2014
       <b>\ud83e\ude99200 = 2,000 Moons</b> (10 Moons per coin; as much as you have, up to \ud83e\ude99200,
       \ud83e\ude9920 minimum). Bets are paid in Luna, and <b>you cash the rest back into coins when you
       stand up.</b> Coins are not touched hand by hand \u2014 going all-in only means something when
       there is a stack in front of you.</p>

    <h3><span data-ico="\ud83d\udcb0"></span> Betting</h3>
    <div class="r4-tbl">
      <div class="r4-row r4-head"><span>Choice</span><span>What it costs</span></div>
      <div class="r4-row"><span>Open</span><span>the base unit 40 Moons (first player, to open)</span></div>
      <div class="r4-row"><span>Pass</span><span>move on without adding (when nothing is owed)</span></div>
      <div class="r4-row"><span>Raise small</span><span>25% of the pot after matching</span></div>
      <div class="r4-row"><span>Raise big</span><span>50% of the pot after matching</span></div>
      <div class="r4-row"><span>Double up</span><span>twice what the player before you put in</span></div>
      <div class="r4-row"><span>Push all</span><span>every Luna you have left</span></div>
      <div class="r4-row"><span>Match</span><span>match the amount and close the round</span></div>
      <div class="r4-row"><span>Fold</span><span>give up what you put in and drop out</span></div>
    </div>
    <p><b>Once you match or pass you cannot raise again that round.</b> If someone raises, the turn comes
       back to you \u2014 but only to match or fold. The pot is never split, so a raise is capped at what
       the smallest stack at the table can cover.</p>

    <h3><span data-ico="\ud83c\udfc5"></span> Who wins</h3>
    <p>Add the two <b>big numbers</b> (front digits). <b>The smaller the sum, the stronger.</b></p>
    <div class="r4-tbl">
      <div class="r4-row r4-head"><span>Front sum</span><span>Name</span></div>
      <div class="r4-row"><span>4</span><span>Overlord</span></div>
      <div class="r4-row"><span>5</span><span>Premium</span></div>
      <div class="r4-row"><span>6 \u00b7 7 \u00b7 8 \u00b7 9</span><span>Midlands</span></div>
      <div class="r4-row"><span>10</span><span>Bottom</span></div>
      <div class="r4-row"><span>12</span><span>Last</span></div>
    </div>
    <p>On a tie, the smaller <b>back-digit sum</b> wins; still tied, whoever holds the <b>single strongest card</b> wins.</p>

    <h3><span data-ico="\ud83c\udfaf"></span> Snipers \u2014 the upset</h3>
    <p>A front sum of 10 is normally near the bottom. But if the <b>back digits also add to exactly 10</b>, it eats the very top.</p>
    <ul>
      <li><b>Mirror 10</b> (4-4 + 6-6) \u2014 beats <b>both Overlord and Premium</b>.</li>
      <li><b>Plain 10-10</b> \u2014 beats <b>Premium</b> only; loses to Overlord.</li>
      <li>Against anything else (sums 6\u20139) it is just a 10 and loses.</li>
    </ul>
    <p>Because snipers invert the order, three or more hands can form a loop \u2014 <b>A beats B, B beats C,
       C beats A</b>. When that happens the pot goes to whoever <b>beat the most players</b>, and ties fall
       back to the plain ranking.</p>

    <h3><span data-ico="\ud83d\udc40"></span> Tips</h3>
    <ul>
      <li><b>Nothing is face up.</b> All you can read is <b>how much</b> the others bet, and <b>when</b>.</li>\n      <li>Even your own cards stay down \u2014 <b>tap to look</b>. Open both and your rank appears.</li>
      <li>The first round has one card only \u2014 there is no rank yet, just the front digit.</li>
      <li>Folding costs only what you already put in. Chasing with a bad hand is the expensive mistake.</li>
    </ul>
    `,
    rules2: `
    <span class="close-x" onclick="toggleRules(false)">\u00d7</span>
    <h2>FLIP FLAP</h2>
    <p style="color:#8a7a80">Win auctions, collect cards, and complete a <b style="color:#ffe9a8">set</b> first!</p>

    <h3>\ud83c\udccf Reading a card</h3>
    <div class="r-anatomy">
      <div class="rc big" data-kind="6"><span class="rc-rank">1</span><span class="rc-num">6</span></div>
      <div class="r-callout">
        Big number in the middle = <b>kind</b><br>(= how many you must collect)<br>
        Small number top-left = <b>rank</b><br>(lower is stronger)
      </div>
    </div>

    <h3><span data-ico="\ud83c\udfaf"></span> How to win \u2014 complete a set</h3>
    <p>Collect a kind <b>as many times as its number</b> and you win instantly. Example: six 6s.</p>
    <div class="r-cards">
      <div class="rc" data-kind="6"><span class="rc-rank">1</span><span class="rc-num">6</span></div>
      <div class="rc" data-kind="6"><span class="rc-rank">2</span><span class="rc-num">6</span></div>
      <div class="rc" data-kind="6"><span class="rc-rank">3</span><span class="rc-num">6</span></div>
      <div class="rc" data-kind="6"><span class="rc-rank">4</span><span class="rc-num">6</span></div>
      <div class="rc" data-kind="6"><span class="rc-rank">5</span><span class="rc-num">6</span></div>
      <div class="rc" data-kind="6"><span class="rc-rank">6</span><span class="rc-num">6</span></div>
      <span class="r-arrow">\u2192</span><span class="r-win"><span data-ico="\ud83c\udfc6"></span> Win!</span>
    </div>
    <p style="font-size:.78rem">Cards needed per kind: <b>2</b>\u21922 \u00b7 <b>3</b>\u21923 \u00b7 <b>4</b>\u21924 \u00b7 <b>6</b>\u21926<br>
    <span data-ico="\u26a0"></span> Only cards <b>won at auction and laid in front of you</b> count (cards in hand do not)<br>
    <span data-ico="\ud83c\udfc1"></span> When the deck runs out, <b>whoever is closest to a set</b> wins</p>

    <h3><span data-ico="\ud83d\uddc2"></span> The deck <span style="color:#8a7a80;font-weight:400;font-size:.85rem">\u2014 24 cards</span></h3>
    <div class="r-comp">
      <div class="r-comp-row"><div class="rc" data-kind="2"><span class="rc-rank">1</span><span class="rc-num">2</span></div>
        <span><b>Kind 2</b> \u00b7 2 cards <span class="r-comp-g">(ranks 1\u20132)</span></span></div>
      <div class="r-comp-row"><div class="rc" data-kind="3"><span class="rc-rank">1</span><span class="rc-num">3</span></div>
        <span><b>Kind 3</b> \u00b7 5 cards <span class="r-comp-g">(ranks 1\u20135)</span></span></div>
      <div class="r-comp-row"><div class="rc" data-kind="4"><span class="rc-rank">1</span><span class="rc-num">4</span></div>
        <span><b>Kind 4</b> \u00b7 7 cards <span class="r-comp-g">(ranks 1\u20137)</span></span></div>
      <div class="r-comp-row"><div class="rc" data-kind="6"><span class="rc-rank">1</span><span class="rc-num">6</span></div>
        <span><b>Kind 6</b> \u00b7 10 cards <span class="r-comp-g">(ranks 1\u201310)</span></span></div>
    </div>
    <p style="font-size:.78rem">The bigger the kind, the more copies exist \u2014 and the harder the set.</p>

    <h3><span data-ico="\ud83d\udd04"></span> One auction</h3>
    <div class="r4-steps">
      <div class="r4-step"><b>1</b><span>Flip one <b>face-up card</b> from the deck</span></div>
      <div class="r4-step"><b>2</b><span>The auctioneer adds one <b>offered card</b> from hand \u2014 together they are the lot</span></div>
      <div class="r4-step"><b>3</b><span>The auctioneer picks <b>Open</b> or <b>Closed</b></span></div>
      <div class="r4-step"><b>4</b><span>Both players submit one <b>bid card</b></span></div>
      <div class="r4-step"><b>5</b><span>The <b>stronger</b> bid takes both cards of the lot</span></div>
    </div>
    <p style="font-size:.78rem">Bid cards are not discarded \u2014 the two of you <b>swap them</b>. Losing the lot still hands you the stronger card.</p>

    <h3><span data-ico="\ud83d\udc41"></span> Open and Closed</h3>
    <div class="r4-two">
      <div class="r4-card"><div class="r4-ct">Open</div>
        <p>The lot is <b>shown</b>.<br>Bids stay hidden until both are in.<br>You know the prize but not the opponent.</p></div>
      <div class="r4-card"><div class="r4-ct">Closed</div>
        <p>The lot is <b>hidden</b>.<br>The auctioneer bids first, in the open.<br>Use it to bluff \u2014 or to drain a strong card.</p></div>
    </div>

    <div class="r-special">
      <div class="r-st"><span data-ico="\u2694"></span> Upset! The Servant\u2019s Betrayal</div>
      <div class="r-match" style="margin:4px 0 0">
        <div class="rc gold" data-kind="6"><span class="rc-rank">10</span><span class="rc-num">6</span></div>
        <span class="r-arrow" data-ico="\u2694"></span>
        <div class="rc gold" data-kind="2"><span class="rc-rank">1</span><span class="rc-num">2</span></div>
        <span class="r-arrow">\u2192</span>
        <span class="r-win">6-10 wins!</span>
      </div>
      <p style="font-size:.76rem;margin-top:6px">The weakest card, <b style="color:var(--gold)">6-10</b>, is the one thing that beats the strongest, <b style="color:var(--gold)">2-1</b>.</p>
    </div>`,

    // 다인전 설명서 \u2014 영어판
    rules4: `
    <span class="close-x" onclick="toggleRules4(false)">\u00d7</span>
    <h2>FLIP FLAP <span class="r4-tag">3\u20134 Players</span></h2>
    <p style="color:#8a7a80">The core is the same as the 2-player game \u2014 complete a <b style="color:#ffe9a8">set</b> first and you win.<br>
    Here is only what changes with more players.</p>

    <h3><span data-ico="\ud83c\udfaf"></span> How to win</h3>
    <p>Collect a kind as many times as its number and you win on the spot.<br>
    <span style="font-size:.78rem">Cards needed per kind: <b>2</b>\u21922 \u00b7 <b>3</b>\u21923 \u00b7 <b>4</b>\u21924 \u00b7 <b>6</b>\u21926<br>
    <span data-ico="\u26a0"></span> Only cards <b>won at auction and laid in front of you</b> count (cards in hand do not)<br>
    <span data-ico="\ud83c\udfc1"></span> When the deck runs out, <b>whoever is closest to a set</b> wins</span></p>

    <h3><span data-ico="\ud83d\uddc2"></span> The deck <span style="color:#8a7a80;font-weight:400;font-size:.85rem">\u2014 38 cards</span></h3>
    <p style="font-size:.78rem;margin-top:-2px">Thicker than the 2-player deck (24). Three and four players share <b>the same deck</b>; hand size does the balancing.</p>
    <div class="r-comp">
      <div class="r-comp-row"><div class="rc" data-kind="2"><span class="rc-rank">1</span><span class="rc-num">2</span></div>
        <span><b>Kind 2</b> \u00b7 4 cards <span class="r-comp-g">(ranks 1\u20134)</span></span></div>
      <div class="r-comp-row"><div class="rc" data-kind="3"><span class="rc-rank">1</span><span class="rc-num">3</span></div>
        <span><b>Kind 3</b> \u00b7 6 cards <span class="r-comp-g">(ranks 1\u20136)</span></span></div>
      <div class="r-comp-row"><div class="rc" data-kind="4"><span class="rc-rank">1</span><span class="rc-num">4</span></div>
        <span><b>Kind 4</b> \u00b7 10 cards <span class="r-comp-g">(ranks 1\u201310)</span></span></div>
      <div class="r-comp-row"><div class="rc" data-kind="6"><span class="rc-rank">1</span><span class="rc-num">6</span></div>
        <span><b>Kind 6</b> \u00b7 18 cards <span class="r-comp-g">(ranks 1\u201318)</span></span></div>
    </div>
    <div class="r4-tbl">
      <div class="r4-row r4-head"><span>Players</span><span>Hand</span><span>Deck</span></div>
      <div class="r4-row"><span>3</span><span>7</span><span>17</span></div>
      <div class="r4-row"><span>4</span><span>6</span><span>14</span></div>
    </div>

    <h3><span data-ico="\ud83d\udd04"></span> One auction</h3>
    <div class="r4-steps">
      <div class="r4-step"><b>1</b><span>Flip one <b>face-up card</b> from the deck</span></div>
      <div class="r4-step"><b>2</b><span>The auctioneer adds one <b>offered card</b> from hand \u2014 together they are the lot</span></div>
      <div class="r4-step"><b>3</b><span>The auctioneer picks <b>Open</b> or <b>Closed</b></span></div>
      <div class="r4-step"><b>4</b><span><b>Everyone</b> bids \u2014 the auctioneer bids too</span></div>
      <div class="r4-step"><b>5</b><span>The <b>strongest</b> bid takes both cards of the lot</span></div>
    </div>
    <p style="font-size:.78rem"><span data-ico="\u26a0"></span> A player with an empty hand skips bidding. If nobody can bid, the lot goes <b>unsold</b> and the auctioneer keeps it.</p>

    <h3><span data-ico="\ud83d\udc41"></span> Open vs Closed \u2014 this is what differs</h3>
    <div class="r4-two">
      <div class="r4-card"><div class="r4-ct">Open</div>
        <p>The lot is <b>shown</b>.<br>Everyone bids face down, then all bids flip <b>at once</b>.<br>You know the prize but cannot read anyone.</p></div>
      <div class="r4-card"><div class="r4-ct">Closed</div>
        <p>The lot is <b>hidden</b>.<br>Instead, players reveal <b>one at a time, clockwise</b> from the auctioneer.<br>Later bidders see every card before them.</p></div>
    </div>
    <p style="font-size:.78rem">Because Closed is sequential, <b>bidding big early can scare the rest off</b> \u2014 that is where the bluffing lives.
    With simultaneous bids, reading one player still loses you the lot to the others, so no mind game forms.</p>

    <h3><span data-ico="\ud83c\udf81"></span> Bid cards come back in reverse</h3>
    <p>Bid cards are not discarded \u2014 players swap them.
    <b>The weakest bidder takes the strongest card.</b></p>
    <div class="r4-flow">
      <div class="r4-fr"><span class="r4-fl">Highest bid</span><span class="r-arrow">\u2192</span><span>Takes the 2-card lot \u00b7 but receives the <b>weakest</b> bid card</span></div>
      <div class="r4-fr"><span class="r4-fl">Lowest bid</span><span class="r-arrow">\u2192</span><span>No lot, but receives the <b>strongest</b> bid card</span></div>
    </div>
    <p style="font-size:.78rem">So <b>losing on purpose is a real play</b> \u2014 bid low to stock a strong hand.</p>

    <div class="r-special">
      <div class="r-st"><span data-ico="\u2694"></span> Upset! The Servant\u2019s Betrayal</div>
      <div class="r-match" style="margin:4px 0 0">
        <div class="rc gold" data-kind="6"><span class="rc-rank">18</span><span class="rc-num">6</span></div>
        <span class="r-arrow" data-ico="\u2694"></span>
        <div class="rc gold" data-kind="2"><span class="rc-rank">1</span><span class="rc-num">2</span></div>
        <span class="r-arrow">\u2192</span>
        <span class="r-win">6-18 wins!</span>
      </div>
      <p style="font-size:.76rem;margin-top:6px">The weakest card, <b style="color:var(--gold)">6-18</b>, is the one thing that beats the strongest, <b style="color:var(--gold)">2-1</b>.
      (In the 2-player game it is 6-10 \u2014 different deck, different weakest card.)<br>
      When a betrayal lands, those two cards <b>go back to their owners</b> \u2014 taking the lot and the strongest card would tilt the game too far.</p>
    </div>

    <h3><span data-ico="\u23f1"></span> Clock</h3>
    <p><b>3 minutes</b> each. It only ticks on your turn.
    Run out and <b>the AI plays that seat</b> for you.</p>`,
  };
  function applyBlocks(root) {
    const list = root.querySelectorAll ? root.querySelectorAll('[data-i18n-block]') : [];
    for (const el of list) {
      const name = el.getAttribute('data-i18n-block');
      if (!Object.prototype.hasOwnProperty.call(BLOCKS, name)) continue;
      if (el.dataset.i18nDone === '1') continue;
      if (!el.dataset.i18nKo) el.dataset.i18nKo = el.innerHTML;   // 되돌릴 수 있게 원문 보관
      el.innerHTML = BLOCKS[name];
      el.dataset.i18nDone = '1';
      if (typeof paintIcons === 'function') { try { paintIcons(el); } catch (_) {} }
    }
  }

  function apply(root) {
    if (getLang() === 'ko' || !root) return;
    applyBlocks(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentNode;
        if (!p || SKIP_TAG[p.nodeName]) return NodeFilter.FILTER_REJECT;
        // 입력 중인 값은 건드리지 않는다
        if (p.isContentEditable) return NodeFilter.FILTER_REJECT;
        return /[가-힣]/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const hits = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) hits.push(n);
    for (const n of hits) {
      const out = t(n.nodeValue);
      if (out !== n.nodeValue) n.nodeValue = out;
    }
    // 속성도 같이 (placeholder·title)
    const els = root.querySelectorAll ? root.querySelectorAll('[placeholder],[title],[aria-label]') : [];
    for (const el of els) {
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v || !/[가-힣]/.test(v)) continue;
        const out = t(v);
        if (out !== v) el.setAttribute(a, out);
      }
    }
  }

  // 새로 그려지는 것도 따라잡는다. 매 변화마다 훑으면 무거우니 한 프레임에 한 번만.
  let queued = false, pending = [];
  function watch() {
    const obs = new MutationObserver((list) => {
      if (getLang() === 'ko') return;
      for (const m of list) {
        for (const n of m.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) pending.push(n);
        if (m.type === 'characterData') pending.push(m.target);
      }
      if (queued || !pending.length) return;
      queued = true;
      // 마이크로태스크로 미룬다. 지금 돌고 있는 일이 끝나는 즉시, 화면에 그려지기
      // 전에 실행된다 — 한국어가 잠깐 스쳤다 바뀌는 깜빡임이 없다.
      //   · requestAnimationFrame 은 안 된다. 탭이 화면에 없으면 아예 안 불려서
      //     그동안 그려진 것들이 한국어로 굳는다(폰에서 앱을 내렸다 올리면 재현).
      //   · setTimeout 은 불리긴 하지만 한 번 그린 뒤라 깜빡인다.
      const run = () => {
        queued = false;
        const batch = pending; pending = [];
        for (const n of batch) {
          if (!n.isConnected) continue;
          if (n.nodeType === 3) { const o = t(n.nodeValue); if (o !== n.nodeValue) n.nodeValue = o; }
          else apply(n);
        }
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(run);
      else Promise.resolve().then(run);
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    // 그래도 새는 게 있으면(화면 밖에서 그려진 것 등) 돌아왔을 때 한 번 훑는다.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) apply(document.body);
    });
  }

  function init() {
    document.documentElement.lang = getLang();
    apply(document.body);
    watch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.FF = root.FF || {};
  root.FF.t = t;
  root.FF.lang = getLang;
  root.FF.setLang = setLang;
  root.FF.langChosen = langChosen;
  root.FF.applyI18n = apply;
  root.FF.DICT = EN;
  root.FF.BLOCKS = BLOCKS;
  root.FF.PATTERNS = PATTERNS;
})(typeof window !== 'undefined' ? window : globalThis);
