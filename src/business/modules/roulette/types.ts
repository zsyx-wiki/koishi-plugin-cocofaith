import type { RouletteMode, RouletteStats, RouletteState } from "./api";
export type { RouletteMode, RoulettePlayer, RouletteState, RouletteStats } from "./api";



export type { RouletteConfig } from "./config";

export const initialStats = (): RouletteStats => ({
    level: 1, exp: 0, honor: 0, plays: 0, normal: { plays: 0, wins: 0 }, gambler: { plays: 0, wins: 0 }, crazy: { plays: 0, wins: 0 }
});
export function initialState(mode: RouletteMode): RouletteState {
    return {
        mode, players: [], order: [], current: 0, round: 0, chambers: [], field: "", extra: "", dealer: 0, demon: 0,
        fear: 0, firstBlood: true, deaths: [], pool: { gold: 0, ascension_score: 0 }, feePool: 0, turn: 0, logs: [], settled: false, maxLevelUids: [], rewards: []
    };
}
