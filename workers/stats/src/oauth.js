// Identity resolution is independent of provider transport. Google is the only enabled provider.
export function validIdentity(p) {
  return p && p.provider === "google" && typeof p.subject === "string" && p.subject.length > 0 && p.subject.length <= 255 &&
    typeof p.email === "string" && p.email.length <= 254 && p.email === p.email.trim().toLowerCase() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) && typeof p.name === "string" && p.name.trim().length > 0 && p.name.length <= 200 && !/[\u0000-\u001f\u007f]/.test(p.name);
}
/** Do not merge by nickname or attach a different Google subject to a verified-email account. */
export function resolveIdentity({ intent, currentUid, subjectUid, emailUids, linkedSubject }) {
  if (intent === "withdraw") return currentUid && subjectUid === currentUid ? { uid: currentUid } : null;
  if (intent === "link") {
    if (!currentUid || (subjectUid && subjectUid !== currentUid) || emailUids.some(uid => uid !== currentUid) || (linkedSubject && !subjectUid)) return null;
    return { uid: currentUid };
  }
  if (intent !== "login" || currentUid) return null;
  if (subjectUid) return emailUids.some(uid => uid !== subjectUid) ? null : { uid: subjectUid };
  // Existing identity with same address but a different subject: fail closed, never account takeover.
  if (emailUids.length) return null;
  return { create: true };
}
