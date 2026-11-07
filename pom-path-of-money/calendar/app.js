(() => {
  'use strict';
  const appRoot = document.getElementById('calendar-app');
  const modalRoot = document.getElementById('calendar-modal');
  const TOKEN_KEY = 'pom_calendar_access_token';
  const CACHE_KEY = 'pom_calendar_recent_events_v1';
  function readCachedEvents() {
    try {
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      return Array.isArray(cached?.events) ? cached.events : [];
    } catch { return []; }
  }
  const LABELS = {family:'가족',work:'업무',personal:'개인',kids:'자녀',anniversary:'기념일'};
  const REPEAT = {none:'반복 없음',weekly:'매주',monthly:'매월',yearly:'매년'};
  const WD = ['월','화','수','목','금','토','일'];
  const HEAD = ['일','월','화','수','목','금','토']; // 달력은 일요일부터
  // 한국 공휴일 (대체공휴일 포함). 정부 발표가 바뀌면 여기만 고치면 된다
  const HOLIDAYS = {
    '2026-01-01':'신정','2026-02-16':'설날 연휴','2026-02-17':'설날','2026-02-18':'설날 연휴','2026-03-01':'삼일절','2026-03-02':'대체공휴일',
    '2026-05-05':'어린이날','2026-05-24':'부처님오신날','2026-05-25':'대체공휴일','2026-06-03':'지방선거','2026-06-06':'현충일',
    '2026-08-15':'광복절','2026-08-17':'대체공휴일','2026-09-24':'추석 연휴','2026-09-25':'추석','2026-09-26':'추석 연휴','2026-09-28':'대체공휴일',
    '2026-10-03':'개천절','2026-10-05':'대체공휴일','2026-10-09':'한글날','2026-12-25':'성탄절',
    '2027-01-01':'신정','2027-02-06':'설날 연휴','2027-02-07':'설날','2027-02-08':'설날 연휴','2027-02-09':'대체공휴일','2027-03-01':'삼일절',
    '2027-05-05':'어린이날','2027-05-13':'부처님오신날','2027-06-06':'현충일','2027-08-15':'광복절','2027-08-16':'대체공휴일',
    '2027-09-14':'추석 연휴','2027-09-15':'추석','2027-09-16':'추석 연휴','2027-10-03':'개천절','2027-10-04':'대체공휴일',
    '2027-10-09':'한글날','2027-10-11':'대체공휴일','2027-12-25':'성탄절','2027-12-27':'대체공휴일'
  };
  // 이모지 📅 는 아이폰에서 '7월 17일' 그림으로 보여서, 오늘 날짜가 들어간 아이콘을 직접 그린다
  const calIcon = (size=34) => { const d=new Date(); return '<svg class="cal-icon" width="'+size+'" height="'+size+'" viewBox="0 0 64 64" aria-hidden="true">'+
    '<rect x="4" y="8" width="56" height="52" rx="12" fill="#fff" stroke="#d6e4f7" stroke-width="2"/>'+
    '<path d="M4 20q0-12 12-12h32q12 0 12 12v4H4z" fill="#1676ef"/>'+
    '<rect x="17" y="3" width="6" height="12" rx="3" fill="#0b55bd"/><rect x="41" y="3" width="6" height="12" rx="3" fill="#0b55bd"/>'+
    '<text x="32" y="21" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" font-family="-apple-system,sans-serif">'+(d.getMonth()+1)+'월</text>'+
    '<text x="32" y="51" text-anchor="middle" font-size="24" font-weight="900" fill="#191f28" font-family="-apple-system,sans-serif">'+d.getDate()+'</text></svg>'; };
  const pad = n => String(n).padStart(2,'0');
  const toDate = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const today = () => toDate(new Date());
  const prettyDate = day => {
    const [y,m,d]=day.split('-').map(Number);
    return y+'년 '+m+'월 '+d+'일';
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readPOMToken = () => {
    try { return String(JSON.parse(localStorage.getItem('pom_v2') || '{}').cryptoToken || '').trim(); }
    catch { return ''; }
  };
  const state = {selected:today(),month:today().slice(0,7),events:readCachedEvents(),token:localStorage.getItem(TOKEN_KEY)||readPOMToken(),loading:false,error:'',lastSynced:'',saving:false,naturalDraft:'',naturalError:'',naturalNotice:'',naturalSaving:false,pushEnabled:false,pushBusy:false,pushMessage:'',pushCheckAt:0};
  function covers(e, date) {
    if (e.date > date) return false;
    if (e.repeat === 'weekly') return new Date(e.date+'T12:00:00').getDay() === new Date(date+'T12:00:00').getDay();
    if (e.repeat === 'monthly') return e.date.slice(8) === date.slice(8);
    if (e.repeat === 'yearly') return e.date.slice(5) === date.slice(5);
    if (e.endDate) return date <= e.endDate;
    return e.date === date;
  }
  function eventsFor(date) {
    return state.events.filter(e=>covers(e,date)).sort((a,b)=>
      Number(b.allDay)-Number(a.allDay) ||
      String(a.startTime||'').localeCompare(String(b.startTime||'')) ||
      a.title.localeCompare(b.title)
    );
  }
  const spanLabel = e => e.endDate ? Number(e.date.slice(5,7))+'/'+Number(e.date.slice(8))+'~'+Number(e.endDate.slice(5,7))+'/'+Number(e.endDate.slice(8))+' · ' : '';
  function dayShort(date) {
    const d=new Date(date+'T12:00:00');
    return WD[(d.getDay()+6)%7];
  }
  function monthCells() {
    const [year,month]=state.month.split('-').map(Number);
    const first=new Date(year,month-1,1);
    const offset=first.getDay(); // 일요일 시작
    let html='';
    const rows=Math.ceil((offset+new Date(year,month,0).getDate())/7)*7;
    for(let n=0;n<rows;n++){
      const date=toDate(new Date(year,month-1,1+n-offset));
      const events=eventsFor(date);
      const outside=date.slice(0,7)!==state.month;
      const weekday=(n%7); // 0=일 … 6=토
      const holiday=HOLIDAYS[date]||'';
      const classes=['day',outside?'outside':'',date===today()?'today':'',date===state.selected?'selected':'',weekday===0||holiday?'sunday':weekday===6?'saturday':'',holiday?'holiday':''].join(' ');
      // 하루에 여러 일정이면 최대 3개까지 쌓아서 보여주고 나머지는 +N
      const marks=events.slice(0,3).map(e=>'<span class="mark '+esc(e.category)+(e.endDate?' span':'')+'">'+esc(e.title)+'</span>').join('');
      const holidayMark=holiday?'<span class="holiday-name">'+esc(holiday)+'</span>':'';
      const a11y=prettyDate(date)+(holiday?' · '+holiday:'')+(events.length?' · '+events.map(e=>e.title).join(', '):' · 일정 없음');
      html+='<button type="button" class="'+classes+'" data-day="'+date+'" aria-label="'+esc(a11y)+'"><span class="number">'+Number(date.slice(8))+'</span><span class="day-events">'+holidayMark+marks+(events.length>3?'<span class="more">+'+(events.length-3)+'건</span>':'')+'</span></button>';
    }
    return html;
  }
  function selectedEventRows() {
    const events=eventsFor(state.selected);
    if(!events.length) return '<div class="empty">등록된 일정이 없어.<br>아래 + 일정 추가로 새 일정을 등록해 봐.</div>';
    return events.map(e => {
      const repeatLabel=e.repeat && e.repeat!=='none'?' · '+REPEAT[e.repeat]:'';
      const time=spanLabel(e)+(e.allDay?'종일':esc(e.startTime)+(e.endTime?'~'+esc(e.endTime):''));
      return '<button type="button" class="event-row" data-event="'+esc(e.id)+'">'+
        '<span class="event-marker '+esc(e.category)+'"></span>'+
        '<span class="event-details"><span class="event-name">'+esc(e.title)+'</span>'+
        '<span class="event-meta">'+esc(LABELS[e.category]||'기타')+' · '+time+repeatLabel+(e.location?' · 📍'+esc(e.location):'')+'</span></span>'+
        '<span style="color:#90a0b5;font-size:24px">›</span></button>';
    }).join('');
  }

  function monthAgenda() {
    const [year,month]=state.month.split('-').map(Number);
    const days=new Date(year,month,0).getDate();
    let total=0;
    const groups=[];
    for(let d=1;d<=days;d++){
      const date=toDate(new Date(year,month-1,d));
      const events=eventsFor(date);
      if(!events.length)continue;
      total+=events.length;
      const rows=events.map(e=>{
        const time=spanLabel(e)+(e.allDay?'종일':esc(e.startTime)+(e.endTime?'–'+esc(e.endTime):''));
        const repeat=e.repeat&&e.repeat!=='none'?' · '+REPEAT[e.repeat]:'';
        return '<button type="button" class="agenda-event" data-event="'+esc(e.id)+'">'+
          '<span class="event-marker '+esc(e.category)+'"></span>'+
          '<span class="agenda-event-copy"><strong>'+esc(e.title)+'</strong>'+
          '<small>'+time+' · '+esc(LABELS[e.category]||'기타')+repeat+(e.location?' · 📍'+esc(e.location):'')+'</small></span><span class="agenda-arrow">›</span></button>';
      }).join('');
      groups.push('<div class="agenda-group"><button type="button" class="agenda-day" data-day="'+date+'">'+
        '<strong>'+d+'일 '+dayShort(date)+'</strong><span>'+events.length+'건</span></button>'+
        '<div class="agenda-items">'+rows+'</div></div>');
    }
    return '<section class="section-title" id="agenda-heading"><h2>이달 전체 일정</h2><small>총 '+total+'건 · 제목 전체 표시</small></section>'+
      '<div class="panel agenda-panel">'+(groups.join('')||'<div class="empty">이달 등록된 일정이 없어.</div>')+'</div>';
  }

  function thisWeekBox() {
    const now=new Date();
    const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));
    const dateAt=day=>toDate(new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+day));
    const first=dateAt(0),last=dateAt(6);
    const fmt=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
    const dayNames=['월','화','수','목','금','토','일'];
    let rows=[],count=0;
    for(let i=0;i<7;i++){
      const date=dateAt(i),items=eventsFor(date);
      for(const e of items){
        count++;
        const period=spanLabel(e)+(e.allDay?'종일':esc(e.startTime)+(e.endTime?'~'+esc(e.endTime):''));
        rows.push('<button type="button" class="week-row" data-event="'+esc(e.id)+'"><span class="week-date">'+
          Number(date.slice(-2))+'일('+dayNames[i]+')</span><span class="event-marker '+esc(e.category)+'"></span>'+
          '<span class="week-detail"><strong>'+esc(e.title)+'</strong><small>'+period+
          (e.location?' · 📍'+esc(e.location):'')+'</small></span></button>');
      }
    }
    return '<section class="week-summary"><div class="week-summary-head"><h2>'+calIcon(22)+' 이번 주 일정</h2><span>'+
      fmt(first)+'~'+fmt(last)+' · '+count+'건</span></div><div class="week-summary-list">'+
      (rows.join('')||'<p class="week-empty">이번 주 등록된 일정이 없어.</p>')+'</div></section>';
  }
  function pushBox() {
    return '<section class="push-panel"><div class="push-intro"><strong>🔔 매일 아침 금주 일정 알림</strong>'+
      '<small>월~일 전체 일정 · 매일 오전 8시 기준<br>무료 운영 시 실제 발송은 오전 8~9시 사이일 수 있어.</small></div>'+
      '<div class="push-actions"><button type="button" id="push-toggle"'+(state.pushBusy?' disabled':'')+'>'+
      (state.pushBusy?'처리 중...':state.pushEnabled?'알림 끄기':'알림 켜기')+'</button>'+
      '<button type="button" id="push-test"'+(!state.pushEnabled?' hidden':'')+(state.pushBusy?' disabled':'')+'>🔔 테스트 알림</button></div>'+
      '<p class="push-feedback" id="push-status-feedback">'+esc(state.pushMessage)+'</p></section>';
  }
  function b64ToBytes(key) {
    const str=String(key||'').replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(str+'='.repeat((4-str.length%4)%4));
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  }
  async function refreshPushStatus(){
    if(state.pushBusy || typeof navigator==='undefined' || !navigator.serviceWorker)return;
    // A local PushSubscription alone is not proof that the backend has a delivery target.
    // Keep this lightweight: recheck after two minutes instead of on every calendar render.
    if(Date.now()-state.pushCheckAt < 120000)return;
    state.pushCheckAt=Date.now();
    try{
      const reg=await navigator.serviceWorker.getRegistration('/calendar/');
      const sub=await reg?.pushManager?.getSubscription();
      state.pushEnabled=!!sub;
      if(sub&&state.token){
        const response=await fetch('/api/calendar-push',{method:'POST',
          headers:{'Content-Type':'application/json','x-pom-token':state.token},
          body:JSON.stringify({action:'status',subscription:sub.toJSON()})});
        const info=await response.json().catch(()=>null);
        if(response.ok&&info?.ok){
          state.pushEnabled=!!info.registered;
          if(!info.registered){
            state.pushMessage='기기에는 푸시가 남아 있지만 서버 등록이 없어. 「알림 켜기」를 눌러 복구해 줘.';
          }else{
            const todaySeoul=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
            if(info.lastSentDay===todaySeoul)state.pushMessage='서버 기기 등록 확인 · 오늘 발송 성공 기록 있음 ('+info.lastSentCount+'건).';
            else if(info.lastAttemptDay===todaySeoul)
              state.pushMessage='서버 기기 등록 확인 · 오늘 발송 시도됨 (성공 '+info.lastSentCount+' / 실패 '+info.lastFailureCount+').';
            else state.pushMessage='서버 기기 등록 확인 · 오늘 발송 기록은 아직 확인되지 않아.';
          }
        }else{
          state.pushMessage='기기 알림은 등록돼 있지만 서버 등록 상태 확인에 실패했어.';
        }
      }else if(!sub)state.pushMessage='';
      const btn=appRoot.querySelector('#push-toggle');
      if(btn&&!state.pushBusy)btn.textContent=state.pushEnabled?'알림 끄기':'알림 켜기';
      const test=appRoot.querySelector('#push-test');
      if(test)test.hidden=!state.pushEnabled;
      const msg=appRoot.querySelector('#push-status-feedback');
      if(msg)msg.textContent=state.pushMessage;
    }catch{
      state.pushMessage='푸시 상태 확인에 실패했어. 네트워크 연결 후 다시 확인해 줘.';
      const msg=appRoot.querySelector('#push-status-feedback');
      if(msg)msg.textContent=state.pushMessage;
    }
  }

  async function toggleWeeklyPush(){
    if(state.pushBusy)return;
    state.pushMessage='';
    const supported=typeof navigator!=='undefined' && 'serviceWorker' in navigator &&
      typeof window.PushManager!=='undefined' && typeof window.Notification!=='undefined' &&
      window.isSecureContext;
    if(!supported){
      state.pushMessage='이 기기는 웹앱 푸시를 지원하지 않아. 아이폰은 iOS 16.4 이상에서 홈 화면 앱으로 실행해 줘.';
      renderCalendar();return;
    }
    const standalone=window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
    if(!standalone&&/iPad|iPhone|iPod/.test(navigator.userAgent||'')){
      state.pushMessage='아이폰 Safari에서 공유 → 홈 화면에 추가한 뒤 캘린더 아이콘으로 실행하고 알림을 켜 줘.';
      renderCalendar();return;
    }
    // iOS requires requestPermission directly from an explicit user click.
    let permission=window.Notification.permission;
    if(!state.pushEnabled&&permission!=='granted')
      permission=await window.Notification.requestPermission();
    if(!state.pushEnabled&&permission!=='granted'){
      state.pushMessage='알림 허용이 필요해. 아이폰 설정 → 알림에서 POM 캘린더를 허용해 줘.';
      renderCalendar();return;
    }
    state.pushBusy=true;renderCalendar();
    try{
      const registration=await navigator.serviceWorker.register('/calendar/sw.js',{scope:'/calendar/'});
      const current=await registration.pushManager.getSubscription();
      if(state.pushEnabled&&current){
        const response=await fetch('/api/calendar-push',{method:'DELETE',
          headers:{'Content-Type':'application/json','x-pom-token':state.token},
          body:JSON.stringify({subscription:current.toJSON()})});
        if(!response.ok)throw new Error('알림 해제 서버 요청에 실패했어.');
        await current.unsubscribe();
        state.pushEnabled=false;state.pushMessage='금주 일정 알림을 껐어.';
      }else{
        const publicResponse=await fetch('/api/calendar-push',{cache:'no-store'});
        if(!publicResponse.ok)throw new Error('알림 서버가 아직 준비되지 않았어.');
        const info=await publicResponse.json();
        if(!info.ok||!info.publicKey)throw new Error('알림 키를 불러오지 못했어.');
        const subscription=current||await registration.pushManager.subscribe({
          userVisibleOnly:true,applicationServerKey:b64ToBytes(info.publicKey)
        });
        const save=await fetch('/api/calendar-push',{method:'POST',
          headers:{'Content-Type':'application/json','x-pom-token':state.token},
          body:JSON.stringify({subscription:subscription.toJSON()})});
        if(!save.ok)throw new Error('알림 기기 등록이 실패했어. 캘린더 연결 코드를 확인해 줘.');
        state.pushEnabled=true;state.pushMessage='알림 등록 완료! 다음 아침부터 이번 주 일정을 보내줄게.';
      }
    }catch(e){state.pushMessage=String(e?.message||e).slice(0,160);}
    finally{state.pushBusy=false;state.pushCheckAt=0;renderCalendar();}
  }
  async function testWeeklyPush(){
    if(state.pushBusy||!state.pushEnabled)return;
    state.pushBusy=true;
    state.pushMessage='테스트 푸시 발송 중...';
    renderCalendar();
    try{
      const reg=await navigator.serviceWorker.getRegistration('/calendar/');
      const sub=await reg?.pushManager?.getSubscription();
      if(!sub)throw new Error('기기 푸시 구독이 없어. 알림을 다시 켜 줘.');
      const response=await fetch('/api/calendar-push',{method:'POST',
        headers:{'Content-Type':'application/json','x-pom-token':state.token},
        body:JSON.stringify({action:'test',subscription:sub.toJSON()})});
      const info=await response.json().catch(()=>({}));
      if(!response.ok||!info.sent){
        if(info.error==='device_not_registered'){
          state.pushEnabled=false;
          throw new Error('서버에 기기가 등록되어 있지 않아. 알림 켜기로 다시 등록해 줘.');
        }
        if(info.error==='device_subscription_expired')throw new Error('기기 푸시 구독이 만료됐어. 알림을 껐다가 다시 켜 줘.');
        throw new Error('테스트 푸시 전송에 실패했어. '+String(info.error||'').slice(0,70));
      }
      state.pushMessage='테스트 전송 성공! 아이폰 알림센터에서 수신 여부를 확인해 줘.';
    }catch(error){state.pushMessage=String(error?.message||error).slice(0,180);}
    finally{state.pushBusy=false;state.pushCheckAt=0;renderCalendar();}
  }

  function naturalBox() {
    const disabled=state.naturalSaving?' disabled':'';
    return '<section class="natural-panel" aria-label="구어체 일정 입력">'+
      '<div class="natural-head"><div><strong>✨ 말하듯 일정 등록</strong><small>추가 비용 없는 스마트 날짜·시간 인식</small></div><span class="natural-free">무료</span></div>'+
      '<form id="natural-form"><textarea class="natural-input" id="natural-input" rows="2" maxlength="300" placeholder="내일 오후 3시 준서 병원, 장소는 차병원"'+disabled+'>'+esc(state.naturalDraft)+'</textarea>'+
      '<div class="natural-foot"><span>🎙️ 아이폰 키보드 마이크로 말해도 돼</span>'+
      '<button type="submit" id="natural-submit"'+disabled+'>'+(state.naturalSaving?'저장 중...':'일정 입력 ↗')+'</button></div></form>'+
      (state.naturalError?'<p class="natural-error" role="alert">⚠️ '+esc(state.naturalError)+'</p>':'')+
      (state.naturalNotice?'<p class="natural-success" role="status">✓ '+esc(state.naturalNotice)+'</p>':'')+
      '<div class="natural-examples"><button type="button" data-natural-example="내일 오후 3시 준서 병원">내일 오후 3시 준서 병원</button>'+
      '<button type="button" data-natural-example="매주 토요일 오전 10시 준서 수영">매주 토요일 수영</button></div></section>';
  }
  async function submitNatural(text) {
    if(state.naturalSaving)return;
    state.naturalDraft=String(text||'').trim();
    state.naturalError='';state.naturalNotice='';
    const parsed=window.POM_NATURAL?.parse(state.naturalDraft,new Date());
    if(!parsed){state.naturalError='일정 인식 모듈을 불러오지 못했어. 새로고침해 줘.';renderCalendar();return;}
    if(!parsed.ok){state.naturalError=parsed.error||parsed.warnings?.join(' · ')||'날짜를 이해하지 못했어.';renderCalendar();return;}
    if(parsed.action==='show'){
      state.selected=parsed.date;state.month=parsed.date.slice(0,7);state.naturalDraft='';
      state.naturalNotice=prettyDate(parsed.date)+' 일정 '+eventsFor(parsed.date).length+'건을 표시했어.';
      renderCalendar();document.getElementById('event-list')?.scrollIntoView({behavior:'smooth',block:'center'});return;
    }
    // Do not accidentally insert the same appointment twice on repeat submits.
    const e=parsed.event;
    const duplicate=state.events.some(existing=>existing.date===e.date&&existing.title===e.title&&
      (existing.startTime||'')===e.startTime&&existing.repeat===e.repeat);
    if(duplicate){
      state.naturalError='같은 날짜·시간의 일정이 이미 있어. 아래 목록에서 확인해 줘.';
      state.selected=e.date;state.month=e.date.slice(0,7);renderCalendar();return;
    }
    if(parsed.needsReview){
      state.selected=e.date;state.month=e.date.slice(0,7);
      state.naturalNotice='해석한 내용을 확인한 후 저장해 줘.';
      renderCalendar();openEditor(null,e,parsed.warnings.join(' · '));return;
    }
    state.naturalSaving=true;renderCalendar();
    try{
      await request('POST',e);
      state.naturalDraft='';state.selected=e.date;state.month=e.date.slice(0,7);
      state.naturalNotice='「'+e.title+'」 일정을 자동 등록했어.';
      await load();
    }catch(error){state.naturalError=String(error.message||error);}
    finally{state.naturalSaving=false;renderCalendar();}
  }

  function renderCalendar() {
    const [year,month]=state.month.split('-').map(Number);
    appRoot.innerHTML='<main class="wrap">'+
      '<header class="top"><div class="top-brand"><span class="logo">'+calIcon(40)+'</span><span>POM <span style="color:#1676ef">캘린더</span><div class="mini">가족과 일정 · 공통 저장</div></span></div>'+
      '<div class="top-actions"><button type="button" class="icon-btn" id="calendar-refresh" aria-label="새로고침">↻</button>'+
      '<a class="icon-btn" href="/" aria-label="POM으로 이동" title="POM으로 이동">💰</a></div></header>'+
      '<div class="sync-note"><span>'+(state.loading?'🔄 동기화 중':state.lastSynced?'✓ 서버 동기화 · '+esc(state.lastSynced):'연결 대기')+'</span>'+
      '<button type="button" id="calendar-logout">연결 변경</button></div>'+
      (state.error?'<div class="error">'+esc(state.error)+'</div>':'')+
      pushBox()+
      naturalBox()+
      thisWeekBox()+
      '<section class="panel calendar-month" style="margin-top:14px"><div class="month-head"><strong>'+year+'년 '+month+'월</strong>'+
      '<div class="month-controls"><button type="button" id="prev-month" aria-label="이전 달">‹</button>'+
      '<button type="button" id="go-today">오늘</button>'+
      '<button type="button" id="next-month" aria-label="다음 달">›</button></div></div>'+
      '<div class="weekdays">'+HEAD.map(w=>'<span>'+w+'</span>').join('')+'</div>'+
      '<div class="grid">'+monthCells()+'</div>'+
      '<button type="button" class="agenda-jump" id="show-agenda">📋 이달 일정 전체 보기 <span>↓</span></button></section>'+
      '<div class="section-title"><h2>'+prettyDate(state.selected)+' <span style="color:#93a1b5;font-size:13px">'+dayShort(state.selected)+'</span></h2><small>'+eventsFor(state.selected).length+'개 일정</small></div>'+
      '<section class="panel" id="event-list">'+selectedEventRows()+'</section>'+
      monthAgenda()+
      '<p class="hint" style="text-align:center;margin:22px 0">📱 아이폰 Safari에서 공유 → 홈 화면에 추가하면<br>캘린더 전용 아이콘으로 바로 실행할 수 있어.<br>'+
      '<a class="small-link" href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener noreferrer">Google 캘린더 열기 ↗</a> <span style="color:#b5becb">(별도 서비스)</span></p>'+
      '<button type="button" class="fab" id="new-event">＋ 일정 추가</button></main>';
    appRoot.querySelector('#prev-month').onclick=()=>shiftMonth(-1);
    appRoot.querySelector('#next-month').onclick=()=>shiftMonth(1);
    appRoot.querySelector('#go-today').onclick=()=>{state.selected=today();state.month=state.selected.slice(0,7);renderCalendar();};
    appRoot.querySelector('#calendar-refresh').onclick=load;
    appRoot.querySelector('#calendar-logout').onclick=()=>{localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(CACHE_KEY);state.token='';state.events=[];state.error='';renderLogin();};
    appRoot.querySelector('#new-event').onclick=()=>openEditor(null);
    appRoot.querySelector('#push-toggle').onclick=toggleWeeklyPush;
    const pushTest=appRoot.querySelector('#push-test');
    if(pushTest)pushTest.onclick=testWeeklyPush;
    refreshPushStatus();
    appRoot.querySelector('#show-agenda').onclick=()=>{
      appRoot.querySelector('#agenda-heading')?.scrollIntoView({behavior:'smooth',block:'start'});
    };
    appRoot.querySelector('#natural-form').onsubmit=async ev=>{
      ev.preventDefault();await submitNatural(appRoot.querySelector('#natural-input').value);
    };
    appRoot.querySelectorAll('[data-natural-example]').forEach(btn=>btn.onclick=()=>{
      const box=appRoot.querySelector('#natural-input');box.value=btn.dataset.naturalExample;box.focus();
    });
    appRoot.querySelectorAll('[data-day]').forEach(btn=>btn.onclick=()=>{
      state.selected=btn.dataset.day;state.month=state.selected.slice(0,7);renderCalendar();
    });
    appRoot.querySelectorAll('[data-event]').forEach(btn=>btn.onclick=()=>{
      const e=state.events.find(e=>e.id===btn.dataset.event);
      if(e)openEditor(e);
    });
  }
  function renderLogin() {
    appRoot.innerHTML='<main class="wrap"><div class="panel login-wrap">'+
      '<div class="logo">'+calIcon(48)+'</div><h2>POM 캘린더 연결</h2>'+
      '<p>POM과 캘린더 바로가기는 동일한 일정 데이터를 사용해.<br>'+
      '처음 실행할 때 POM 코인 연동에 쓰는 <b>접근 코드</b>를 한 번 입력해 줘.</p>'+
      '<form id="calendar-login"><input class="input" id="calendar-code" type="password" autocomplete="off" placeholder="POM 접근 코드" required>'+
      '<button class="primary" type="submit">캘린더 연결하기</button></form>'+
      (state.error?'<div class="error">'+esc(state.error)+'</div>':'')+
      '<div class="hint">접근 코드는 이 기기에만 저장돼. 일정은 POM의 비공개 서버에 저장되며, Google Calendar와의 자동 동기화는 아직 지원하지 않아.</div>'+
      '<p><a class="small-link" href="/">← POM으로 돌아가기</a></p></div></main>';
    appRoot.querySelector('#calendar-login').onsubmit=async evt=>{
      evt.preventDefault();
      state.token=appRoot.querySelector('#calendar-code').value.trim();
      state.error='';
      await load();
    };
  }
  function shiftMonth(delta) {
    const [y,m]=state.month.split('-').map(Number);
    const next=new Date(y,m-1+delta,1);
    state.selected=toDate(next);
    state.month=state.selected.slice(0,7);
    renderCalendar();
  }
  async function request(method,body) {
    const options={method,headers:{'x-pom-token':state.token,'Accept':'application/json'}};
    if(body){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
    const response=await fetch('/api/calendar',options);
    let json={};
    try{json=await response.json();}catch{throw new Error('서버에서 응답을 확인하지 못했어.');}
    if(!response.ok||!json.ok){
      if(response.status===401)throw new Error('접근 코드가 일치하지 않아. POM 연동 코드를 확인해 줘.');
      if(response.status===503)throw new Error('캘린더 서버를 일시적으로 사용할 수 없어.');
      if(json.error==='calendar_unavailable')throw new Error('Vercel 저장소 사용량 한도 초과로 일정 조회가 중단됐어. 서버에 저장된 일정은 삭제하지 않았어. 복구 전까지 새 일정 저장도 실패할 수 있어.');
      throw new Error(json.error||'서버 요청에 실패했어.');
    }
    return json;
  }
  async function load(){
    if(!state.token){renderLogin();return;}
    state.loading=true;state.error='';
    if(state.events.length) renderCalendar();
    try{
      const result=await request('GET');
      state.events=Array.isArray(result.events)?result.events:[];
      localStorage.setItem(TOKEN_KEY,state.token);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({events:state.events,savedAt:new Date().toISOString()})); } catch {}
      state.lastSynced=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
      state.loading=false;renderCalendar();
    }catch(error){
      state.error=String(error.message||error);
      state.loading=false;
      if(String(error?.message||'').includes('접근 코드가 일치하지'))renderLogin();
      else renderCalendar();
    }
  }
  function openEditor(existing,prefill=null,reviewMessage=''){
    const e=existing||prefill||{title:'',date:state.selected,allDay:true,startTime:'09:00',endTime:'10:00',category:'family',repeat:'none',location:'',notes:''};
    const categories=Object.entries(LABELS).map(([id,name])=>'<option value="'+id+'"'+(e.category===id?' selected':'')+'>'+name+'</option>').join('');
    const repeat=Object.entries(REPEAT).map(([id,name])=>'<option value="'+id+'"'+(e.repeat===id?' selected':'')+'>'+name+'</option>').join('');
    modalRoot.innerHTML='<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="일정 편집">'+
      '<div class="modal-head"><h2>'+ (existing?'일정 수정':'새 일정') +'</h2><button type="button" id="close-editor" aria-label="닫기">×</button></div>'+
      (reviewMessage?'<div class="natural-review">⚠️ '+esc(reviewMessage)+'<br>날짜와 시간을 확인해 줘.</div>':'')+
      '<form id="event-form">'+
      '<div class="field"><label for="event-title">일정 제목 *</label><input class="input" id="event-title" maxlength="120" required value="'+esc(e.title)+'" placeholder="예: 준서 유치원 행사"></div>'+
      '<div class="row"><div class="field"><label for="event-date">시작일 *</label><input class="input" id="event-date" type="date" required value="'+esc(e.date)+'"></div>'+
      '<div class="field"><label for="event-end-date">종료일 (여러 날일 때)</label><input class="input" id="event-end-date" type="date" value="'+esc(e.endDate||'')+'"></div></div>'+
      '<div class="field"><label for="event-category">구분</label><select class="input" id="event-category">'+categories+'</select></div>'+
      '<label class="checkbox"><input type="checkbox" id="event-all-day" '+(e.allDay?'checked':'')+'> 종일 일정</label>'+
      '<div class="row" id="time-fields"><div class="field"><label for="event-start-time">시작 시간</label><input class="input" id="event-start-time" type="time" value="'+esc(e.startTime||'09:00')+'"></div>'+
      '<div class="field"><label for="event-end-time">종료 시간</label><input class="input" id="event-end-time" type="time" value="'+esc(e.endTime ?? '10:00')+'"></div></div>'+
      '<div class="field"><label for="event-repeat">반복</label><select class="input" id="event-repeat">'+repeat+'</select></div>'+
      '<div class="field"><label for="event-location">장소</label><input class="input" id="event-location" maxlength="180" value="'+esc(e.location||'')+'" placeholder="예: 차병원 / 상암"></div>'+
      '<div class="field"><label for="event-notes">메모</label><textarea class="input" id="event-notes" maxlength="2000" placeholder="장소나 준비물">'+esc(e.notes||'')+'</textarea></div>'+
      '<div id="editor-error" class="error"></div>'+
      '<div class="modal-actions"><button type="submit" class="primary" id="event-submit">'+(existing?'수정 저장':'일정 저장')+'</button>'+
      (existing?'<button type="button" class="danger" id="event-delete">삭제</button>':'')+'</div></form></section></div>';
    const modal=modalRoot.querySelector('.overlay');
    const close=()=>{modalRoot.innerHTML='';};
    modalRoot.querySelector('#close-editor').onclick=close;
    modal.onclick=evt=>{if(evt.target===modal)close();};
    const allDay=modalRoot.querySelector('#event-all-day');
    const toggle=()=>{modalRoot.querySelector('#time-fields').hidden=allDay.checked;};
    allDay.onchange=toggle;toggle();
    modalRoot.querySelector('#event-form').onsubmit=async evt=>{
      evt.preventDefault();
      if(state.saving)return;
      const payload={
        title:modalRoot.querySelector('#event-title').value.trim(),
        date:modalRoot.querySelector('#event-date').value,
        endDate:modalRoot.querySelector('#event-end-date').value,
        allDay:allDay.checked,
        startTime:allDay.checked?'':modalRoot.querySelector('#event-start-time').value,
        endTime:allDay.checked?'':modalRoot.querySelector('#event-end-time').value,
        category:modalRoot.querySelector('#event-category').value,
        repeat:modalRoot.querySelector('#event-repeat').value,
        location:modalRoot.querySelector('#event-location').value.trim(),
        notes:modalRoot.querySelector('#event-notes').value,
      };
      if(existing)payload.id=existing.id;
      state.saving=true;
      const submit=modalRoot.querySelector('#event-submit');submit.disabled=true;submit.textContent='저장 중...';
      try{
        await request(existing?'PUT':'POST',payload);
        close();state.selected=payload.date;state.month=payload.date.slice(0,7);await load();
      }catch(error){
        modalRoot.querySelector('#editor-error').textContent=String(error.message||error);
      }finally{state.saving=false;if(modalRoot.contains(submit)){submit.disabled=false;submit.textContent='일정 저장';}}
    };
    const del=modalRoot.querySelector('#event-delete');
    if(del)del.onclick=async()=>{
      if(state.saving||!confirm('이 일정을 삭제할까?'))return;
      state.saving=true;del.disabled=true;
      try{await request('DELETE',{id:existing.id});close();await load();}
      catch(error){modalRoot.querySelector('#editor-error').textContent=String(error.message||error);}
      finally{state.saving=false;if(modalRoot.contains(del))del.disabled=false;}
    };
  }
  if(state.token)load();else renderLogin();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.token&&!state.saving)load();});
})();