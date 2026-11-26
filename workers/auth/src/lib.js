// OAuth provider adapter: future providers must implement their own verified identity exchange.
export const ORIGIN = "https://tripflip.co.kr";
export const CALLBACK = ORIGIN + "/auth/google/callback";
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
  (["link", "withdraw"].includes(b.intent) && typeof b.token === "string" && /^[a-f0-9]{48}$/.test(b.token) && b.agree === true)
);
export function googleProfile(raw) {
  if (!raw || raw.email_verified !== true || typeof raw.sub !== "string" || !raw.sub || raw.sub.length > 255 ||
      typeof raw.email !== "string" || typeof raw.name !== "string") return null;
  const email = raw.email.trim().toLowerCase(), name = raw.name.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  // Never return photo, locale, access/refresh token or other profile data.
  return { provider: "google", subject: raw.sub, email, name };
}
export function authorizationUrl(clientId, state, codeChallenge) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: CALLBACK, response_type: "code",
    scope: "openid email profile", state, code_challenge: codeChallenge, code_challenge_method: "S256",
    access_type: "online", prompt: "select_account" }).toString();
  return url.toString();
}
export async function exchangeGoogle(env, code, verifier, request = fetch) {
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST", redirect: "error", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: CALLBACK, grant_type: "authorization_code", code_verifier: verifier }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("oauth exchange failed");
  const token = await response.json();
  if (typeof token.access_token !== "string" || !token.access_token || String(token.token_type).toLowerCase() !== "bearer") throw Error("invalid token response");
  // Use only the authenticated Google UserInfo endpoint; do not trust browser claims or unverified JWT payloads.
  const profile = await request("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: "Bearer " + token.access_token }, redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!profile.ok) throw Error("userinfo failed");
  const identity = googleProfile(await profile.json());
  if (!identity) throw Error("verified email required");
  return identity;
}
