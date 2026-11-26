export type { DailyPrayerState } from "./api";
export type { DailyPrayerConfig } from "./config";

export interface DailyPrayerResult {
    faith: string;
    god: string;
    count: number;
    limit: number;
    base: {
        gold: number;
        ascension_score: number;
    };
    reward: {
        gold: number;
        ascension_score: number;
    };
}
