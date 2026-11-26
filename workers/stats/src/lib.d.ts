/** TypeScript declarations for the pure JS Worker helpers in lib.js. */
export type StatStep = "visit" | "search" | "results" | "region" | "day" | "book" | "flight" | "hotel" | "save";
export interface StatEvent { v: string; s: StatStep; r: string; p?: string; g?: string[] }

export const STEPS: StatStep[];
export const KEEP_DAYS: number;
export const SEARCH_AREAS: string[];
export function kstDay(ms?: number): string;
export function parseEvent(raw: unknown): StatEvent | null;
export function nickKey(s: unknown): string;
export function randomHex(n: number): string;
export function sha256(s: string): Promise<string>;
export const PLAN_MAX: number;
export const PLANS_PER_USER: number;
export const PLANS_BODY_MAX: number;
export function planOk(p: unknown): boolean;
export function hiddenNickKeys(raw: unknown): string[];
