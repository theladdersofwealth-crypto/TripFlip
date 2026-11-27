export function validIdentity(p: unknown): boolean;
export function resolveIdentity(input: { intent: string; currentUid?: string; subjectUid?: string; emailUids: string[]; existingProvider?: boolean }): { uid: string } | { create: true } | null;
