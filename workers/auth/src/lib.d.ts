export interface GoogleIdentity { provider: "google"; subject: string; email: string; name: string }
export const ORIGIN: string, CALLBACK: string, TTL: number, COOKIE: string;
export const ALLOWED_ORIGINS: readonly string[];
export function allowedOrigin(origin: unknown): boolean;
export function callbackUri(provider: string, origin: string): string;
export function matchesFlow(data: unknown, provider: string, origin: string): boolean;
export function sameOriginPost(requestOrigin: unknown, origin: string): boolean;
export function accountReturn(origin: string, ok: boolean): string;
export function random(): string;
export function validRandom(v: unknown): boolean;
export function validDevice(v: unknown): boolean;
export function same(a: unknown, b: unknown): boolean;
export function challenge(verifier: string): Promise<string>;
export function browserProof(header: unknown): { state: string; proof: string } | null;
export function cookie(value: string, maxAge: number): string;
export function validIntent(b: unknown): boolean;
export function googleProfile(raw: unknown): GoogleIdentity | null;
export function authorizationUrl(clientId: string, state: string, codeChallenge: string, origin?: string): string;
export function exchangeGoogle(env: { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string }, code: string, verifier: string, request?: typeof fetch, origin?: string): Promise<GoogleIdentity>;
