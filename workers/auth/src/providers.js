import { ORIGIN, callbackUri, authorizationUrl, exchangeGoogle } from "./lib.js";
export const PROVIDERS = ["google", "kakao", "naver"];
export const config = {
  google: { auth: "https://accounts.google.com/o/oauth2/v2/auth", id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  kakao: { auth: "https://kauth.kakao.com/oauth/authorize", token: "https://kauth.kakao.com/oauth/token", user: "https://kapi.kakao.com/v2/user/me", id: "KAKAO_CLIENT_ID", secret: "KAKAO_CLIENT_SECRET" },
  naver: { auth: "https://nid.naver.com/oauth2/authorize", token: "https://nid.naver.com/oauth2/token", user: "https://openapi.naver.com/v1/nid/me", id: "NAVER_CLIENT_ID", secret: "NAVER_CLIENT_SECRET" },
};
export const callback = (p, origin = ORIGIN) => callbackUri(p, origin);
export const enabled = (env,p) => PROVIDERS.includes(p) && typeof env[config[p].id] === "string" && !!env[config[p].id] && !!env[config[p].secret] && (p !== "google" || env[config[p].id].endsWith(".apps.googleusercontent.com"));
export function providerUrl(p, env, state, ch, origin = ORIGIN) {
  if (p === "google") return authorizationUrl(env.GOOGLE_CLIENT_ID, state, ch, origin);
  const url = new URL(config[p].auth);
  url.search = new URLSearchParams({ client_id: env[config[p].id], redirect_uri: callback(p, origin), response_type: "code", state, code_challenge: ch, code_challenge_method: "S256", ...(p === "naver" ? {scope:"openid"} : {prompt:"login"}) }).toString();
  return url.href;
}
const emailOf = e => typeof e === "string" && e.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()) ? e.trim().toLowerCase() : null;
const nameOf = n => typeof n === "string" && n.trim() && n.trim().length <= 200 && !/[\u0000-\u001f\u007f]/.test(n) ? n.trim() : null;
export function socialProfile(p, raw) {
  if (!raw || typeof raw !== "object") return null;
  if (p === "kakao") {
    const a = raw.kakao_account ?? {};
    const subject = typeof raw.id === "string" && /^\d+$/.test(raw.id) ? raw.id : Number.isSafeInteger(raw.id) && raw.id > 0 ? String(raw.id) : null;
    const name = nameOf(a.name) ?? nameOf(a.profile?.nickname);
    const email = emailOf(a.email);
    return subject && name ? {provider:p,subject,email,name,emailVerified:!!email && a.is_email_valid === true && a.is_email_verified === true} : null;
  }
  if (p === "naver" && raw.resultcode === "00") {
    const a = raw.response ?? {}, subject = a.id, name = nameOf(a.name) ?? nameOf(a.nickname);
    // Official profile response does not attest verification of email. Never use it for merging.
    return typeof subject === "string" && subject.length > 0 && subject.length <= 255 && name ? {provider:p,subject,email:emailOf(a.email),name,emailVerified:false} : null;
  }
  return null;
}
export async function exchangeProvider(p, env, code, verifier, state, request=fetch, origin=ORIGIN) {
  if (p === "google") return {...await exchangeGoogle(env,code,verifier,request,origin),emailVerified:true};
  const c = config[p];
  const body = new URLSearchParams({grant_type:"authorization_code",code,client_id:env[c.id],client_secret:env[c.secret],code_verifier:verifier,redirect_uri:callback(p,origin),...(p==="naver"?{state}:{})});
  const res = await request(c.token,{method:"POST",redirect:"error",headers:{"content-type":"application/x-www-form-urlencoded"},body,signal:AbortSignal.timeout(10000)});
  if (!res.ok) throw Error("token exchange failed");
  const token=await res.json();
  if (token.error || typeof token.access_token!=="string" || !token.access_token || String(token.token_type).toLowerCase()!=="bearer") throw Error("invalid token");
  const profile=await request(c.user,{headers:{authorization:"Bearer "+token.access_token},redirect:"error",signal:AbortSignal.timeout(10000)});
  if (!profile.ok) throw Error("profile failed");
  const identity=socialProfile(p,await profile.json());
  if (!identity) throw Error("profile name or identity unavailable");
  return identity;
}
