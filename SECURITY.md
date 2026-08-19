
## 백업과 복구

하루 한 번 저절로 스냅샷을 뜬다 (서버가 뜨고 20초 뒤 한 번, 이후 24시간마다).
- Postgres: `ff_meta` 테이블에 `snap:YYYY-MM-DD` 키로. 최근 7일치만 남기고 지운다.
- 파일 모드(로컬): `data/backup/YYYY-MM-DD.json`.

같은 DB 안의 스냅샷은 **실수로 지운 것**은 되살리지만 **DB 자체가 죽으면** 소용없다.
바깥 보관은 관리자가 직접 받아 둔다:

```
curl -X POST https://flip-flap.onrender.com/api/admin/backup-dump \
  -H 'Content-Type: application/json' -d '{"key":"<ADMIN_KEY>"}' -o backup.json
```

- `/api/admin/backup-now` — 지금 즉시 한 벌 뜬다
- `/api/admin/backup-list` — 남아 있는 스냅샷 목록
- 키는 **본문으로만** 받는다. 쿼리로 보내면 히스토리·로그에 남는다.

복구는 자동 통로를 두지 않았다 — 잘못 부르면 그 자리에서 전부 덮어쓴다.
받아 둔 JSON 의 `users` / `clans` / `coupons` 를 `ff_users` / `ff_clans` /
`ff_coupons` 에 넣는 것이 복구다. 반드시 사람이 확인하고 손으로 한다.

## 시즌

달이 바뀌면(한국 시간 기준) 소프트 리셋이 돈다 — 단·ACE 만 한 단계 아래로,
급수는 그대로. 최고 기록(`bestRank`)은 남는다. 서버가 뜰 때와 한 시간마다
확인하므로, 자정에 서버가 안 떠 있어도 다음에 뜰 때 한 번은 돈다.
`/api/admin/season` 으로 지금 시즌과 적용 여부를 볼 수 있다.
