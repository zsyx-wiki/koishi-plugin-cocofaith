export type { VoidPrayerState } from "./api";
import type { FaithItemDefinition } from "cocofaith-sdk/core";
export type VoidPrayerLevel = typeof VOID_PRAYER_LEVELS[number];
export const VOID_PRAYER_LEVELS = ["SP", "SSS", "SS", "S", "A", "B", "C", "D"] as const;

export type { VoidPrayerConfig } from "./config";

export interface VoidPrayerDraw {
    item: Readonly<FaithItemDefinition>;
    easterEgg: boolean;
}
export interface VoidPrayerResult {
    requested: number;
    actual: number;
    cost: number;
    date: string;
    used: number;
    dailyLimit: number;
    remaining: number;
    draws: readonly VoidPrayerDraw[];
    counts: Readonly<Record<string, number>>;
}
