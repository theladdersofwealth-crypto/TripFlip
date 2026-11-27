import test from "node:test";
import assert from "node:assert/strict";
import { CALLBACK, COOKIE, authorizationUrl, browserProof, challenge, cookie, exchangeGoogle, googleProfile, same, validIntent } from "../workers/auth/src/lib.js";
import { resolveIdentity, validIdentity } from "../workers/stats/src/oauth.js";

const state = "a".repeat(64), proof = "b".repeat(64);
const profile = { sub: "google-test-subject", email_verified: true, email: " Example@Example.com ", name: "테스트", picture: "not-stored" };

test("구글의 인증된 이메일과 이름만 허용하고 기타 프로필을 버린다", () => {
  const actual = googleProfile(profile);
  assert.deepEqual(actual, { provider: "google", subject: profile.sub, email: "example@example.com", name: "테스트" });
  assert.ok(validIdentity({...actual,emailVerified:true}));
  assert.equal(googleProfile({ ...profile, email_verified: false }), null);
  assert.equal(googleProfile({ ...profile, email_verified: "true" }), null);
  assert.equal(googleProfile({ ...profile, sub: "" }), null);
  assert.equal(googleProfile({ ...profile, name: "" }), null);
});
test("고정 콜백·state·PKCE S256·최소 범위", async () => {
  const code = await challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
  assert.equal(code, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const u = new URL(authorizationUrl("test.apps.googleusercontent.com", state, code));
  assert.equal(u.origin, "https://accounts.google.com");
  assert.equal(u.searchParams.get("redirect_uri"), CALLBACK);
  assert.equal(CALLBACK, "https://tripflip.co.kr/auth/google/callback");
  assert.equal(u.searchParams.get("state"), state);
  assert.equal(u.searchParams.get("code_challenge"), code);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("scope"), "openid email profile");
  assert.equal(u.searchParams.has("client_secret"), false);
});
test("HttpOnly 브라우저 증명, 중복 쿠키 거부, 동의 및 기존 세션 요구", () => {
  const header = `${COOKIE}=${state}.${proof}`;
  assert.deepEqual(browserProof(header), { state, proof });
  assert.equal(browserProof(header + "; " + header), null);
  assert.equal(browserProof(header + ".x"), null);
  assert.ok(same(state, state) && !same(state, proof));
  assert.match(cookie(state + "." + proof, 600), /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  assert.equal(validIntent({ v: "abc12345", intent: "login", agree: true, token: null }), true);
  assert.equal(validIntent({ v: "abc12345", intent: "login", agree: false }), false);
  assert.equal(validIntent({ v: "abc12345", intent: "link", agree: true }), false);
  assert.equal(validIntent({ v: "abc12345", intent: "withdraw", agree: true, token: "a".repeat(48) }), true);
});
test("공급자 식별자와 인증된 이메일로만 연결한다", () => {
  assert.deepEqual(resolveIdentity({intent:"login",emailUids:[]}),{create:true});
  assert.deepEqual(resolveIdentity({intent:"login",subjectUid:"u1",emailUids:[]}),{uid:"u1"});
  assert.deepEqual(resolveIdentity({intent:"login",emailUids:["u1"]}),{uid:"u1"});
  assert.equal(resolveIdentity({intent:"login",emailUids:["u1"],existingProvider:true}),null);
  assert.equal(resolveIdentity({intent:"login",emailUids:["u1","u2"]}),null);
  assert.equal(resolveIdentity({intent:"withdraw",currentUid:"u2",subjectUid:"u1",emailUids:[]}),null);
  assert.deepEqual(resolveIdentity({intent:"withdraw",currentUid:"u1",subjectUid:"u1",emailUids:[]}),{uid:"u1"});
});
test("토큰 교환과 UserInfo는 고정 서버에서만, 실패 및 미인증 이메일 거부", async () => {
  const calls: string[] = [];
  const request: typeof fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    assert.equal(init?.redirect, "manual");
    if (url.endsWith("/token")) {
      const params = new URLSearchParams(String(init?.body));
      assert.equal(params.get("redirect_uri"), CALLBACK);
      assert.equal(params.get("code_verifier"), "verifier");
      return Response.json({ access_token: "mock-access", token_type: "Bearer", refresh_token: "unused" });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer mock-access");
    return Response.json(profile);
  };
  // No real credential is needed by the stub; the secret value is read only from env in the worker.
  const env = { GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "" };
  assert.deepEqual(await exchangeGoogle(env, "code", "verifier", request), googleProfile(profile));
  assert.deepEqual(calls, ["https://oauth2.googleapis.com/token", "https://openidconnect.googleapis.com/v1/userinfo"]);
  await assert.rejects(exchangeGoogle(env, "code", "verifier", async () => new Response("", { status: 401 })));
  await assert.rejects(exchangeGoogle(env, "code", "verifier", async (input) => String(input).endsWith("/token")
    ? Response.json({ access_token: "mock-access", token_type: "Bearer" })
    : Response.json({ ...profile, email_verified: false })));
});
