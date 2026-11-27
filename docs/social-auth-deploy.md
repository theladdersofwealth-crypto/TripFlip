# 소셜 전용 인증 — 최종 수동 배포 절차 (이번 작업에서는 미실행)

1. 개발자센터에 아래 **두 HTTPS 콜백**을 공급자별로 정확히 등록한다. www 리디렉션으로 대체하지 않는다.

| 공급자 | 승인된 콜백 URI (두 개 모두) |
|---|---|
| Google Cloud Console (Web OAuth client) | https://tripflip.co.kr/auth/google/callback · https://www.tripflip.co.kr/auth/google/callback |
| Kakao Developers | https://tripflip.co.kr/auth/kakao/callback · https://www.tripflip.co.kr/auth/kakao/callback |
| NAVER Developers | https://tripflip.co.kr/auth/naver/callback · https://www.tripflip.co.kr/auth/naver/callback |

구글 승인된 JavaScript origin이 필요하면 두 HTTPS origin만 등록. 카카오는 로그인 활성화, client secret 활성화, 이름 또는 프로필 별명 제공 허용, 이메일 선택 동의, 두 웹 도메인 설정. 네이버는 두 서비스 URL 및 콜백 등록, 이름/별명 제공 허용, 이메일 선택 동의, OIDC(openid) 및 PKCE S256 설정 검수. 네이버 이메일 인증 필드 미확인으로 자동 연결 금지. 공식 문서: https://developers.kakao.com/docs/ko/kakaologin/rest-api 및 https://developers.naver.com/docs/login/devguide/devguide.md 및 https://developers.naver.com/docs/login/api/api.md.
2. auth Worker의 wrangler.toml에 공개 ID 3개 설정 완료. 비밀값은 명령 프롬프트로 입력하고 코드·설정·PR·로그·브라우저에 실제 값을 기록하지 않는다.
3. Cloudflare의 활성 `tripflip.co.kr` DNS zone에서 apex와 www DNS 레코드가 모두 Proxied(주황 구름), HTTPS 인증서 유효 상태인지 확인. 두 `https://.../auth/*` route가 auth Worker로 연결되도록 한다. 다른 Pages 경로는 유지. www→apex 또는 apex→www 강제 리디렉션 규칙은 최소 `/auth/*` 및 `/account` 인증 복귀 경로에서 제외해야 한다. 두 호스트 간 쿠키나 localStorage를 공유하지 않음: 로그인 시작 호스트에서만 완료되며 다른 호스트에서는 새 로그인 필요(같은 소셜 계정은 서버 UID 동일). 공식 route 문서: https://developers.cloudflare.com/workers/configuration/routing/routes/. 실제 zone, DNS, redirect 설정 및 개발자센터 등록은 미확인.
4. 기존 Stats DO 회원·세션·여행 백업/수 확인. 신규 social_users/social_identities 테이블은 기존 users/oauth_identities를 자동 삭제하지 않음. 기존 소셜 회원이 존재하면 UID 보존 이관 먼저 검증. scripts/manual/retire-legacy-members.sql은 백업 SQLite 검토용으로만 유지(자동 실행 금지, 기존 테이블 존재·PIN 회원 0명·신규 테이블 비어 있음 조건). 실제 DO 이관/삭제는 별도 승인 필요.
5. 별도 승인 후 저장소 루트에서 아래 순서. Stats의 기존 DO 바인딩 및 ADMIN_KEY 유지. 새 auth Worker가 아직 존재하지 않으면 secret 등록 시 Wrangler의 초기 Worker 생성 절차를 먼저 확인(라우팅 활성화는 최종 승인 시점).

```bash
cd workers/stats
wrangler deploy
cd ../auth
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put KAKAO_CLIENT_SECRET
wrangler secret put NAVER_CLIENT_SECRET
wrangler deploy
```

6. 배포 승인 후 두 호스트와 세 공급자 각각 실제 로그인·탈퇴·동일 UID·쿠키·state/PKCE·다른 origin 콜백 거부 테스트. workers.dev 비활성 및 로그 비활성 확인. 이후 Pages 앱 배포는 별도 승인. 탈퇴는 TripFlip 계정·연결·세션·여행·이용 기록 삭제이며 공급자 자체 계정 삭제/동의 철회는 공급자 관리 화면에서 별도 수행.
