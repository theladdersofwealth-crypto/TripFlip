export function validIdentity(p) {
  return !!(p && ["google","kakao","naver"].includes(p.provider) && typeof p.subject==="string" && p.subject.length>0 && p.subject.length<=255 &&
    typeof p.emailVerified==="boolean" && (p.email===null ? !p.emailVerified : typeof p.email==="string" && p.email.length<=254 && p.email===p.email.trim().toLowerCase() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) &&
    typeof p.name==="string" && p.name.trim().length>0 && p.name.length<=200 && !/[\u0000-\u001f\u007f]/.test(p.name));
}
export function resolveIdentity({intent,currentUid,subjectUid,emailUids,existingProvider}) {
  if(intent==="withdraw") return currentUid && subjectUid===currentUid ? {uid:currentUid}:null;
  if(intent!=="login" || currentUid) return null;
  if(subjectUid) return {uid:subjectUid};
  if(emailUids.length>1) return null;
  if(emailUids.length===1) return existingProvider ? null : {uid:emailUids[0]};
  return {create:true};
}
