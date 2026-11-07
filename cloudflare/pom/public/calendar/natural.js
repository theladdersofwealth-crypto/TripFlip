/* POM 구어체 일정 해석기. 외부 유료 AI 호출 없는 무료 로컬 파서. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.POM_NATURAL=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const wd={일:0,월:1,화:2,수:3,목:4,금:5,토:6};
const nKo={한:1,두:2,세:3,네:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10,열한:11,열두:12};
const pad=n=>String(n).padStart(2,'0');
const iso=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
const day=(y,m,d)=>new Date(y,m-1,d,12);
const plus=(d,n)=>day(d.getFullYear(),d.getMonth()+1,d.getDate()+n);
const valid=(y,m,d)=>{const dt=day(y,m,d);return dt.getFullYear()===y&&dt.getMonth()+1===m&&dt.getDate()===d;};

// 제목 속 (업무)(가족)(개인)(자녀)(기념일) 태그 → 구분으로 쓰고 제목에서는 지운다
const TAGS={업무:'work',회사:'work',가족:'family',개인:'personal',자녀:'kids',아이:'kids',기념일:'anniversary'};
function applyTag(title,category){
  let cat=category;
  const t=String(title||'').replace(/\s*[\(\[（【]\s*(업무|회사|가족|개인|자녀|아이|기념일)\s*[\)\]）】]\s*/g,(m,k)=>{cat=TAGS[k];return ' ';}).replace(/\s+/g,' ').trim();
  return {title:t,category:cat};
}
function parse(value,clock=new Date()){
  const original=String(value||'').trim().replace(/[ \t]+/g,' ');
  if(!original)return{ok:false,error:'일정 내용을 입력해 줘.'};
  if(original.length>300)return{ok:false,error:'300자 이내로 입력해 줘.'};
  const now=day(clock.getFullYear(),clock.getMonth()+1,clock.getDate());
  // iOS dictation and copy/paste often prepend smart quotation marks or zero-width chars.
  // Normalize only syntax punctuation; preserve the original sentence for intent checks.
  let work=original.replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[“”„‟"‘’‚‛'「」『』]/g,' ').replace(/\s+/g,' ').trim(),date=null,dateKind='',repeat='none',location='',startTime='',endTime='',hasTime=false,ambiguousTime=false;
  const warnings=[],remove=m=>{work=work.replace(m,' ');};
  const action=/(?:변경|수정|취소|삭제|옮겨|미뤄|바꿔)\s*(?:줘|주세요|야|줘요)?/.test(original)?'unsupported':
    /(?:보여\s*줘|알려\s*줘|조회|찾아\s*줘|뭐\s*있[어니]|일정\s*있[어니])/.test(original)?'show':'add';
  if(/매일|매\s*평일|격주/.test(original))return{ok:false,error:'매일·격주 반복은 아직 지원하지 않아. 수기로 등록해 줘.'};
  if(/매\s*주/.test(work)){repeat='weekly';remove(/매\s*주/);}
  else if(/매\s*월/.test(work)){repeat='monthly';remove(/매\s*월/);}
  else if(/매\s*년/.test(work)){repeat='yearly';remove(/매\s*년/);}
  const take=(regex,getDate,kind)=>{
    if(date)return false;
    const m=work.match(regex);if(!m)return false;
    const found=getDate(m);if(!found)return false;
    date=found;dateKind=kind;remove(m[0]);return true;
  };
  const md=(month,dayNum,year)=>{
    let y=year||now.getFullYear(),m=Number(month),d=Number(dayNum);
    if(!valid(y,m,d))return null;
    if(!year&&day(y,m,d)<now){y++;if(!valid(y,m,d))return null;}
    return day(y,m,d);
  };
  // 기간: "11월 11일~13일", "11~13일", "11/11~11/13", "11일부터 13일까지"
  let endDate=null;
  {
    const R=/(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일?\s*(?:~|-|–|부터)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일\s*(?:까지)?/;
    const S=/(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:~|-|–|부터)\s*(?:(\d{1,2})\s*\/\s*)?(\d{1,2})(?!\d)\s*(?:까지)?/;
    let m=work.match(S),startM,startD,endM,endD;
    if(m){startM=+m[1];startD=+m[2];endM=m[3]?+m[3]:startM;endD=+m[4];}
    else if((m=work.match(R))){
      startM=m[1]?+m[1]:(now.getMonth()+1);startD=+m[2];endM=m[3]?+m[3]:startM;endD=+m[4];
      if(!m[1]&&day(now.getFullYear(),startM,startD)<now)startM++;
      if(!m[3])endM=endD<startD?startM+1:startM;
    }
    if(m&&startD>=1&&startD<=31&&endD>=1&&endD<=31){
      const s=md(startM>12?1:startM,startD,startM>12?now.getFullYear()+1:undefined);
      if(s){
        let e=day(s.getFullYear(),endM,endD);
        if(endM<startM)e=day(s.getFullYear()+1,endM,endD);
        if(e>s&&(e-s)/864e5<=62){date=s;endDate=e;dateKind='range';remove(m[0]);}
      }
    }
  }
  take(/(20\d{2})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})\s*일?/,m=>md(m[2],m[3],Number(m[1])),'explicit-year');
  take(/(오늘|내일모레|모레|글피|내일)/,m=>plus(now,{오늘:0,내일:1,모레:2,내일모레:2,글피:3}[m[1]]),'relative');
  take(/(다다음|다음|이번)\s*주\s*([월화수목금토일])\s*(?:요)?일/,m=>{
    const monday=plus(now,-((now.getDay()+6)%7)+({이번:0,다음:1,다다음:2}[m[1]]*7));
    return plus(monday,(wd[m[2]]+6)%7);
  },'week-day');
  take(/(다다음|다음|이번)\s*달\s*(\d{1,2})\s*일/,m=>{
    const dt=day(now.getFullYear(),now.getMonth()+1+({이번:0,다음:1,다다음:2}[m[1]]),1);
    return valid(dt.getFullYear(),dt.getMonth()+1,Number(m[2]))?day(dt.getFullYear(),dt.getMonth()+1,Number(m[2])):null;
  },'relative-month');
  take(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/,m=>md(m[1],m[2]),'month-day');
  take(/(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/,m=>md(m[1],m[2]),'month-day');
  take(/([월화수목금토일])\s*(?:요)?일/,m=>plus(now,(wd[m[1]]-now.getDay()+7)%7),'weekday');
  if(!date&&repeat==='monthly')take(/(\d{1,2})\s*일/,m=>{
    const d=Number(m[1]);
    for(let step=0;step<13;step++){
      const month=day(now.getFullYear(),now.getMonth()+1+step,1);
      const y=month.getFullYear(),mo=month.getMonth()+1;
      if(valid(y,mo,d)&&day(y,mo,d)>=now)return day(y,mo,d);
    }
    return null;
  },'monthly-day');
  // "12일": today or next valid future calendar occurrence.
  if(!date&&repeat==='none')take(/(?:^|[\s,，])(\d{1,2})\s*일(?=$|[\s,，.!?]|오전|오후|아침|점심|저녁|밤|새벽)/,m=>{
    const d=Number(m[1]);
    if(d<1||d>31)return null;
    for(let step=0;step<13;step++){
      const first=day(now.getFullYear(),now.getMonth()+1+step,1);
      const y=first.getFullYear(),mo=first.getMonth()+1;
      if(valid(y,mo,d)&&day(y,mo,d)>=now)return day(y,mo,d);
    }
    return null;
  },'day-only');
  if(!date)warnings.push('날짜가 명확하지 않아.');
  if(!date&&repeat==='weekly')warnings.push('매주 반복할 요일을 지정해 줘.');
  // Parse start and end with optional suffix 까지; don't silently guess missing AM/PM.
  const rangeMatch=work.match(/(오전|오후|아침|점심|저녁|밤|새벽)?\s*(\d{1,2}|열두|열한|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열)\s*시\s*(?:(반)|(\d{1,2})\s*분?)?\s*부터\s*(오전|오후|아침|점심|저녁|밤|새벽)?\s*(\d{1,2}|열두|열한|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열)\s*시\s*(?:(반)|(\d{1,2})\s*분?)?\s*(?:까지)?(?=$|[\s,，.])/);
  if(rangeMatch){
    const hourOf=(h,p)=>{
      let v=Number(nKo[h]||h);
      if(p==='점심'&&v>=1&&v<=3)v+=12;
      if(/^(오후|저녁|밤)$/.test(p)&&v>=1&&v<=11)v+=12;
      if(/^(오전|아침|새벽)$/.test(p)&&v===12)v=0;
      return v;
    };
    const start=hourOf(rangeMatch[2],rangeMatch[1]||'');
    const finish=hourOf(rangeMatch[6],rangeMatch[5]||rangeMatch[1]||'');
    const startMin=rangeMatch[3]==='반'?30:Number(rangeMatch[4]||0);
    const endMin=rangeMatch[7]==='반'?30:Number(rangeMatch[8]||0);
    if(start<=23&&finish<=23&&startMin<=59&&endMin<=59){
      startTime=pad(start)+':'+pad(startMin);
      endTime=pad(finish)+':'+pad(endMin);
      hasTime=true;
      if(!rangeMatch[1]&&start<=12)warnings.push('시작 시간의 오전·오후를 확인해 줘.');
      if(!rangeMatch[5]&&Number(nKo[rangeMatch[6]]||rangeMatch[6])<=12)warnings.push('종료 시간의 오전·오후를 확인해 줘.');
      if(endTime<=startTime)warnings.push('종료 시간이 시작 시간보다 빠르거나 같아. 시간을 확인해 줘.');
    }else warnings.push('시간을 정확히 확인해 줘.');
    work=work.replace(rangeMatch[0],' ');
  }
  if(!hasTime){
  const colon=/(오전|오후|아침|점심|저녁|밤|새벽)?\s*(\d{1,2}):([0-5]\d)/;
  const spoken=/(오전|오후|아침|점심|저녁|밤|새벽)?\s*(\d{1,2}|열두|열한|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열)\s*시\s*(?:(반)|(\d{1,2}|삼십|사십오|십오)\s*분?)?/;
  let tm=work.match(colon),isColon=!!tm;if(!tm)tm=work.match(spoken);
  if(tm){
    const period=tm[1]||'';
    let hour=isColon?Number(tm[2]):Number(nKo[tm[2]]||tm[2]);
    const min=isColon?Number(tm[3]):tm[3]==='반'?30:
      tm[4]==='삼십'?30:tm[4]==='사십오'?45:tm[4]==='십오'?15:Number(tm[4]||0);
    if(period==='점심'&&hour<=3)hour+=12;
    if(/^(오후|저녁|밤)$/.test(period)&&hour>=1&&hour<=11)hour+=12;
    if(/^(오전|아침|새벽)$/.test(period)&&hour===12)hour=0;
    if(!period&&hour<=12)ambiguousTime=true;
    if(hour>23||min>59)warnings.push('시간을 정확히 확인해 줘.');
    else{hasTime=true;startTime=pad(hour)+':'+pad(min);}
    remove(tm[0]);
    // Never auto-save a two-time range as if it only had a start time.
    const other=work.match(/(?:부터|~|–|-|에서)?\s*(?:오전|오후|아침|저녁|밤)?\s*(?:\d{1,2}|한|두|세|네)\s*시(?:\s*\d{1,2}\s*분)?(?:까지)?/);
    if(other){warnings.push('종료 시간이 있는 일정이야. 종료 시간을 확인해 줘.');remove(other[0]);work=work.replace(/\b부터\b|부터/g,' ');}
  }
  }
  const loc=work.match(/(?:장소\s*[:：는은]?\s*|위치\s*[:：는은]?\s*|@\s*)([^,，\n.]{1,40})(?=$|[,，.])/);
  if(loc){location=loc[1].trim().replace(/(?:에서|이고|입니다)\s*$/,'').trim();remove(loc[0]);}
  else{
    const at=work.match(/(?:^|[\s,，])([가-힣A-Za-z0-9·-]{2,20})에서(?:\s|$)/);
    if(at&&!/^(?:미팅|회의|식사|진료|약속|행사)$/.test(at[1])){location=at[1];remove(at[0]);}
  }
  const allDayExplicit=/종일|하루\s*종일/.test(original);
  work=work.replace(/하루\s*종일|종일/g,' ');
  if(!hasTime&&!allDayExplicit&&action==='add')warnings.push('시간이 없어 종일 일정인지 확인이 필요해.');
  if(ambiguousTime)warnings.push('오전인지 오후인지 확인해 줘.');
  if(action==='unsupported')return{ok:false,error:'수정·삭제는 아직 말로 처리하지 않아. 달력의 기존 일정을 눌러 수정해 줘.'};
  work=work.replace(/(?:내\s*캘린더에|캘린더에|일정에|일정으로)\s*/g,' ')
    .replace(/(?:추가|등록|넣어|기록)\s*(?:해\s*줘|해\s*주세요|해줘요|해줘|해|부탁해)?/g,' ')
    .replace(/(?:예약했어|예약했음|잡았어|있어|갈\s*거야|가기로\s*했어|하기로\s*했어|했는데|했어|했음)\s*$/g,' ')
    .replace(/(?:일정\s*(?:보여\s*줘|알려\s*줘|조회|찾아\s*줘)|보여\s*줘|알려\s*줘|조회|찾아\s*줘|뭐\s*있어\??)/g,' ')
    .replace(/\s*[,，.]+\s*/g,' ').replace(/\s+/g,' ').trim();
  const title=work.replace(/^(?:에|에서|그날|그때)\s*/,'').replace(/(?:해야\s*돼|해줘|줘)\s*$/,'').trim();
  if(action==='add'&&!title)warnings.push('일정 제목이 필요해.');
  const tagged=applyTag(title,'');
  const cleanTitle=tagged.title;
  const desc=cleanTitle||original;
  let category=tagged.category||'family';
  if(tagged.category){}
  else if(/생일|결혼기념|기념일|돌잔치|제사/.test(desc))category='anniversary';
  else if(/준서|준우|아이|유치원|어린이집|소아과|키즈|학교|학원|수영/.test(desc))category='kids';
  else if(/회사|회의|미팅|팀장|영업팀|회식|대리점|업무|거래처|동원아이티|대산정보|출근|당직|PR/.test(desc))category='work';
  else if(/골프|라운딩|스크린|원교|운동|친구/.test(desc))category='personal';
  const event={title:cleanTitle||original,date:date?iso(date):null,endDate:endDate?iso(endDate):'',allDay:!hasTime,startTime,endTime,location,notes:'',category,repeat};
  return{ok:!!date&&(action==='show'||!!title),action,date:event.date,event,needsReview:!!warnings.length,warnings,error:!date?'날짜를 정확히 이해하지 못했어. 예: 내일 오후 3시 준서 병원':null,interpreted:{dateKind,ambiguousTime,hasTime}};
}
return{parse,applyTag};
});