// 대안 두 갈래는 Main 에서 그대로 뽑아 만든다 — 마크를 고치면 셋이 같이 바뀐다.
import fs from 'node:fs';
const main = fs.readFileSync(new URL('./Main.dc.html', import.meta.url), 'utf8');
const grab = (tag) => { const i = main.indexOf('<!-- ' + tag + ' -->');
  const s = main.indexOf('<svg', i); return main.slice(s, main.indexOf('</svg>', s) + 6); };
const MARK = { classic: grab('클래식'), item: grab('아이템전'), twelve: grab('TWELVE'),
               quad: grab('다인전'), tour: grab('토너먼트') };
for (const [k, v] of Object.entries(MARK)) if (!v.startsWith('<svg')) throw new Error('마크 없음: ' + k);

const shell = (body) => main.slice(0, main.indexOf('  <!-- 모드 격자'))
  + body + main.slice(main.indexOf('  <!-- 하단 바'));
// 색을 걷어낸 판 — 모드색을 전부 백금 한 갈래로 눕힌다
const mono = (svg) => svg
  .replace(/#8fb2e0|#b79ae4|#6fbcd4|#6fbf9d|#cbb072/g, '#8b9db8')
  .replace(/#cfe0f6|#e2d4ff|#9fd9ea|#cbeefb|#a8e6c9|#f0dfab/g, '#dbe7f8')
  .replace(/#0d1524|#151129|#0b1c26|#0d222e|#122b39|#0c221c|#1c1810|#111a2e|#081a16/g, '#101828');

const sq = (mark, name, sub, rgb, surf, nameC, subC, plain = false) => `      <div class="tile" style="border-color:rgba(${rgb},.40);
           background:linear-gradient(180deg, rgba(${rgb},.11), rgba(${rgb},.02) 46%), linear-gradient(180deg,${surf});">
        <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
             gap:13px; padding:16px 13px; text-align:center;">
          <div class="mark" style="width:34px; height:34px;">
            <span style="position:absolute; left:50%; top:50%; width:62px; height:62px; transform:translate(-50%,-50%);
                  border-radius:50%; background:rgba(${rgb},.20); filter:blur(11px);"></span>
            <span style="position:relative; display:block;">${plain ? mono(mark) : mark}</span>
          </div>
          <div>
            <div style="font-size:17.6px; font-weight:600; color:${nameC}; letter-spacing:-.3px;">${name}</div>
            <div style="font-size:11.2px; font-weight:500; color:${subC}; line-height:1.35; margin-top:5px;">${sub}</div>
          </div>
        </div>
      </div>`;

const wide = (mark, name, sub, rgb, surf, nameC, subC, chev, plain = false) => `      <div class="tile" style="grid-column:1 / -1; border-color:rgba(${rgb},.42);
           background:linear-gradient(100deg, rgba(${rgb},.13), rgba(${rgb},.03) 58%), linear-gradient(180deg,${surf});">
        <div style="position:absolute; inset:0; display:flex; align-items:center; gap:14px; padding:12px 16px;">
          <div class="mark" style="width:30px; height:30px; flex-shrink:0;">
            <span style="position:absolute; left:50%; top:50%; width:56px; height:56px; transform:translate(-50%,-50%);
                  border-radius:50%; background:rgba(${rgb},.20); filter:blur(11px);"></span>
            <span style="position:relative; display:block;">${(plain ? mono(mark) : mark).replace(/width="\d+" height="\d+"/, 'width="30" height="30"')}</span>
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:16px; font-weight:600; color:${nameC}; letter-spacing:-.3px;">${name}</div>
            <div style="font-size:11.2px; font-weight:500; color:${subC}; line-height:1.35; margin-top:4px;">${sub}</div>
          </div>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="flex-shrink:0; opacity:.65;">
            <path d="M9 5l7 7-7 7" stroke="${chev}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>`;

// ── 대안 A — 클래식을 맨 위 한 줄짜리 주역으로 ──────────────────────────────
fs.writeFileSync(new URL('./AltHero.dc.html', import.meta.url), shell(
`  <!-- 모드 격자 — 클래식이 맨 위 한 줄 -->
  <div style="position:absolute; left:16px; top:70px; width:343px; height:648px;
       display:grid; grid-template-columns:1fr 1fr; grid-template-rows:104px 1fr 1fr; gap:10px;">
      <div class="tile" style="grid-column:1 / -1; border-color:rgba(143,178,224,.46);
           background:linear-gradient(100deg, rgba(143,178,224,.15), rgba(143,178,224,.03) 62%), linear-gradient(180deg,#182440,#0d1524);">
        <div style="position:absolute; inset:0; display:flex; align-items:center; gap:15px; padding:0 17px;">
          <div class="mark" style="width:38px; height:38px; flex-shrink:0;">
            <span style="position:absolute; left:50%; top:50%; width:70px; height:70px; transform:translate(-50%,-50%);
                  border-radius:50%; background:rgba(143,178,224,.22); filter:blur(12px);"></span>
            <span style="position:relative; display:block;">${MARK.classic.replace(/width="\d+" height="\d+"/, 'width="38" height="38"')}</span>
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:19.2px; font-weight:600; color:#eaf2ff; letter-spacing:-.4px;">클래식</div>
            <div style="font-size:11.7px; font-weight:500; color:#95a2b6; line-height:1.35; margin-top:4px;">경매로 세트를 먼저 완성하면 승리</div>
          </div>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="flex-shrink:0; opacity:.7;">
            <path d="M9 5l7 7-7 7" stroke="#8fb2e0" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
${sq(MARK.item, '아이템전', '경매에서 지면<br>아이템이 들어와요', '183,154,228', '#1b1936,#100e21', '#ecdfff', '#9d94b4')}
${sq(MARK.twelve, 'TWELVE', '카드가 아니라<br>칩으로 값을 부르는 경매', '111,188,212', '#0f2534,#08161f', '#d5f0fb', '#8ea4b0')}
${sq(MARK.quad, '다인전', '셋·넷이서 ·<br>지는 것도 수가 되는 판', '111,191,157', '#102a24,#081a16', '#d6f3e5', '#8ba99b')}
${sq(MARK.tour, '토너먼트', '8강 · 세 판을 이기면 우승<br>매 경기 모드가 바뀐다', '203,176,114', '#1e1a10,#12100a', '#f4e6bd', '#a2977a')}
  </div>

`));

// ── 대안 B — 모드별 색을 걷어낸다 ──────────────────────────────────────────
const M = '139,157,184';
fs.writeFileSync(new URL('./AltMono.dc.html', import.meta.url), shell(
`  <!-- 모드 격자 — 모드별 색을 걷어내고 백금 하나로 -->
  <div style="position:absolute; left:16px; top:70px; width:343px; height:648px;
       display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr .62fr; gap:10px;">
${sq(MARK.classic, '클래식', '경매로 세트를<br>먼저 완성하면 승리', M, '#18223a,#0e1626', '#eaf2ff', '#93a0b4', true)}
${sq(MARK.item, '아이템전', '경매에서 지면<br>아이템이 들어와요', M, '#161f34,#0d1423', '#dfe8f7', '#8d99ad', true)}
${sq(MARK.twelve, 'TWELVE', '카드가 아니라<br>칩으로 값을 부르는 경매', M, '#161f34,#0d1423', '#dfe8f7', '#8d99ad', true)}
${sq(MARK.quad, '다인전', '셋·넷이서 ·<br>지는 것도 수가 되는 판', M, '#161f34,#0d1423', '#dfe8f7', '#8d99ad', true)}
${wide(MARK.tour, '토너먼트', '8강 · 세 판을 이기면 우승 · 매 경기 모드가 바뀐다', M, '#18223a,#0e1626', '#eaf2ff', '#93a0b4', '#8b9db8', true)}
  </div>

`));
console.log('✓ AltHero.dc.html · AltMono.dc.html');
