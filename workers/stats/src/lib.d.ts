/** TypeScript declarations for the pure JS Worker helpers in lib.js. */
export type StatStep = "visit" | "search" | "results" | "region" | "day" | "book" | "flight" | "hotel" | "save";
export interface StatEvent { v: string; s: StatStep; r: string; p?: string }
export type SignupResult =
  | { nick: string; birth: string; gender: "M" | "F"; pin: string; error?: undefined }
  | { error: string };

export const STEPS: StatStep[];
export const KEEP_DAYS: number;
export function kstDay(ms?: number): string;
export function parseEvent(raw: unknown): StatEvent | null;
export const PIN_ITER: number;
export const LOCK_AFTER: number;
export const LOCK_MIN: number;
export function nickKey(s: unknown): string;
export function validateSignup(b: unknown, today?: string): SignupResult;
export const MIN_AGE: number;
export function ageOn(birth: string, today?: string): number;
export function validPin(p: unknown): string | null;
export function randomHex(n: number): string;
export function hashPin(pin: string, saltHex: string, iter?: number): Promise<string>;
export function sha256(s: string): Promise<string>;
export function lockMs(times: number): number;
export const PLAN_MAX: number;
export const PLANS_PER_USER: number;
export const PLANS_BODY_MAX: number;
export function planOk(p: unknown): boolean;
export function hiddenNickKeys(raw: unknown): string[];
