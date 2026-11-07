/* Pure, no-cost itinerary preview engine. No DB mutations or external routing claims. */
(function (root, build) {
  var api = build();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NTPlannerSimulator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var UNKNOWN = /^(선택 필요|식당 추천 필요|근거리 한 곳|미정)$/;
  var BAD_PLACES = new Set(["place-006", "place-048", "place-060"]);
  function isFree(slot) { return !!slot && UNKNOWN.test(String(slot.v || "").trim()) && !slot.lock; }
  function fixed(slot) { return !!slot && !isFree(slot); }
  function safeNum(n, fallback) { return Number.isFinite(Number(n)) ? Number(n) : fallback; }
  function resortMinutes(p) {
    var v = p.legacyTravelFromAmianaMinutes;
    if (v !== undefined && v !== null) return safeNum(v, 999);
    var a = String(p.legacyDriveFromAmiana || "").match(/(\d+)/);
    return a ? Number(a[1]) : 999;
  }
  function alreadyUsed(days, target) {
    var names = new Set();
    (days || []).forEach(function (day, i) {
      if (i === target) return;
      (day.slots || []).forEach(function (s) {
        if (fixed(s) && s.v && s.v !== "-") names.add(String(s.v).replace(/ · 계속$/, "").trim());
      });
    });
    return names;
  }
  function isDuplicate(name, used) {
    if (used.has(name)) return true;
    var n = String(name).replace(/나트랑|본점| /g, "").toLowerCase();
    return Array.from(used).some(function (u) {
      var v = u.replace(/나트랑|본점| /g, "").toLowerCase();
      return (n.length >= 5 && v.length >= 5 && (n === v || n.includes(v) || v.includes(n)));
    });
  }
  function placeScore(p, themes, variant, pace) {
    var fit = safeNum(p.legacyFamilyFitScore5, 3), minute = resortMinutes(p);
    var themeHits = p.themeIds.filter(function (v) { return themes.includes(v); }).length;
    var s = themeHits * 65 + fit * 9;
    if (variant === "nearby") s -= Math.min(90, minute * 1.8);
    if (variant === "family") s += fit * 7 - Math.min(65, minute);
    if (variant === "variety") s += Math.min(18, p.subthemeIds.length * 5) - Math.min(35, minute * .45);
    if (pace === "relaxed") s -= Math.max(0, minute - 20) * .9;
    if (pace === "packed") s += 4;
    if (p.sourceCategory === "리조트" && pace === "relaxed") s += 14;
    if (!p.coordinates || p.coordinates.lat === null) s -= 2;
    return s;
  }
  function choosePlace(slotKey, places, themes, used, variant, pace, previous, variantIndex) {
    var pool = places.filter(function (p) {
      return p.sourceCategory !== "식사" && !BAD_PLACES.has(p.id) &&
        p.themeIds.some(function (t) { return themes.includes(t); }) &&
        Array.isArray(p.accessibleTimeSlots) && p.accessibleTimeSlots.includes(slotKey) &&
        !p.accessibleTimeSlots.includes("올데이") && !isDuplicate(p.name, used);
    }).map(function (p) {
      var score = placeScore(p, themes, variant, pace);
      if (previous && p.themeIds.some(function (x) { return previous.themeIds.includes(x); })) score -= variant === "variety" ? 28 : 5;
      return { record: p, score: score };
    }).sort(function (a, b) { return b.score - a.score || a.record.id.localeCompare(b.record.id); });
    var best = pool[Math.min(variantIndex === 2 ? 1 : 0, Math.max(0, pool.length - 1))];
    return best ? best.record : null;
  }
  function chooseMeal(key, restaurants, cuisine, used, variant, variantIndex) {
    var field = key === "점심" ? "lunchSuitabilitySource" : "dinnerSuitabilitySource";
    var pool = restaurants.filter(function (r) {
      return (!cuisine || cuisine === "all" || r.cuisineId === cuisine) && !isDuplicate(r.name, used) &&
        !/^(하|불가|미추천)/.test(String(r[field] || "")) &&
        !r.name.includes("Costa Seafood"); // reopening not independently confirmed for 2027
    }).map(function (r) {
      var t = resortMinutes(r),child = /최상|상/.test(String(r.childFriendlinessSource || "")) ? 10 : 0;
      var score = (/상/.test(String(r[field])) ? 12 : 0) + child + (variant === "nearby" ? -t * 1.3 : -t * .35);
      if (variant === "family") score += child * 2;
      if (variant === "variety") score += (r.foodTags || []).length * 2.5;
      if (r.needsOperatingHoursCheck) score -= 2;
      return {record:r,score:score};
    }).sort(function (a,b) { return b.score - a.score || a.record.id.localeCompare(b.record.id); });
    var choice = pool[Math.min(variantIndex === 2 ? 1 : 0,Math.max(0,pool.length-1))];
    return choice ? choice.record : null;
  }
  function textOf(record) { return record && record.name ? record.name : "조건에 맞는 후보 없음"; }
  function generated(key, record, kind) {
    var warnings = [];
    if (!record) warnings.push("해당 조건의 후보 부족 · 조건을 완화해 줘.");
    else {
      warnings.push("영업시간·예약 가능 여부 확인 필요");
      if (kind === "place") warnings.push("체류시간은 계획용 추정치");
      if (record.coordinates && record.coordinates.routeReady === false) warnings.push("실제 차량 진입점 미검증");
      else if (!record.coordinates || record.coordinates.lat === null) warnings.push("정확한 위치 미검증");
      if (kind === "meal" && record.sourceLastVerified === null) warnings.push("식당 최신 운영정보 재확인");
    }
    return {slot:key,name:textOf(record),kind:kind,id:record && record.id || null,warnings:warnings};
  }
  function simulate(opts) {
    var days = opts.days, index = Number(opts.dayIndex), places = opts.places,restaurants = opts.restaurants;
    if (!Array.isArray(days)||!Array.isArray(places)||!Array.isArray(restaurants)) throw new Error("시뮬레이션 입력 데이터가 불완전해.");
    if (![1,2,3,4,5].includes(index)) throw new Error("도착일·귀국일·깜란 이동일은 1차 시뮬레이션에서 제외돼.");
    var d=days[index];
    if (!d || !Array.isArray(d.slots) || d.slots.length!==4) throw new Error("이 날짜의 일정 구조를 확인할 수 없어.");
    var themes=Array.from(new Set((opts.themes||[]).filter(Boolean))).slice(0,2);
    if (!themes.length) throw new Error("여행 컨셉을 하나 이상 골라줘.");
    var pace=["relaxed","balanced","packed"].includes(opts.pace)?opts.pace:"balanced";
    var previousNames=alreadyUsed(days,index);
    var variants=[
      {id:"nearby",label:"🏝️ 가까운 후보 우선",description:"리조트 기준 예전 이동시간 추정치로만 정렬해. 최단 경로를 보장하지 않아."},
      {id:"family",label:"👨‍👩‍👦‍👦 가족 편안함 우선",description:"아이 적합도와 이동 부담을 더 중요하게 반영해."},
      {id:"variety",label:"✨ 경험 다양성 우선",description:"활동 테마와 음식 선택을 조금 더 다양하게 제안해."}
    ];
    return {dayIndex:index,dayLabel:d.date+" ("+d.dow+")",pace:pace,themes:themes,
      warnings:["실시간 영업시간 및 방문 가능 여부 미검증","차량/선박 도로 경로 최적화 미적용","올데이·섬 투어는 후속 버전에서 별도로 계획"],
      variants:variants.map(function (v,vi) {
        var used=new Set(previousNames), selected=[],lastPlace=null;
        d.slots.forEach(function (sl,k) {
          if (fixed(sl)) {selected.push({slot:sl.k,name:sl.v,kind:"existing",id:null,warnings:[]}); if (sl.v&&sl.v!=="-") used.add(String(sl.v));return;}
          var key=sl.k,record;
          if (key==="점심"||key==="저녁") {
            record=chooseMeal(key,restaurants,key==="점심"?opts.lunchCuisine:opts.dinnerCuisine,used,v.id,vi);
            selected.push(generated(key,record,"meal"));
          } else if (pace==="relaxed" && (k===2 || (k===0 && fixed(d.slots[2])))) {
            selected.push({slot:key,name:"리조트 자유시간 · 휴식 제안",kind:"rest",id:null,warnings:["방문지 대신 휴식 시간을 남겨 둔 미리보기"]});
            return;
          } else {
            record=choosePlace(key,places,themes,used,v.id,pace,lastPlace,vi);
            if(record)lastPlace=record;
            selected.push(generated(key,record,"place"));
          }
          if(record)used.add(record.name);
        });
        return {id:v.id,label:v.label,description:v.description,slots:selected,containsUnverified:true};
      })};
  }
  function makeProposal(days, preview, variantId, originalSlots) {
    if (!preview || !Array.isArray(preview.variants)) throw new Error("추천 결과가 없어. 시뮬레이션을 다시 실행해.");
    var variant = preview.variants.find(function(v) { return v.id === variantId; });
    var index = preview.dayIndex, slots = days && days[index] && days[index].slots;
    if (!variant || !slots || slots.length !== 4 || !Array.isArray(originalSlots) || originalSlots.length !== 4) {
      throw new Error("날짜 또는 추천안을 다시 선택해 줘.");
    }
    var changes = [];
    for (var i = 0; i < 4; i++) {
      var now = slots[i], before = originalSlots[i], row = variant.slots[i];
      if (!now || !before || !row || now.v !== before.v || !!now.lock !== !!before.lock ||
        now.k !== before.k || row.slot !== now.k) {
        throw new Error("추천 이후 일정이 변경됐어. 다시 시뮬레이션해 줘.");
      }
      if (row.kind !== "place" && row.kind !== "meal") continue; // Existing or rest proposal is not written.
      if (!row.id || !isFree(before) || !isFree(now) || row.name === "조건에 맞는 후보 없음") {
        throw new Error("빈 슬롯이 아닌 곳에는 추천을 반영할 수 없어.");
      }
      if (!row.name || row.name.length > 80) throw new Error("추천 장소 정보가 유효하지 않아.");
      changes.push({day:index,slot:i,from:before.v,to:row.name});
    }
    if (!changes.length) throw new Error("이번 추천안에서 새로 반영할 빈 슬롯이 없어.");
    return changes;
  }
  return {simulate:simulate,isFree:isFree,resortMinutes:resortMinutes,makeProposal:makeProposal};
});
