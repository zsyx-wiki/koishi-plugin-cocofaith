export type { DailyPrayerConfig } from "./config";
export interface DailyPrayerState {
    date: string;
    count: number;
    permanentExtra: number;
    temporaryExtra: number;
    temporaryDate: string;
}
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
