import { DurableObject } from "cloudflare:workers";
import { ORIGIN, TTL, cookie, browserProof, random, same, validRandom, validIntent, validDevice, challenge } from "./lib.js";
import { enabled, providerUrl, exchangeProvider } from "./providers.js";

const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const fail = "소셜 로그인에 실패했어요. 다시 시도하거나 다른 소셜 계정을 이용해 주세요.";
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, "content-type": "application/json; charset=utf-8", ...extra },
});
const redirect = (ok, clear = false) => new Response(null, { status: 303, headers: {
  ...headers, location: ORIGIN + "/account?oauth=" + (ok ? "done" : "error"), ...(clear ? { "set-cookie": cookie("", 0) } : {}),
}});
const stats = env => env.STATS.get(env.STATS.idFromName("main"));
const flow = (env, state) => env.OAUTH_FLOW.get(env.OAUTH_FLOW.idFromName(state));
const read = async req => {
  if (req.headers.get("origin") !== ORIGIN || !/^application\/json(?:;|$)/i.test(req.headers.get("content-type") ?? "")) return null;
  const raw = await req.text();
  if (raw.length > 2000) return null;
  try { return JSON.parse(raw); } catch { return null; }
};
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.origin !== ORIGIN) return json({ ok: false }, 403);
    const route = url.pathname.match(/^\/auth\/(google|kakao|naver)\/(start|callback|complete)$/);
    if (!route) return json({ ok: false }, 404);
    const [, provider, action] = route;
    try {
      if (req.method === "POST" && action === "start") {
        if (!enabled(env,provider)) return json({ ok: false, error: fail }, 503);
        const b = await read(req);
        if (!validIntent(b)) return json({ ok: false, error: fail }, 400);
        // Check existing session and rate limit using private binding, never a public identity-assertion endpoint.
        const check = await stats(env).oauthStart(b.intent, b.token ?? null, b.v, req.headers.get("cf-connecting-ip") || "");
        if (!check.ok) return json({ ok: false, error: fail }, 403);
        const state = random(), proof = random(), verifier = random();
        await flow(env, state).begin({ provider, proof, verifier, intent: b.intent, v: b.v, sessionHash: check.sessionHash ?? null, expires: Date.now() + TTL });
        return json({ ok: true, url: providerUrl(provider, env, state, await challenge(verifier)) }, 200, { "set-cookie": cookie(state + "." + proof, TTL / 1000) });
      }
      if (req.method === "GET" && action === "callback") {
        const b = browserProof(req.headers.get("cookie"));
        const state = url.searchParams.get("state"), code = url.searchParams.get("code");
        if (!enabled(env,provider) || !b || !validRandom(state) || !same(b.state, state) || !code || code.length > 4096 || url.searchParams.has("error")) return redirect(false, true);
        const stub = flow(env, state);
        const pending = await stub.claim(b.proof, provider);
        if (!pending) return redirect(false, true);
        const profile = await exchangeProvider(provider, env, code, pending.verifier, state);
        if (!await stub.finish(b.proof, profile)) return redirect(false, true);
        return redirect(true);
      }
      if (req.method === "POST" && action === "complete") {
        const b = await read(req), proof = browserProof(req.headers.get("cookie"));
        if (!b || !validDevice(b.v) || !proof || !same(b.state, proof.state) || !["login", "withdraw"].includes(b.intent) || (b.token != null && (typeof b.token !== "string" || !/^[a-f0-9]{48}$/.test(b.token)))) return json({ ok: false, error: fail }, 400);
        const pending = await flow(env, proof.state).consume(proof.proof, b.v, b.intent, provider);
        if (!pending) return json({ ok: false, error: fail }, 400, { "set-cookie": cookie("", 0) });
        const result = await stats(env).oauthAccount(pending.profile, pending.intent, b.token ?? null, pending.sessionHash, b.v);
        return json(result.ok ? result : { ok: false, error: result.error ?? fail }, result.ok ? 200 : 409, { "set-cookie": cookie("", 0) });
      }
      return json({ ok: false }, 404);
    } catch {
      // Never log provider responses, secrets, codes, profile data, cookies or session tokens.
      if (req.method === "GET") return redirect(false, true);
      return json({ ok: false, error: fail }, 503, { "set-cookie": cookie("", 0) });
    }
  },
};

// One isolated, expiring flow per state. Synchronous SQLite mutations make claim/consume single-use.
export class OAuthFlow extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.storage = ctx.storage;
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS flow (id INTEGER PRIMARY KEY, phase TEXT NOT NULL, data TEXT NOT NULL)");
  }
  async begin(data) {
    if (this.sql.exec("SELECT id FROM flow").toArray().length) throw Error("flow exists");
    this.sql.exec("INSERT INTO flow VALUES (1, 'new', ?)", JSON.stringify(data));
    await this.storage.setAlarm(data.expires);
  }
  get(phase, proof) {
    const row = this.sql.exec("SELECT data FROM flow WHERE id=1 AND phase=?", phase).toArray()[0];
    const data = row ? JSON.parse(row.data) : null;
    return data && data.expires > Date.now() && same(data.proof, proof) ? data : null;
  }
  claim(proof, provider) {
    const data = this.get("new", proof);
    if (!data || data.provider !== provider) return null;
    const { verifier, ...rest } = data;
    this.sql.exec("UPDATE flow SET phase='claimed', data=? WHERE id=1", JSON.stringify(rest));
    return { verifier };
  }
  finish(proof, profile) {
    const data = this.get("claimed", proof);
    if (!data || data.provider !== profile.provider) return false;
    this.sql.exec("UPDATE flow SET phase='ready', data=? WHERE id=1", JSON.stringify({ ...data, profile }));
    return true;
  }
  consume(proof, v, intent, provider) {
    const data = this.get("ready", proof);
    if (!data || data.v !== v || data.intent !== intent || data.provider !== provider) return null;
    this.sql.exec("DELETE FROM flow WHERE id=1");
    return { profile: data.profile, intent: data.intent, sessionHash: data.sessionHash };
  }
  async alarm() { await this.storage.deleteAll(); }
}
