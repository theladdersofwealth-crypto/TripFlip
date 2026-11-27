import test from "node:test";
import assert from "node:assert/strict";
import { accountReturn, exchangeGoogle } from "../workers/auth/src/lib.js";
import { exchangeProvider } from "../workers/auth/src/providers.js";
const env={GOOGLE_CLIENT_ID:"test.apps.googleusercontent.com",GOOGLE_CLIENT_SECRET:" s \r\n",KAKAO_CLIENT_ID:"k",KAKAO_CLIENT_SECRET:"ks\n",NAVER_CLIENT_ID:"n",NAVER_CLIENT_SECRET:"ns\r\n"};
const o="https://tripflip.co.kr";
test("실패 사유 코드는 안전한 형식만 주소에 붙는다",()=>{
  assert.equal(accountReturn(o,false,"token_http"),o+"/account?oauth=error&reason=token_http");
  assert.equal(accountReturn(o,false,"bad&x=1"),o+"/account?oauth=error");
  assert.equal(accountReturn(o,true,"token_http"),o+"/account?oauth=done");
});
test("Workers는 redirect:error를 거부하므로 manual만 쓰고, 시크릿 끝 공백·개행은 제거한다",async()=>{
  for(const p of ["google","kakao","naver"] as const){
    const mock:typeof fetch=async(input,init)=>{
      assert.equal(init?.redirect,"manual");
      if(String(input).endsWith("/token")){
        const s=new URLSearchParams(String(init?.body)).get("client_secret");
        assert.ok(s && s===s.trim());
        return Response.json({access_token:"t",token_type:"bearer"});
      }
      return Response.json(p==="google"?{sub:"1",email:"a@b.co",email_verified:true,name:"n"}:p==="kakao"?{id:1,kakao_account:{profile:{nickname:"n"}}}:{resultcode:"00",response:{id:"1",name:"n"}});
    };
    assert.ok(p==="google"?await exchangeGoogle(env,"c","v",mock):await exchangeProvider(p,env,"c","v","s",mock));
  }
});
test("단계별 사유 코드와 비밀값 없는 상세",async()=>{
  const r=(e:unknown)=>e as {reason:string;detail:Record<string,unknown>};
  await assert.rejects(exchangeProvider("kakao",env,"c","v","s",async()=>Response.json({error:"invalid_client",error_code:"KOE010"},{status:401})),e=>{const x=r(e);return x.reason==="token_http"&&x.detail.status===401&&x.detail.error==="invalid_client";});
  await assert.rejects(exchangeProvider("naver",env,"c","v","s",async()=>Response.json({error:"invalid_request",error_description:"no valid data"})),e=>r(e).reason==="token_error");
  const prof=async(input:RequestInfo|URL)=>String(input).endsWith("/token")?Response.json({access_token:"t",token_type:"bearer"}):Response.json({id:7,kakao_account:{profile_nickname_needs_agreement:true}});
  await assert.rejects(exchangeProvider("kakao",env,"c","v","s",prof as typeof fetch),e=>{const x=r(e);return x.reason==="profile_invalid"&&x.detail.hasNickname===false;});
  await assert.rejects(exchangeGoogle(env,"c","v",async()=>new Response(null,{status:302,headers:{location:"https://x"}})),e=>r(e).reason==="token_http");
});
