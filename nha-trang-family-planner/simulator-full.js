/* Full-trip simulator: pure previews; never mutates S, localStorage, API or Neon. */
(function(root, make) {
  var api=make(typeof module==="object"&&module.exports?require("./simulator-engine.js"):root.NTPlannerSimulator);
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.NTPlannerFull=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(base) {
  "use strict";
  var VALID=["place","meal","tour","tour_continue"];
  var TOUR_OVERLAP=[
    ["place-011","place-056","place-057"],
    ["place-013","place-045","place-046"],
    ["place-014","place-052","place-053","place-054","place-055"]
  ];
  var SEA_TRANSFER=new Set(["place-010","place-011","place-014","place-015","place-043","place-050","place-051","place-052","place-053","place-054","place-055","place-056","place-057"]);
  var BAD=new Set(["place-006","place-048","place-060","place-052","place-058","place-059"]);
  var VARIANTS=[
    {id:"nearby",label:"🏝️ 이동 부담 줄이기",description:"리조트 기준 기존 이동 추정치를 참고하는 구성. 실제 최단 경로는 아냐."},
    {id:"family",label:"👨‍👩‍👦‍👦 아이 편안함 우선",description:"아이 적합도, 휴식, 과도한 이동을 먼저 고려해."},
    {id:"variety",label:"✨ 새로운 체험 위주",description:"장르 다양성과 안전 범위 내 체험을 고려해."}
  ];
  function usedNames(days,target){
    var names=new Set();
    (days||[]).forEach(function(d,i){
      if(i===target)return;
      (d.slots||[]).forEach(function(s){
        var text=String(s.v||"");
        if(!base.isFree(s)&&text!=="-")names.add(text.replace(/ · 계속$/,""));
      });
    });
    return names;
  }
  function hasName(used,name){return used.has(name)||used.has(name+" · 계속");}
  function tourAlreadyUsed(p, used){
    if(hasName(used,p.name))return true;
    var grp=TOUR_OVERLAP.find(function(g){return g.includes(p.id);});
    return grp && grp.some(function(id) {return hasName(used,(tourCatalog.get(id)||{}).name);});
  }
  var tourCatalog=new Map();
  function copyDays(days){
    return days.map(function(d){return Object.assign({},d,{slots:d.slots.map(function(s){return Object.assign({},s);})});});
  }
  function planningWarning(p,boat){
    var a=["실제 운영·예약·영업시간 확인 필요","체류시간은 계획용 가정","이동시간·출발지·차량 진입점 미검증"];
    if(SEA_TRANSFER.has(p.id)||boat)a.push("케이블카·배편·날씨·어린이 탑승 조건 확인 필요");
    return a;
  }
  function tourOptions(opts,days,index,used,tourHistory){
    if(opts.includeTours===false || opts.pace==="relaxed" || index<2 || index>5)return [];
    if(index===5 && opts.scope==="trip" && tourHistory.length>=2)return [];
    if(tourHistory.some(function(x){return Math.abs(x.day-index)<=1;}))return [];
    var prefs=(opts.themes||[]).filter(Boolean);
    return opts.places.filter(function(p) {
      return p.sourceCategory!=="식사" && p.accessibleTimeSlots.includes("올데이") &&
        p.themeIds.some(function(t){return prefs.includes(t);}) &&
        Number(p.legacyFamilyFitScore5)>=4 && Number(p.legacyTravelFromAmianaMinutes)<=85 &&
        !BAD.has(p.id) && (opts.allowSeaTransfer!==false||!SEA_TRANSFER.has(p.id)) &&
        !tourAlreadyUsed(p,used);
    });
  }
  function tourScore(p,variant,opts){
    var travel=Number(p.legacyTravelFromAmianaMinutes)||99;
    var fit=Number(p.legacyFamilyFitScore5)||1;
    var overlap=(p.themeIds||[]).filter(function(t){return (opts.themes||[]).includes(t);}).length;
    var num=(overlap*40+fit*12);
    if(variant==="nearby")num-=travel*2.8;
    else if(variant==="family")num-=travel*1.65;
    else num-=travel*.6;
    if(SEA_TRANSFER.has(p.id))num-=opts.allowSeaTransfer?15:1000;
    if(p.id==="place-011")num+=variant==="variety"?5:0;
    if(p.id==="place-010")num+=variant==="family"?4:0;
    return num;
  }
  function chooseTour(opts,days,index,variant,history,selectedRows){
    var morning=days[index].slots[0],afternoon=days[index].slots[2];
    if(!base.isFree(morning)||!base.isFree(afternoon))return null;
    var used=usedNames(days,index);
    selectedRows.forEach(function(r){if(r.kind==="existing"&&r.name&&r.name!=="-")used.add(r.name.replace(/ · 계속$/,""));});
    var choices=tourOptions(opts,days,index,used,history).map(function(p) {
      return {record:p,score:tourScore(p,variant,opts)};
    }).sort(function(a,b){return b.score-a.score||a.record.id.localeCompare(b.record.id);});
    // Nearby style does not force a long tour unless user explicitly requests it.
    if(!choices.length || (variant==="nearby"&&opts.tourMode!=="prefer"))return null;
    var selected=choices[0];
    if(variant==="family"&&selected.record.legacyTravelFromAmianaMinutes>60&&opts.tourMode!=="prefer")return null;
    return selected.record;
  }
  function baseDay(opts,days,index,variant){
    var result=base.simulate(Object.assign({},opts,{days:days,dayIndex:index}));
    return result.variants.find(function(v){return v.id===variant;}).slots.map(function(x){return Object.assign({},x,{warnings:(x.warnings||[]).slice()});});
  }
  function camRanhDay(opts,days,variant){
    var d=days[6],rows=d.slots.map(function(s){return {slot:s.k,name:s.v,kind:"existing",id:null,warnings:[]};});
    var used=usedNames(days,6);
    for(var i=0;i<4;i++)if(!base.isFree(d.slots[i]))used.add(String(d.slots[i].v).replace(/ · 계속$/,""));
    var candidates=opts.places.filter(function(p){
      return p.sourceCategory!=="식사"&&!BAD.has(p.id)&&p.accessibleTimeSlots.includes("오전")&&!p.accessibleTimeSlots.includes("올데이")&&
        p.themeIds.some(function(t){return (opts.themes||[]).includes(t);})&&Number(p.legacyTravelFromAmianaMinutes)<=20&&
        Number(p.legacyFamilyFitScore5)>=3&&!used.has(p.name);
    }).sort(function(a,b){
      var sa=(Number(a.legacyFamilyFitScore5)||3)*9-(Number(a.legacyTravelFromAmianaMinutes)||0)*(variant==="nearby"?3:1);
      var sb=(Number(b.legacyFamilyFitScore5)||3)*9-(Number(b.legacyTravelFromAmianaMinutes)||0)*(variant==="nearby"?3:1);
      return sb-sa||a.id.localeCompare(b.id);
    });
    if(base.isFree(d.slots[0])&&candidates.length){
      var p=candidates[Math.min(variant==="variety"?1:0,candidates.length-1)];
      rows[0]={slot:"오전",name:p.name,kind:"place",id:p.id,warnings:["체크아웃 전 시간 확보 필요","아미아나 기준 예전 이동 추정치이며 복귀 경로 미검증","방문 운영시간 미확인"]};
    }else if(base.isFree(d.slots[0])){
      rows[0]={slot:"오전",name:"체크아웃·이동 준비",kind:"guidance",id:null,warnings:["추천 가능한 가까운 방문지 없음"]};
    }
    if(base.isFree(d.slots[1])){
      var meals=opts.restaurants.filter(function(r){
        var str=String(r.legacyDriveFromAmiana||"");
        var minutes=Number((str.match(/\d+/)||[])[0]||999);
        return (opts.lunchCuisine==="all"||!opts.lunchCuisine||r.cuisineId===opts.lunchCuisine)&&
          minutes<=25&&!used.has(r.name)&&!/Costa Seafood/i.test(r.name)&&!/^(하|불가|미추천)/.test(String(r.lunchSuitabilitySource||""));
      }).sort(function(a,b){
        var ta=Number((String(a.legacyDriveFromAmiana||"").match(/\d+/)||[])[0]||99),
            tb=Number((String(b.legacyDriveFromAmiana||"").match(/\d+/)||[])[0]||99);
        return ta-tb||a.id.localeCompare(b.id);
      });
      if(meals.length){
        var m=meals[Math.min(variant==="variety"?1:0,meals.length-1)];
        rows[1]={slot:"점심",name:m.name,kind:"meal",id:m.id,warnings:["11:30~12:30 이용 가능 여부 미확인","체크아웃 시간과 깜란 이동 시간 확인 필요"]};
      }else rows[1]={slot:"점심",name:"이동 전 점심 장소 확인 필요",kind:"guidance",id:null,warnings:["시간·실제 위치 정보 없음"]};
    }
    if(base.isFree(d.slots[3])) rows[3]={slot:"저녁",name:"깜란 숙소·공항 주변 저녁 식당 확인 필요",kind:"guidance",id:null,warnings:["현지 확정 식당 좌표·영업시간 미검증 · 실제 식당으로 저장하지 않음"]};
    return rows;
  }
  function fixedDay(days,index){
    return days[index].slots.map(function(s){return {slot:s.k,name:s.v,kind:"existing",id:null,warnings:[]};});
  }
  function dayResult(opts,days,index,variant,history){
    var rows=index===0||index===7?fixedDay(days,index):index===6?camRanhDay(opts,days,variant):baseDay(opts,days,index,variant);
    var tour=null;
    if(index>=2&&index<=5){
      tour=chooseTour(opts,days,index,variant,history,rows);
      if(tour){
        rows[0]={slot:"오전",name:tour.name,kind:"tour",id:tour.id,warnings:planningWarning(tour)};
        rows[2]={slot:"오후",name:tour.name+" · 계속",kind:"tour_continue",id:tour.id,warnings:["같은 투어의 오후 일정 · 별도 장소 아님","교통·날씨·복귀시간 확인 필요"]};
        if(base.isFree(days[index].slots[1]))
          rows[1]={slot:"점심",name:"투어 현장 점심 · 확인 필요",kind:"guidance",id:null,warnings:["투어 포함 식사·현장 식당·아이 식단 확인 필요","현장 점심이 확정된 것으로 저장하지 않음"]};
        if(base.isFree(days[index].slots[3])&&SEA_TRANSFER.has(tour.id)){
          rows[3].warnings=(rows[3].warnings||[]).concat(["투어 종료 후 귀환·저녁 식사시간 충돌 가능 · 별도 확인"]);
        }
      }
    }
    return {dayIndex:index,dayLabel:days[index].date+" ("+days[index].dow+")",slots:rows,tourId:tour?tour.id:null,
      note:index===0?"늦은 밤 도착일: 기존 일정만 보존":index===7?"귀국일: 기존 일정만 보존":
        index===6?"체크아웃·깜란 이동 고려 · 오후 일정은 보존":tour?"올데이 활동: 오전·오후 동일 투어, 점심은 현장 확인":""};
  }
  function useVirtual(day,rows){
    rows.forEach(function(r,i){if(base.isFree(day.slots[i])&&VALID.includes(r.kind)&&r.id&&r.name&&r.name!=="조건에 맞는 후보 없음")day.slots[i].v=r.name;});
  }
  function generate(opts) {
    if(!opts||!Array.isArray(opts.days)||opts.days.length!==8||!Array.isArray(opts.places)||!Array.isArray(opts.restaurants))throw new Error("여행 일정 데이터 8일이 필요해.");
    tourCatalog=new Map(opts.places.map(function(p){return [p.id,p];}));
    var scope=opts.scope==="trip"?"trip":"day",index=Number(opts.dayIndex);
    if(scope==="day"&&(!Number.isInteger(index)||index<0||index>7))throw new Error("올바른 날짜를 선택해 줘.");
    var themes=Array.from(new Set((opts.themes||[]).filter(Boolean))).slice(0,2);
    if(!themes.length)throw new Error("여행 컨셉을 하나 이상 골라줘.");
    var pace=["relaxed","balanced","packed"].includes(opts.pace)?opts.pace:"balanced";
    var normalized=Object.assign({},opts,{scope:scope,themes:themes,pace:pace});
    var variants=VARIANTS.map(function(v){
      var virtual=copyDays(opts.days),history=[],allDays=[],count=0;
      var indices=scope==="trip"?[0,1,2,3,4,5,6,7]:[index];
      indices.forEach(function(i){
        var day=dayResult(normalized,virtual,i,v.id,history);
        allDays.push(day);
        if(day.tourId)history.push({day:i,id:day.tourId});
        day.slots.forEach(function(r){if(VALID.includes(r.kind)&&r.id)count++;});
        useVirtual(virtual[i],day.slots);
      });
      return {id:v.id,label:v.label,description:v.description,days:allDays,
        slots:scope==="day"?allDays[0].slots:undefined,changeCount:count,containsUnverified:true};
    });
    return {scope:scope,dayIndex:scope==="day"?index:-1,dayLabel:scope==="day"?(opts.days[index].date+" ("+opts.days[index].dow+")"):"1/13~1/20 · 전체 8일",
      themes:themes,pace:pace,variants:variants,
      warnings:["모든 추천은 예약·영업시간·실제 도로/선박 이동시간 검증 전 단계",
        "1/13 도착·1/20 귀국 일정은 그대로 보존",
        "1/19 저녁은 깜란 지역의 확정 식당 데이터가 없어 방문지로 저장하지 않음",
        "올데이 투어의 현장 점심·배편은 별도 확인 필요"]};
  }
  function makeProposal(days,preview,variantId,snapshot){
    if(!preview||!Array.isArray(preview.variants)||!Array.isArray(days)||!Array.isArray(snapshot))
      throw new Error("추천 결과가 없어. 시뮬레이션을 다시 실행해.");
    var v=preview.variants.find(function(x){return x.id===variantId;});
    if(!v||!Array.isArray(v.days))throw new Error("날짜 또는 추천안을 다시 선택해 줘.");
    if(snapshot.length!==8||days.length!==8)throw new Error("일정 자료에 오류가 있어.");
    var changes=[],seen=new Set();
    v.days.forEach(function(d){
      var idx=d.dayIndex;
      if(idx<0||idx>7||!days[idx]||!snapshot[idx]||!Array.isArray(d.slots))throw new Error("추천 날짜 정보를 다시 확인해 줘.");
      for(var i=0;i<4;i++){
        var before=snapshot[idx][i],now=days[idx].slots[i],row=d.slots[i];
        if(!before||!now||!row||before.k!==now.k||before.v!==now.v||!!before.lock!==!!now.lock||row.slot!==now.k)
          throw new Error("추천 이후 일정이 변경됐어. 다시 시뮬레이션해 줘.");
        if(!VALID.includes(row.kind))continue;
        // An empty recommendation is guidance only; never try to write it as a real venue.
        if((row.kind==="place"||row.kind==="meal")&&(!row.id||row.name==="조건에 맞는 후보 없음"))continue;
        if(!base.isFree(before)||!base.isFree(now)||!row.id||!row.name||
          row.name.length>80||row.name==="조건에 맞는 후보 없음"||idx===0||idx===7)
          throw new Error("확정 일정이나 미확인 장소는 반영할 수 없어.");
        var key=idx+":"+i;
        if(seen.has(key))throw new Error("중복된 시간대가 있어.");
        seen.add(key);changes.push({day:idx,slot:i,from:before.v,to:row.name});
      }
    });
    if(!changes.length)throw new Error("반영할 새 장소가 없어. 기존 일정은 그대로 유지돼.");
    if(changes.length>24)throw new Error("한 번에 반영할 수 있는 범위를 초과했어.");
    return changes;
  }
  return {generate:generate,makeProposal:makeProposal,copyDays:copyDays};
});
