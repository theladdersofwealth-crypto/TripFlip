# Vercel 배포본 백업 (2026-11-07)

GitHub 계정 정지로 원본 저장소 접근 불가 → 공개 배포 사이트에서 받은 화면 파일(HTML/JS/CSS).
- 화면(프론트)은 그대로 다시 배포 가능.
- 서버 기능(/api/*)과 저장된 데이터(Vercel Blob 등)는 들어 있지 않음. 원본은 GitHub 복구 또는 Vercel 계정 접근으로만 가능.

| 폴더 | 원래 주소 | 서버 API(미포함) |
|---|---|---|
| nha-trang-family-planner | nha-trang-family-planner.vercel.app | /api (login, publish, backup, submit, requests 등) |
| pom-path-of-money (+/calendar) | pom-path-of-money.vercel.app | /api/crypto, /api/stocks, /api/chart, /api/transactions, /api/calendar, /api/calendar-push |
| pom-sms-ynschm52t9 | pom-sms-ynschm52t9.vercel.app | /api/sms (문자 수신) |
| guwongyo-consulting | guwongyo-consulting.vercel.app | 없음 — Supabase 직접 사용(Vercel 무관) |
| guwongyo-consulting-admin | guwongyo-consulting-admin.vercel.app | 없음 — Supabase Edge Function consulting-admin-api |
| oh-family-hongkong-2026 | oh-family-hongkong-2026.vercel.app | 없음 |

guwongyo-consulting-v2 는 404(내려감). ROUND9 주소 미확인.

## cloudflare/ — Cloudflare로 새로 만든 앱 (2026-11-07~)
- nhatrang: https://nhatrang-planner.ohysky0127.workers.dev — 화면 + 가족 서버(/api)를 Durable Object(무료)로 재작성. 배포: `cd cloudflare/nhatrang && npx wrangler deploy`
- pom: https://pom.ohysky0127.workers.dev — 화면 + 캘린더/푸시 서버(Durable Object). 나머지 /api 는 옛 Vercel 서버로 전달 중. 시크릿: POM_ACCESS_TOKEN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_JWK
