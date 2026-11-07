/* Simulator interface: preview first; authenticated commit through existing family API. */
(function () {
  "use strict";
  var button=document.createElement("button");
  button.type="button";button.textContent="🧭 일정 시뮬레이션";
  button.id="ntSimButton";button.style.cssText="background:#0c766e;color:white;font-weight:700";
  var bar=document.querySelector(".bar");
  if (!bar || !window.NTPlannerSimulator) return;
  bar.insertBefore(button,bar.firstChild);
  var shell=document.createElement("div");
  shell.id="ntSimOverlay";
  shell.style.display="none";
  shell.innerHTML='<style>'+
  '#ntSimOverlay{position:fixed;inset:0;z-index:99999;background:rgba(15,34,42,.65);align-items:center;justify-content:center;padding:15px;box-sizing:border-box}'+
  '#ntSimOverlay .ntSimPane{width:min(680px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:20px;padding:18px;box-sizing:border-box;box-shadow:0 18px 60px #1234;color:#173042}'+
  '#ntSimOverlay .ntSimHead{display:flex;align-items:center;justify-content:space-between;gap:10px}'+
  '#ntSimOverlay h2{margin:0;font-size:21px}#ntSimOverlay h3{margin:0 0 8px;font-size:16px}'+
  '#ntSimOverlay .ntSimX{background:#edf2f7;border:0;border-radius:12px;padding:8px 12px}'+
  '#ntSimOverlay .ntSimSub{font-size:12px;color:#526776;line-height:1.6;margin:10px 0}'+
  '#ntSimOverlay .ntSimGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}'+
  '#ntSimOverlay label{display:block;font-size:12px;font-weight:700;color:#345;margin:7px 0}'+
  '#ntSimOverlay select{width:100%;display:block;font-size:14px;background:#f7fafb;border:1px solid #dae3e7;border-radius:10px;margin-top:5px;padding:12px 8px;color:#213f4d}'+
  '#ntSimOverlay .ntSimGo{width:100%;padding:14px;border:0;background:#06766e;color:white;border-radius:12px;font-size:15px;font-weight:800;margin:14px 0 10px}'+
  '#ntSimOverlay .ntSimCard{border:1px solid #d9e3e8;border-radius:14px;padding:14px;margin:12px 0;background:#fbfdfd}'+
  '#ntSimOverlay .ntSimRow{padding:9px 0;border-top:1px solid #e5edef}'+
  '#ntSimOverlay .ntSimRow strong{font-size:14px}#ntSimOverlay .ntSimRow small{display:block;color:#a06524;font-size:11px;line-height:1.5;margin-top:4px}'+
  '#ntSimOverlay .ntSimBadge{display:inline-block;font-size:11px;padding:4px 7px;background:#e6f5f1;border-radius:8px;margin:4px 0}'+
  '#ntSimOverlay .ntSimCaution{font-size:12px;line-height:1.6;color:#995b16;background:#fff7e6;border-radius:10px;padding:10px}'+
  '#ntSimOverlay .ntSimSave{display:block;width:100%;border:0;border-radius:11px;padding:12px 8px;margin-top:10px;background:#146bd1;color:#fff;font-size:13px;font-weight:800}'+
  '#ntSimOverlay .ntSimSave:disabled{opacity:.5}#ntSimOverlay .ntSimStatus{font-size:13px;line-height:1.6;color:#146bd1;padding:7px 0}'+
  '#ntSimOverlay .ntSimDay{border:1px solid #e3eaf1;border-radius:11px;background:white;margin:7px 0;overflow:hidden}'+
  '#ntSimOverlay .ntSimDay summary{font-weight:800;padding:10px 11px;cursor:pointer;font-size:13px;color:#173042}'+
  '#ntSimOverlay .ntSimDay .ntSimRow{margin:0 10px}#ntSimOverlay .ntSimSmall{font-size:11px;color:#7a8691;margin:0 11px 9px;line-height:1.5}'+
  '#ntSimOverlay .ntSimCheck{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px}'+
  '#ntSimOverlay .ntSimCheck input{width:auto;accent-color:#08766e}'+
  '@media(max-width:390px){#ntSimOverlay .ntSimGrid{grid-template-columns:1fr}}'+
  '</style><div class="ntSimPane" role="dialog" aria-modal="true" aria-labelledby="ntSimTitle">'+
  '<div class="ntSimHead"><h2 id="ntSimTitle">🧭 일정 시뮬레이션</h2><button type="button" class="ntSimX" id="ntSimClose">닫기 ✕</button></div>'+
  '<p class="ntSimSub">컨셉·음식 장르·강도를 고른 뒤 추천안을 선택해. 관리자는 공통 일정에 게시하고 가족은 승인 요청을 보낼 수 있어.</p>'+
  '<div id="ntSimFields"><p>데이터를 불러오는 중…</p></div><div id="ntSimStatus" class="ntSimStatus" role="status" aria-live="polite"></div><div id="ntSimResults" aria-live="polite"></div></div>';
  document.body.appendChild(shell);
  var query=function (id) {return shell.querySelector("#"+id);};
  function escapeHtml(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function makeOpts(list,first){return (first||"")+list.map(function(x){return '<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.label)+'</option>';}).join("");}
  function close(){shell.style.display="none";button.focus();}
  query("ntSimClose").addEventListener("click",close);
  shell.addEventListener("click",function(e){if(e.target===shell)close();});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&shell.style.display!=="none")close();});
  var data=null, lastPreview=null, lastOriginalSlots=null, busy=false, applied=false;
  async function getData(){
    if(data)return data;
    var files=["/data/simulation/taxonomy.json","/data/simulation/place-index.json","/data/simulation/restaurant-index.json"];
    var results=await Promise.all(files.map(async function(file){
      var r=await fetch(file,{cache:"no-cache"});
      if(!r.ok)throw new Error("데이터 로딩 오류: "+file+" ("+r.status+")");
      return r.json();
    }));
    if(!results[1].places||results[1].places.length<60||!results[2].restaurants||results[2].restaurants.length<50)throw new Error("장소 DB 수량이 맞지 않아.");
    return data={taxonomy:results[0],places:results[1].places,restaurants:results[2].restaurants};
  }
  function renderFields(){
    var T=data.taxonomy,themes=T.themes.filter(function(x){return x.id!=="dining";}),cus=T.cuisines;
    var days=S.map(function(d,i){return {id:String(i),label:d.date+" · "+d.title};});
    query("ntSimFields").innerHTML='<div class="ntSimGrid">'+
      '<label>🗓️ 추천 범위<select id="ntSimScope"><option value="day">하루만 추천</option><option value="trip">전체 여행 (8일) 추천</option></select></label>'+
      '<label>📅 날짜<select id="ntSimDay">'+makeOpts(days)+'</select></label>'+
      '<label>⏱️ 일정 강도<select id="ntSimPace"><option value="relaxed">여유</option><option value="balanced" selected>보통</option><option value="packed">타이트 (최대 2개 활동 슬롯)</option></select></label>'+
      '<label>🎯 여행 컨셉 1<select id="ntSimTheme1">'+makeOpts(themes)+'</select></label>'+
      '<label>🎨 여행 컨셉 2 (선택)<select id="ntSimTheme2">'+makeOpts(themes,'<option value="">선택 안 함</option>')+'</select></label>'+
      '<label>🍜 점심 장르<select id="ntSimLunch">'+makeOpts(cus,'<option value="all">전체 음식</option>')+'</select></label>'+
      '<label>🦐 저녁 장르<select id="ntSimDinner">'+makeOpts(cus,'<option value="all">전체 음식</option>')+'</select></label>'+
      '</div><label class="ntSimCheck"><input id="ntSimTours" type="checkbox" checked> 🎡 올데이·테마파크 투어 후보 포함</label>'+
      '<label class="ntSimCheck"><input id="ntSimSea" type="checkbox" checked> 🚢 케이블카·배편 이동 투어도 검토 (운항·아이 탑승 조건 미확인)</label>'+
      '<button type="button" class="ntSimGo" id="ntSimRun">✨ 추천 3안 미리보기</button>'+
      '<div class="ntSimCaution">🛡️ 1/13 도착·1/20 귀국 일정은 보호해. 1/19는 체크아웃 전 가까운 장소만 추천하고, 깜란 저녁은 식당 미확인으로 남겨 둬. 투어의 점심·배편·영업시간은 예약 전 확인이 필요해.</div>';
    query("ntSimDay").value="2";
    query("ntSimTheme1").value="relax";
    query("ntSimTheme2").value="sightseeing";
    query("ntSimLunch").value="vietnamese";
    query("ntSimDinner").value="seafood";
    query("ntSimRun").addEventListener("click",run);
    query("ntSimScope").onchange=function(){
      query("ntSimDay").disabled=query("ntSimScope").value==="trip";
    };
    query("ntSimFields").onchange=function(){
      lastPreview=null;lastOriginalSlots=null;applied=false;
      query("ntSimResults").textContent="설정이 바뀌었어. 추천안을 다시 생성해 줘.";
      query("ntSimStatus").textContent="";
    };
  }
  function run(){
    try{
      var result=window.NTPlannerFull.generate({
        days:S,scope:query("ntSimScope").value,dayIndex:Number(query("ntSimDay").value),
        themes:[query("ntSimTheme1").value,query("ntSimTheme2").value],
        pace:query("ntSimPace").value,
        lunchCuisine:query("ntSimLunch").value,dinnerCuisine:query("ntSimDinner").value,
        includeTours:query("ntSimTours").checked,allowSeaTransfer:query("ntSimSea").checked,
        places:data.places,restaurants:data.restaurants
      });
      lastPreview=result;
      lastOriginalSlots=S.map(function(d){return d.slots.map(function(s){return {k:s.k,v:s.v,lock:!!s.lock};});});
      applied=false;
      query("ntSimStatus").textContent="";
      function rowHtml(row){
        var badges=row.kind==="existing"?"기존 일정 보존":row.kind==="tour"?"올데이 투어":
          row.kind==="tour_continue"?"같은 투어 · 오후":row.kind==="guidance"?"저장하지 않는 안내":row.kind==="rest"?"휴식 제안":"추천 후보";
        return '<div class="ntSimRow"><span class="ntSimBadge">'+escapeHtml(row.slot)+'</span> <strong>'+escapeHtml(row.name)+'</strong>'+
          ' <span class="ntSimBadge">'+escapeHtml(badges)+'</span>'+
          (row.warnings&&row.warnings.length?'<small>⚠️ '+row.warnings.map(escapeHtml).join(" · ")+'</small>':"")+'</div>';
      }
      var html='<p class="ntSimSub"><strong>'+escapeHtml(result.dayLabel)+'</strong> · 3가지 추천안 중 선택 · 저장 전 확인 필수</p>';
      result.variants.forEach(function(v){
        html+='<article class="ntSimCard"><h3>'+escapeHtml(v.label)+'</h3><p class="ntSimSub">'+escapeHtml(v.description)+'</p>';
        if(result.scope==="trip"){
          v.days.forEach(function(d){
            var tour=d.tourId?' · 🎡 올데이':'';
            html+='<details class="ntSimDay" '+(d.dayIndex===2?'open':'')+'><summary>'+
              escapeHtml(d.dayLabel)+escapeHtml(tour)+'</summary>'+
              (d.note?'<p class="ntSimSmall">'+escapeHtml(d.note)+'</p>':"")+
              d.slots.map(rowHtml).join("")+'</details>';
          });
        } else {
          var d=v.days[0];
          html+=d.note?'<p class="ntSimSmall">'+escapeHtml(d.note)+'</p>':"";
          html+=d.slots.map(rowHtml).join("");
        }
        html+='<p class="ntSimSub">변경 대상: '+v.changeCount+'곳 · 나머지 확정 일정 유지</p>';
        html+='<button type="button" class="ntSimSave" data-ntsim-save="'+escapeHtml(v.id)+'" '+(v.changeCount===0?'disabled':'')+
          '>✅ '+(result.scope==="trip"?'전체 여행':'이 날짜')+' 추천안 반영하기</button></article>';
      });
      html+='<p class="ntSimCaution">⚠️ '+result.warnings.map(escapeHtml).join(" · ")+'<br>미확인 장소·현장 식사·휴식 안내는 실제 장소로 저장하지 않아. 기존에 입력한 일정과 잠금 항목은 보존돼.</p>';
      query("ntSimResults").innerHTML=html;
    }catch(e){query("ntSimResults").innerHTML='<p class="ntSimCaution">'+escapeHtml(e.message)+'</p>';}
  }
  query("ntSimResults").addEventListener("click",async function(e){
    var save=e.target.closest("[data-ntsim-save]");
    if(!save || busy || applied)return;
    if(!lastPreview||!lastOriginalSlots)return;
    busy=true;
    var buttons=Array.from(query("ntSimResults").querySelectorAll("[data-ntsim-save]"));
    buttons.forEach(function(b){b.disabled=true;});
    try{
      if(!window.NTPlannerCommit)throw new Error("공유 저장 기능을 불러오지 못했어. 새로고침해 줘.");
      var res=await window.NTPlannerCommit.apply(S,lastPreview,save.dataset.ntsimSave,lastOriginalSlots);
      applied=true;
      if(res.pending){
        query("ntSimStatus").textContent="✅ 가족 변경 요청 #"+res.requestId+" 전송 완료! 관리자가 승인하면 공통 일정에 반영돼.";
        query("ntSimResults").insertAdjacentHTML("beforeend",'<button class="ntSimGo" type="button" id="ntSimFamilyView">👪 요청 확인하기</button>');
        query("ntSimFamilyView").onclick=function(){close();var b=document.querySelector("#ntfb");if(b)b.click();};
      }else{
        query("ntSimStatus").textContent="✅ 가족 공통 일정 v"+res.version+" 게시 완료!";
        var refreshed=window.NTPlannerFamilySync && await window.NTPlannerFamilySync();
        if(!refreshed){
          query("ntSimStatus").textContent+=" 화면에 반영하려면 앱을 새로고침해 줘.";
          query("ntSimResults").insertAdjacentHTML("beforeend",'<button class="ntSimGo" type="button" id="ntSimReload">새로고침</button>');
          query("ntSimReload").onclick=function(){location.reload();};
        }
      }
    }catch(err){
      query("ntSimStatus").textContent="⚠️ "+(err.message||String(err));
      if(err.code==="login_required"||err.code==="must_change_pin"){
        close();var family=document.querySelector("#ntfb");if(family)family.click();
      }
      buttons.forEach(function(b){b.disabled=false;});
    }finally{busy=false;}
  });
  button.addEventListener("click",async function(){
    shell.style.display="flex";
    lastPreview=null;lastOriginalSlots=null;applied=false;
    query("ntSimStatus").textContent="";
    query("ntSimClose").focus();
    try{await getData();renderFields();query("ntSimResults").textContent="";}catch(e){query("ntSimFields").innerHTML='<p class="ntSimCaution">'+escapeHtml(e.message)+'</p>';}
  });
})();
