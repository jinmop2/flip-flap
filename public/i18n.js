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
    [/^덱 (\d+)장$/, 'Deck $1'],
    [/^덱 (\d+)장 남음$/, '$1 left in deck'],
    [/^턴 (\d+)$/, 'Turn $1'],
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
      if (re.test(key)) return raw.replace(key, key.replace(re, out));
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
    // 2인전 설명서 — 영어판. 조각으로 번역하면 어순이 깨져 통째로 갈아 끼운다.
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
      // requestAnimationFrame 을 쓰면 안 된다. 탭이 화면에 없을 때는 아예 안
      // 불려서, 그동안 그려진 것들이 한국어로 굳는다(폰에서 앱을 내렸다 올리면
      // 그대로 재현된다). 타이머는 화면이 꺼져 있어도 돈다.
      setTimeout(() => {
        queued = false;
        const batch = pending; pending = [];
        for (const n of batch) {
          if (!n.isConnected) continue;
          if (n.nodeType === 3) { const o = t(n.nodeValue); if (o !== n.nodeValue) n.nodeValue = o; }
          else apply(n);
        }
      }, 16);
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
