import test from "node:test";
import assert from "node:assert/strict";
import { callback, providerUrl, socialProfile, exchangeProvider, enabled } from "../workers/auth/src/providers.js";
import { resolveIdentity, validIdentity } from "../workers/stats/src/oauth.js";
const env={GOOGLE_CLIENT_ID:"test.apps.googleusercontent.com",KAKAO_CLIENT_ID:"test-k",NAVER_CLIENT_ID:"test-n"};
test("세 공급자의 고정 콜백, S256, state, 비밀 설정 없으면 비활성",()=>{
  for(const p of ["google","kakao","naver"] as const){
    const u=new URL(providerUrl(p,env,"state","challenge"));
    assert.equal(u.searchParams.get("redirect_uri"),"https://tripflip.co.kr/auth/"+p+"/callback");
    assert.equal(callback(p),u.searchParams.get("redirect_uri"));
    assert.equal(u.searchParams.get("code_challenge_method"),"S256");
    assert.equal(u.searchParams.get("state"),"state");
    assert.equal(u.searchParams.has("client_secret"),false);
    assert.equal(enabled(env,p),false);
  }
});
test("이메일 없이 가입, 카카오 인증 두 조건, 네이버 미검증 이메일",()=>{
  const k={id:123,kakao_account:{name:"사용자",email:"User@example.com",is_email_verified:true,is_email_valid:true}};
  const verified=socialProfile("kakao",k);
  assert.equal(verified?.emailVerified,true);
  assert.ok(validIdentity(verified));
  assert.equal(socialProfile("kakao",{...k,kakao_account:{...k.kakao_account,is_email_valid:false}})?.emailVerified,false);
  assert.deepEqual(socialProfile("kakao",{id:123,kakao_account:{profile:{nickname:"사용자"}}}),{provider:"kakao",subject:"123",email:null,name:"사용자",emailVerified:false});
  assert.equal(socialProfile("kakao",{...k,id:Number.MAX_SAFE_INTEGER+1}),null);
  const n=socialProfile("naver",{resultcode:"00",response:{id:"n1",name:"사용자",email:"User@example.com"}});
  assert.equal(n?.emailVerified,false);
  assert.ok(validIdentity(n));
  assert.equal(socialProfile("naver",{resultcode:"00",response:{id:"n1",name:"사용자"}})?.email,null);
  assert.equal(socialProfile("naver",{resultcode:"01",response:{id:"n1",name:"사용자"}}),null);
});
test("인증된 이메일 일치만 병합, 기존 공급자 ID는 유지, 다른 계정 탈퇴 거절",()=>{
  assert.deepEqual(resolveIdentity({intent:"login",emailUids:[]}),{create:true});
  assert.deepEqual(resolveIdentity({intent:"login",emailUids:["u"]}),{uid:"u"});
  assert.equal(resolveIdentity({intent:"login",emailUids:["u"],existingProvider:true}),null);
  assert.deepEqual(resolveIdentity({intent:"login",subjectUid:"u",emailUids:["other"]}),{uid:"u"});
  assert.deepEqual(resolveIdentity({intent:"withdraw",currentUid:"u",subjectUid:"u",emailUids:[]}),{uid:"u"});
  assert.equal(resolveIdentity({intent:"withdraw",currentUid:"u",subjectUid:"other",emailUids:["u"]}),null);
});
test("카카오·네이버 코드 교환: 고정 HTTPS, verifier, 네이버 state, 토큰 오류 거부",async()=>{
  for(const p of ["kakao","naver"] as const){
    const calls:string[]=[];
    const mock:typeof fetch=async(input,init)=>{
      const url=String(input);calls.push(url);
      assert.equal(init?.redirect,"error");
      if(url.endsWith("/token")){
        const body=new URLSearchParams(String(init?.body));
        assert.equal(body.get("code_verifier"),"verifier");
        assert.equal(body.get(p==="naver"?"state":"redirect_uri"),p==="naver"?"state":callback(p));
        return Response.json({access_token:"fake",token_type:"bearer"});
      }
      return Response.json(p==="kakao"?{id:123,kakao_account:{name:"사용자"}}:{resultcode:"00",response:{id:"n1",name:"사용자"}});
    };
    assert.ok(await exchangeProvider(p,env,"code","verifier","state",mock));
    assert.deepEqual(calls,p==="kakao"?["https://kauth.kakao.com/oauth/token","https://kapi.kakao.com/v2/user/me"]:["https://nid.naver.com/oauth2/token","https://openapi.naver.com/v1/nid/me"]);
    await assert.rejects(exchangeProvider(p,env,"code","verifier","state",async()=>Response.json({error:"bad"})));
  }
});
