/* Suggestion persistence through authenticated family API only. */
(function (root, factory) {
  var out = factory();
  if (typeof module === "object" && module.exports) module.exports = out;
  root.NTPlannerCommit = out;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function publishMatrix(days) {
    return days.map(function(d){return d.slots.map(function(s){return s.v;});});
  }
  function makePayload(days, preview, variantId, initialSnapshot, remote) {
    var full=!!(preview && preview.variants && preview.variants[0] && Array.isArray(preview.variants[0].days));
    var simulator=typeof module==="object"&&module.exports?(full?require("./simulator-full.js"):require("./simulator-engine.js")):(full?window.NTPlannerFull:window.NTPlannerSimulator);
    var changes=simulator.makeProposal(days,preview,variantId,initialSnapshot);
    var version = Number(remote.version);
    if(!Number.isInteger(version)||version<0)throw new Error("공통 일정 버전을 확인할 수 없어.");
    var matrix=remote.plan;
    if(version && (!Array.isArray(matrix)||matrix.length!==8))throw new Error("공통 일정 데이터에 오류가 있어.");
    if(matrix){
      for(var i=0;i<changes.length;i++){
        var c=changes[i];
        if(!matrix[c.day] || matrix[c.day][c.slot]!==c.from){
          var error=new Error("그 사이 다른 가족이 일정을 수정했어. 새로고침하고 다시 추천해 줘.");
          error.code="stale_schedule";throw error;
        }
      }
    }
    return {
      action:"simulation_commit",baseVersion:version,changes:changes,
      seedPlan:matrix?undefined:publishMatrix(days),
      memo:"🧭 일정 시뮬레이션 "+(preview.variants.find(function(v){return v.id===variantId;})||{}).label
    };
  }
  async function request(body){
    var response=await fetch("/api",body?{
      method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
    }:{method:"GET",credentials:"same-origin",cache:"no-store"});
    var json={};try{json=await response.json();}catch(e){}
    if(!response.ok){
      var err=new Error(response.status===503?"가족 저장 서버가 연결되지 않았어.":({
        stale_schedule:"다른 가족이 그 사이 일정을 수정했어. 새로고침한 뒤 다시 추천해 줘.",
        slot_no_longer_empty:"이미 확정된 일정이 있어. 새로고침 후 다시 추천해 줘.",
        no_published_schedule:"아직 공통 일정이 없어. 관리자에게 먼저 게시를 요청해 줘.",
        must_change_pin:"먼저 가족 화면에서 PIN을 변경해 줘.",
        login_required:"가족 로그인이 필요해.",
        bad_changes:"반영할 추천이 없어. 다시 선택해 줘."
      })[json.error]||"가족 일정 저장에 실패했어 ("+String(json.error||response.status)+").");
      err.code=json.error||"api_error";throw err;
    }
    return json;
  }
  async function apply(days,preview,variantId,snapshot){
    var latest=await request();
    if(!latest.me){var e=new Error("가족 로그인 후 다시 추천안을 눌러 줘.");e.code="login_required";throw e;}
    if(latest.me.mustChange){var p=new Error("가족 화면에서 먼저 PIN을 변경해 줘.");p.code="must_change_pin";throw p;}
    var payload=makePayload(days,preview,variantId,snapshot,latest);
    var name=preview.variants.find(function(v){return v.id===variantId;}).label;
    var confirmation=latest.me.role==="admin"
      ?"관리자로서 '"+name+"'의 빈 슬롯 "+payload.changes.length+"곳을 모두의 최신 일정에 게시할까? 기존 다른 슬롯은 유지돼."
      :"'"+name+"'의 빈 슬롯 "+payload.changes.length+"곳을 관리자에게 변경 요청으로 보낼까? 승인 전에는 공통 일정이 바뀌지 않아.";
    if(typeof confirm!=="undefined"&&!confirm(confirmation)){
      var e=new Error("사용자가 반영을 취소했어.");e.code="cancelled";throw e;
    }
    return request(payload);
  }
  return {makePayload:makePayload,apply:apply};
});
