import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_ORIGINS, allowedOrigin, callbackUri, matchesFlow, sameOriginPost, accountReturn, cookie, challenge, browserProof, COOKIE } from "../workers/auth/src/lib.js";
import { providerUrl, exchangeProvider, PROVIDERS } from "../workers/auth/src/providers.js";
const env = { GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com", KAKAO_CLIENT_ID: "test-k", NAVER_CLIENT_ID: "test-n" };
const state = "a".repeat(64), proof = "b".repeat(64);

test("두 정확한 HTTPS origin만 허용하며 다른 주소와 포트는 거부", () => {
  assert.deepEqual(ALLOWED_ORIGINS, ["https://tripflip.co.kr", "https://www.tripflip.co.kr"]);
  for (const bad of ["http://tripflip.co.kr","https://tripflip.co.kr.evil.test","https://evil.tripflip.co.kr","https://www.tripflip.co.kr:8443","https://tripflip.co.kr/","https://tripflip.co.kr@evil.test","null",""]) {
    assert.equal(allowedOrigin(bad),false);
    assert.throws(()=>callbackUri("google",bad));
    assert.throws(()=>accountReturn(bad,true));
  }
  assert.throws(()=>callbackUri("evil",ALLOWED_ORIGINS[0]));
});
test("세 공급자 × 두 호스트: 인가·교환 URI 및 완료 복귀 주소가 시작 origin과 같다",async()=>{
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const ch = await challenge(verifier);
  assert.equal(ch,"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  for(const p of PROVIDERS) for(const origin of ALLOWED_ORIGINS){
    const cb = origin + "/auth/" + p + "/callback";
    const url: URL = new URL(providerUrl(p,env,state,ch,origin));
    assert.equal(url.searchParams.get("redirect_uri"), cb);
    assert.equal(url.searchParams.get("state"),state);
    assert.equal(url.searchParams.get("code_challenge"),ch);
    assert.equal(url.searchParams.get("code_challenge_method"),"S256");
    assert.equal(url.searchParams.has("client_secret"),false);
    assert.equal(accountReturn(origin,true),origin+"/account?oauth=done");
    assert.equal(accountReturn(origin,false),origin+"/account?oauth=error");
    const mock:typeof fetch = async(input,init)=>{
      assert.equal(init?.redirect,"manual");
      if(String(input).endsWith("/token")){
        const body=new URLSearchParams(String(init?.body));
        assert.equal(body.get("redirect_uri"),cb);
        assert.equal(body.get("code_verifier"),verifier);
        if(p==="naver") assert.equal(body.get("state"),state);
        return Response.json({access_token:"mock",token_type:"Bearer"});
      }
      return Response.json(p==="google"?{sub:"g1",email:"a@example.com",email_verified:true,name:"사용자"}:
        p==="kakao"?{id:123,kakao_account:{name:"사용자"}}:{resultcode:"00",response:{id:"n1",name:"사용자"}});
    };
    assert.equal((await exchangeProvider(p,env,"code",verifier,state,mock,origin)).provider,p);
  }
});
test("서버에 저장한 시작 origin·공급자가 다르면 콜백·완료 거부, POST Origin도 정확히 일치",()=>{
  for(const p of PROVIDERS) for(const origin of ALLOWED_ORIGINS){
    const other=ALLOWED_ORIGINS.find(o=>o!==origin)!;
    const data={provider:p,origin};
    assert.equal(matchesFlow(data,p,origin),true);
    assert.equal(matchesFlow(data,p,other),false);
    assert.equal(matchesFlow(data,PROVIDERS.find(x=>x!==p)!,origin),false);
    assert.equal(matchesFlow({provider:p},p,origin),false);
    assert.equal(sameOriginPost(origin,origin),true);
    assert.equal(sameOriginPost(other,origin),false);
    assert.equal(sameOriginPost(null,origin),false);
  }
});
test("쿠키는 __Host- 접두사와 Secure·HttpOnly·Lax·Path=/ 유지, Domain 공유 금지",()=>{
  const value=cookie(state+"."+proof,600);
  assert.ok(value.startsWith("__Host-"));
  assert.match(value,/; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  assert.doesNotMatch(value,/;\s*Domain=/i);
  assert.deepEqual(browserProof(COOKIE+"="+state+"."+proof),{state,proof});
  assert.match(cookie("",0),/Max-Age=0$/);
});
