import {beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_QUERY,makeQuestionDraft,loadQuery,saveQuery,saveQuestionPreview,loadQuestionPreview,confirmQuestionPreview,confirmedDefaultLabels,resetStorageFallback} from "../src/lib/flow";
import {QUESTIONS,defaultLabels,questionIndex,selectedQuestions} from "../src/lib/questionFlow";
import {ALL_PLACES,MACAU_DAY_TRIP_PLACES,scoreRegions} from "../src/services/regionScore";
import {byId,placesOf} from "../src/services/planner";
const local=new Map<string,string>(), session=new Map<string,string>();
const storage=(m:Map<string,string>)=>({getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>m.set(k,v),removeItem:(k:string)=>m.delete(k)});
beforeEach(()=>{local.clear();session.clear();resetStorageFallback();Object.defineProperty(globalThis,"localStorage",{configurable:true,value:storage(local)});Object.defineProperty(globalThis,"sessionStorage",{configurable:true,value:storage(session)});});
const progress=(slide:number,answered:Parameters<typeof defaultLabels>[1])=>({open:null,question:0,done:[false,false,false],choice:null,slide,answered:[...answered]});
test("a: 아무것도 선택하지 않아도 기존 기본 날짜·동행과 편도 5시간·가심비",()=>{
  const {q,slide,answered}=makeQuestionDraft();
  assert.equal(slide,0);assert.deepEqual(answered,[]);assert.equal(q.maxFlightHours,5);assert.equal(q.stay,"가심비");assert.equal(q.startDate,DEFAULT_QUERY.startDate);assert.equal(q.adults,DEFAULT_QUERY.adults);
  const p=saveQuestionPreview(q,progress(slide,answered));assert.ok(p.defaults.includes("예산 미정"));assert.ok(p.defaults.includes("숙소 적정 가격대(가심비)"));assert.equal(local.has("tripflip.flow.query"),false);
  assert.ok(scoreRegions(p.q).some(r=>r.status==="ranked"));assert.equal(loadQuery().maxFlightHours,8);
});
test("b: 날짜·동행만 반영하고 나머지 기본값 표시",()=>{
  const q={...makeQuestionDraft().q,startDate:"2027-05-10",endDate:"2027-05-15",adults:3};
  const p=saveQuestionPreview(q,progress(2,["who","when"]));
  assert.equal(p.q.adults,3);assert.equal(p.q.endDate,"2027-05-15");assert.ok(!p.defaults.some(x=>x.startsWith("기본 동행")||x.startsWith("기준 날짜")));assert.ok(p.defaults.includes("예산 미정"));
});
test("c/d: 예산·숙소 및 이전 선택 유지; 미리보기는 확정 검색과 별개",()=>{
  const previous={...DEFAULT_QUERY,startDate:"2027-03-10",endDate:"2027-03-13"};saveQuery(previous);
  const q={...makeQuestionDraft().q,stay:"하이엔드" as const,totalBudgetKrw:10000000,roomCount:2};
  const p=saveQuestionPreview(q,progress(9,["who","when","budget","stay","rooms"]));
  assert.deepEqual(loadQuery(),previous);assert.equal(loadQuestionPreview()?.q.stay,"하이엔드");
  const restored=makeQuestionDraft();assert.equal(restored.slide,9);assert.deepEqual(restored.q,q);assert.deepEqual(restored.answered,["who","when","budget","stay","rooms"]);
  assert.ok(!p.defaults.includes("예산 미정"));assert.ok(!p.defaults.includes("숙소 적정 가격대(가심비)"));
  confirmQuestionPreview(p);assert.deepEqual(loadQuery(),q);assert.deepEqual(confirmedDefaultLabels(q),p.defaults);assert.equal(makeQuestionDraft().slide,9);
});
test("슬라이드 순서와 경계/중복 방지",()=>{assert.deepEqual(QUESTIONS,["who","when","area","vibe","flight","intensity","budget","stay","price","rooms","pet"]);assert.equal(questionIndex(-1),0);assert.equal(questionIndex(99),10);assert.deepEqual(selectedQuestions(["pet","who","who","x"]),["who","pet"]);});
test("마카오 당일치기 명소는 HK 자동 추천/시내 후보에서 제외하고 이전 고정값 조회 유지",()=>{
  assert.equal(MACAU_DAY_TRIP_PLACES.length,3);
  for(const p of MACAU_DAY_TRIP_PLACES){assert.ok(!ALL_PLACES.some(x=>x.id===p.id));assert.equal(byId(p.id)?.name,p.name);}
  assert.ok(!placesOf("HK").some(p=>p.id==="hon-hongkong-883"));
  assert.ok(placesOf("mac-macau").length>0);
  const hk=scoreRegions({...DEFAULT_QUERY}).find(r=>r.region.id==="HK");
  assert.equal(hk?.weather.month,12);
  assert.ok(hk?.top.every(x=>!MACAU_DAY_TRIP_PLACES.some(p=>p.id===x.place.id)));
});

test("다른 탭에서 확정 조건이 변경되어도 명시적으로 이어서 고르면 현재 미리보기의 질문과 선택 복원",()=>{
  const q={...makeQuestionDraft().q,totalBudgetKrw:4500000};
  saveQuestionPreview(q,progress(6,["budget"]));
  const other={...DEFAULT_QUERY,adults:4};
  saveQuery(other);
  assert.deepEqual(loadQuery(),other);
  const resumed=makeQuestionDraft(true);
  assert.equal(resumed.slide,6);
  assert.equal(resumed.q.totalBudgetKrw,4500000);
  assert.deepEqual(resumed.answered,["budget"]);
  assert.deepEqual(loadQuery(),other);
});
