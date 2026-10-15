import type { FaithMoney } from "cocofaith-sdk/core";
export type RouletteMode = "normal" | "gambler" | "crazy";
export interface RoulettePlayer {
    uid: number;
    name: string;
    path: string;
    level: number;
    alive: boolean;
    timeouts: number;
    flags: Record<string, number>;
    chambers: boolean[];
    penalty: FaithMoney;
}
export interface RouletteState {
    mode: RouletteMode;
    players: RoulettePlayer[];
    order: number[];
    current: number;
    round: number;
    chambers: boolean[];
    field: string;
    extra: string;
    dealer: number;
    demon: number;
    fear: number;
    firstBlood: boolean;
    seal?: {
        source: number;
        target: number;
    };
    deaths: number[];
    pool: {
        gold: number;
        ascension_score: number;
    };
    feePool: number;
    turn: number;
    logs: string[];
    settled: boolean;
    maxLevelUids: number[];
    rewards: Array<{
        uid: number;
        place: number;
        base: FaithMoney;
        applied: FaithMoney;
    }>;
    aborted?: boolean;
}
export type { RouletteConfig } from "./config";
export interface RouletteStats extends Record<string, unknown> {
    level: number;
    exp: number;
    honor: number;
    plays: number;
    normal: {
        plays: number;
        wins: number;
    };
    gambler: {
        plays: number;
        wins: number;
    };
    crazy: {
        plays: number;
        wins: number;
    };
}
export const initialStats = (): RouletteStats => ({
    level: 1, exp: 0, honor: 0, plays: 0, normal: { plays: 0, wins: 0 }, gambler: { plays: 0, wins: 0 }, crazy: { plays: 0, wins: 0 }
});
export function initialState(mode: RouletteMode): RouletteState {
    return {
        mode, players: [], order: [], current: 0, round: 0, chambers: [], field: "", extra: "", dealer: 0, demon: 0,
        fear: 0, firstBlood: true, deaths: [], pool: { gold: 0, ascension_score: 0 }, feePool: 0, turn: 0, logs: [], settled: false, maxLevelUids: [], rewards: []
    };
}
