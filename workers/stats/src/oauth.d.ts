export function validIdentity(p: unknown): boolean;
export function resolveIdentity(input: { intent: string; currentUid?: string; subjectUid?: string; emailUids: string[]; linkedSubject?: string }): { uid: string } | { create: true } | null;
