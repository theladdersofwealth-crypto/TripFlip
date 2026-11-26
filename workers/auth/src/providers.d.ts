export type SocialProvider = "google" | "kakao" | "naver";
export interface SocialIdentity { provider: SocialProvider; subject: string; email: string | null; name: string; emailVerified: boolean }
export const PROVIDERS: SocialProvider[];
export function callback(p: SocialProvider): string;
export function enabled(env: Record<string,string>, p: SocialProvider): boolean;
export function providerUrl(p: SocialProvider, env: Record<string,string>, state: string, ch: string): string;
export function socialProfile(p: SocialProvider, raw: unknown): SocialIdentity | null;
export function exchangeProvider(p: SocialProvider, env: Record<string,string>, code: string, verifier: string, state: string, request?: typeof fetch): Promise<SocialIdentity>;
