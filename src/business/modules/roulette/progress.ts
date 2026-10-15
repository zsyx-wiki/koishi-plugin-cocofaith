import type { RouletteMode, RouletteStats } from "./types";
const EXP = [10, 15, 15, 20, 20, 25, 30, 50, 70];
export function benefits(level: number) {
    const step = level >= 10 ? 10 : Math.max(0, level - 1);
    return {
        fee: step * .06, penalty: step * .04, reward: step * .02
    };
}
export function advanceStats(stats: RouletteStats, mode: RouletteMode, place: number) {
    const previous = stats.level;
    stats.plays++;
    stats[mode].plays++;
    if (place === 1 || mode === "crazy" && place === 2)
        stats[mode].wins++;
    if (stats.level >= 10) {
        if (mode === "crazy" && place === 1)
            stats.honor++;
        return false;
    }
    let exp = place === 1 ? mode === "normal" ? 2 : mode === "gambler" ? 4 : 8 : mode === "crazy" && place === 2 ? 6 : 0;
    if (mode === "normal" && stats.level >= 5)
        exp = 0;
    if (mode === "gambler" && stats.level === 9)
        exp = Math.floor(exp / 2);
    stats.exp += exp;
    while (stats.level < 10 && stats.exp >= EXP[stats.level - 1]) {
        stats.exp -= EXP[stats.level - 1];
        stats.level++;
    }
    if (stats.level === 10)
        stats.exp = 0;
    return previous < 10 && stats.level === 10;
}
