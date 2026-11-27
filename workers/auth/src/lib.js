// OAuth provider adapter: future providers must implement their own verified identity exchange.
export const ORIGIN = "https://tripflip.co.kr";
export const ALLOWED_ORIGINS = Object.freeze([ORIGIN, "https://www.tripflip.co.kr"]);
export const allowedOrigin = origin => ALLOWED_ORIGINS.includes(origin);
export function callbackUri(provider, origin) {
  if (!allowedOrigin(origin) || !["google", "kakao", "naver"].includes(provider)) throw Error("invalid OAuth origin or provider");
  return origin + "/auth/" + provider + "/callback";
}
export const CALLBACK = callbackUri("google", ORIGIN);
// Compare the persisted start origin and provider, not headers supplied by the caller.
export const matchesFlow = (data, provider, origin) => !!data && allowedOrigin(origin) && data.origin === origin && data.provider === provider;
export const sameOriginPost = (requestOrigin, origin) => allowedOrigin(origin) && requestOrigin === origin;
export const validReason = r => typeof r === "string" && /^[a-z0-9_]{1,40}$/.test(r);
export function accountReturn(origin, ok, reason) {
  if (!allowedOrigin(origin)) throw Error("invalid OAuth origin");
  return origin + "/account?oauth=" + (ok ? "done" : "error") + (!ok && validReason(reason) ? "&reason=" + reason : "");
}
// Coded failure: reason is a short public code; detail holds only provider error codes, HTTP status or field presence.
// Never put secrets, codes, tokens, cookies or profile values into detail.
export function oauthFail(reason, detail = {}) {
  const e = Error(reason);
  e.reason = reason; e.detail = detail;
  return e;
}
const clip = v => typeof v === "string" ? v.slice(0, 200) : v === undefined ? undefined : String(v).slice(0, 200);
// Read only the provider's public error fields from a failed token response.
export async function providerError(response) {
  let body = null;
  try { body = await response.json(); } catch {}
  return { status: response.status, error: clip(body?.error), error_description: clip(body?.error_description ?? body?.error_code) };
}
export const secret = v => typeof v === "string" ? v.trim() : v;
export const TTL = 10 * 60 * 1000;
export const COOKIE = "__Host-tf-oauth";
export const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
export const validRandom = v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export const validDevice = v => typeof v === "string" && /^[a-z0-9]{8,32}$/.test(v);
export const same = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
export async function challenge(verifier) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function browserProof(header) {
  const values = String(header ?? "").split(";").map(x => x.trim()).filter(x => x.startsWith(COOKIE + "="));
  if (values.length !== 1) return null;
  const [state, proof, extra] = values[0].slice(COOKIE.length + 1).split(".");
  return validRandom(state) && validRandom(proof) && extra === undefined ? { state, proof } : null;
}
export const cookie = (value, maxAge) => COOKIE + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
export const validIntent = b => b && validDevice(b.v) && (
  (b.intent === "login" && b.agree === true && b.token == null) ||
  (b.intent === "withdraw" && typeof b.token === "string" && /^[a-f0-9]{48}$/.test(b.token) && b.agree === true)
);
export function googleProfile(raw) {
  if (!raw || raw.email_verified !== true || typeof raw.sub !== "string" || !raw.sub || raw.sub.length > 255 ||
      typeof raw.email !== "string" || typeof raw.name !== "string") return null;
  const email = raw.email.trim().toLowerCase(), name = raw.name.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  // Never return photo, locale, access/refresh token or other profile data.
  return { provider: "google", subject: raw.sub, email, name };
}
export function authorizationUrl(clientId, state, codeChallenge, origin = ORIGIN) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callbackUri("google", origin), response_type: "code",
    scope: "openid email profile", state, code_challenge: codeChallenge, code_challenge_method: "S256",
    access_type: "online", prompt: "select_account" }).toString();
  return url.toString();
}
export async function exchangeGoogle(env, code, verifier, request = fetch, origin = ORIGIN) {
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: secret(env.GOOGLE_CLIENT_ID), client_secret: secret(env.GOOGLE_CLIENT_SECRET),
      redirect_uri: callbackUri("google", origin), grant_type: "authorization_code", code_verifier: verifier }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw oauthFail("token_http", await providerError(response));
  const token = await response.json();
  if (typeof token.access_token !== "string" || !token.access_token || String(token.token_type).toLowerCase() !== "bearer") throw oauthFail("token_invalid", { hasAccessToken: typeof token.access_token === "string", tokenType: clip(token.token_type) });
  // Use only the authenticated Google UserInfo endpoint; do not trust browser claims or unverified JWT payloads.
  const profile = await request("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: "Bearer " + token.access_token }, redirect: "manual", signal: AbortSignal.timeout(10000),
  });
  if (!profile.ok) throw oauthFail("profile_http", { status: profile.status });
  const raw = await profile.json();
  const identity = googleProfile(raw);
  if (!identity) throw oauthFail("profile_invalid", { hasSub: typeof raw?.sub === "string", hasEmail: typeof raw?.email === "string", emailVerified: raw?.email_verified === true, hasName: typeof raw?.name === "string" });
  return identity;
}
