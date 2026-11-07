/* Nha Trang Planner — Coastal Edition visual decorations only.
   No writes to S, localStorage, network, approval flows, or API.
*/
(function(){
  "use strict";
  var hero=document.querySelector(".hero"),bar=document.querySelector(".bar"),
      days=document.getElementById("days"),main=document.getElementById("main");
  if(!hero||!bar||!days||!main)return;
  var pending=/^(선택 필요|식당 추천 필요|근거리 한 곳|미정)$/;
  var filter="all",frame=0;
  function safeSchedule(){
    try{
      if(typeof S==="undefined"||!Array.isArray(S)||S.length!==8)return null;
      if(!S.every(function(day){return day&&Array.isArray(day.slots)&&day.slots.length===4;}))return null;
      return S;
    }catch(e){return null;}
  }
  function countDay(day){
    var missing=0,entered=0;
    day.slots.forEach(function(s){
      var name=String(s&&s.v||"").trim();
      if(!name||name==="-")return;
      if(pending.test(name))missing++;
      else entered++;
    });
    return {missing:missing,entered:entered};
  }
  function installHero(){
    var anchor=hero.querySelector(".hero-account-row");
    if(anchor&&!hero.querySelector(".premium-kicker")){
      var kicker=document.createElement("p");
      kicker.className="premium-kicker";kicker.textContent="✦ NHA TRANG · VIETNAM";
      anchor.insertAdjacentElement("afterend",kicker);
    }
    if(!hero.querySelector(".premium-hero-foot")){
      var foot=document.createElement("div");
      foot.className="premium-hero-foot";
      var trip=document.createElement("span");
      trip.className="premium-hero-pill";trip.textContent="🌴 우리 가족의 8일 여행";
      var dday=document.createElement("span");
      dday.id="premiumDday";dday.className="premium-hero-pill premium-days-pill";
      foot.appendChild(trip);foot.appendChild(dday);
      var date=hero.querySelector(".sub");
      (date||hero.querySelector("h1")).insertAdjacentElement("afterend",foot);
      updateCountdown();
    }
  }
  function updateCountdown(){
    var target=document.getElementById("premiumDday");if(!target)return;
    // Date in Korea (viewer timezone may differ from Vietnam); only the date is used.
    var pieces=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    var val=Object.fromEntries(pieces.filter(function(p){return p.type!=="literal";}).map(function(p){return [p.type,+p.value];}));
    var today=Date.UTC(val.year,val.month-1,val.day),start=Date.UTC(2027,0,13),end=Date.UTC(2027,0,20);
    var remain=Math.round((start-today)/86400000);
    target.textContent=today<start?"✈️ 출발 D-"+remain:today<=end?"🏖️ 여행 중":"📷 여행 기록";
  }
  function addOverview(){
    var wrap=document.createElement("section");
    wrap.className="premium-overview";wrap.id="premiumOverview";
    wrap.setAttribute("aria-label","여행 일정 준비 현황");
    wrap.innerHTML='<div class="premium-overview-card">'+
      '<div class="premium-overview-top"><div><div class="premium-overview-title">☀️ 우리 여행 준비 현황</div>'+
      '<div class="premium-overview-sub">입력된 일정 기준 · 가족 승인 여부와 별개</div></div>'+
      '<span class="premium-progress-label" id="premiumProgressText">계산 중</span></div>'+
      '<div class="premium-progress-track" role="progressbar" aria-label="일정 입력률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="premiumProgressTrack">'+
      '<div class="premium-progress-fill" id="premiumProgressFill"></div></div>'+
      '<div class="premium-stats"><div class="premium-stat"><strong class="premium-stat-value">8일</strong><span class="premium-stat-caption">여행 일정</span></div>'+
      '<div class="premium-stat"><strong class="premium-stat-value" id="premiumEntered">–</strong><span class="premium-stat-caption">입력된 일정</span></div>'+
      '<div class="premium-stat"><strong class="premium-stat-value" id="premiumMissing">–</strong><span class="premium-stat-caption">미정인 일정</span></div></div></div>';
    hero.insertAdjacentElement("afterend",wrap);
  }
  function addFilters(){
    var section=main.querySelector(".st"),bar=document.createElement("div");
    if(!section)return;
    bar.className="premium-filters";bar.setAttribute("role","group");bar.setAttribute("aria-label","일정 상태별 필터");
    [
      {id:"all",title:"🗓️ 전체 8일"},
      {id:"pending",title:"📝 미정 있는 날"},
      {id:"complete",title:"✅ 입력 완료"}
    ].forEach(function(item){
      var b=document.createElement("button");b.type="button";b.className="premium-filter";b.dataset.premiumFilter=item.id;
      b.setAttribute("aria-pressed",item.id==="all"?"true":"false");b.textContent=item.title;
      b.addEventListener("click",function(){filter=item.id;applyFilter();});
      bar.appendChild(b);
    });
    section.insertAdjacentElement("afterend",bar);
  }
  function decorate(){
    frame=0;
    var schedule=safeSchedule();
    if(!schedule)return;
    var counts=schedule.map(countDay);
    var entered=counts.reduce(function(v,c){return v+c.entered;},0);
    var missing=counts.reduce(function(v,c){return v+c.missing;},0);
    var progress=entered+missing>0?Math.round(100*entered/(entered+missing)):100;
    var e=document.getElementById("premiumEntered"),m=document.getElementById("premiumMissing");
    var p=document.getElementById("premiumProgressText"),fill=document.getElementById("premiumProgressFill");
    var track=document.getElementById("premiumProgressTrack");
    if(e)e.textContent=entered+"개";
    if(m)m.textContent=missing+"개";
    if(p)p.textContent=progress+"% 입력";
    if(fill)fill.style.width=progress+"%";
    if(track)track.setAttribute("aria-valuenow",String(progress));
    Array.from(days.querySelectorAll(".day")).forEach(function(card,i){
      if(i>=schedule.length)return;
      var count=counts[i],done=count.missing===0;
      card.dataset.dayStatus=done?"complete":"pending";
      if(i===0)card.dataset.special="arrival";
      else if(i===6)card.dataset.special="departure";
      else if(i===7)card.dataset.special="return";
      else card.removeAttribute("data-special");
      var badge=card.querySelector(".badge");
      if(badge){
        var value=done?"✓ 입력 완료":count.missing+"개 미정";
        if(badge.textContent!==value)badge.textContent=value;
        badge.classList.toggle("premium-done",done);
      }
      var title=card.querySelector(".dt");
      if(title&&!title.querySelector(".premium-day-eyebrow")){
        var eyebrow=document.createElement("div");eyebrow.className="premium-day-eyebrow";
        eyebrow.textContent=i===0?"ARRIVAL":i===6?"CAM RANH TRANSFER":i===7?"HOMEWARD":"FAMILY ITINERARY";
        title.insertBefore(eyebrow,title.firstChild);
      }
      var slots=card.querySelectorAll(".sl");
      slots.forEach(function(el,k){
        var source=schedule[i].slots[k];if(!source)return;
        var blank=pending.test(String(source.v||"").trim());
        el.classList.toggle("premium-slot-empty",blank);
        el.classList.toggle("premium-slot-locked",!!source.lock);
      });
    });
    applyFilter();
  }
  function applyFilter(){
    Array.from(document.querySelectorAll("[data-premium-filter]")).forEach(function(b){
      b.setAttribute("aria-pressed",b.dataset.premiumFilter===filter?"true":"false");
    });
    Array.from(days.querySelectorAll(".day")).forEach(function(card){
      var done=card.dataset.dayStatus==="complete";
      card.hidden=filter==="pending"?done:filter==="complete"?!done:false;
      if(card.hidden)card.style.display="none";
      else card.style.removeProperty("display");
    });
    var visible=Array.from(days.querySelectorAll(".day")).filter(function(x){return !x.hidden;}).length;
    var empty=days.querySelector("#premiumEmptyState");
    if(!visible){
      if(!empty){empty=document.createElement("div");empty.id="premiumEmptyState";empty.className="premium-overview-card";
        empty.style.cssText="text-align:center;margin:10px 0 20px;color:#597b83;font-size:13px;line-height:1.7;padding:24px";
        days.appendChild(empty);}
      empty.textContent="🌿 이 조건에 해당하는 날짜가 없어. 다른 필터를 선택해 줘.";
    }else if(empty)empty.remove();
  }
  function scheduleFrame(){
    if(!frame)frame=requestAnimationFrame(decorate);
  }
  installHero();
  addOverview();
  addFilters();
  scheduleFrame();
  new MutationObserver(function(){scheduleFrame();}).observe(days,{childList:true});
  window.addEventListener("pageshow",scheduleFrame);
  // When a family-approved plan refreshes, the existing renderer recreates #days; observer updates automatically.
})();
