const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
export const DAILY_PRAYER_MESSAGES = Object.freeze({
    result: (god: string, ascension: number, gold: number, count: number, limit: number) => `${god}回应了你｜登神分 ${signed(ascension)}｜金币 ${signed(gold)}\n今日祈祷 ${count}/${limit}`,
    adjusted: (uid: number, name: string, delta: number, after: number) => `已调整 UID ${uid} 的${name}：${signed(delta)}，当前为 ${after}。`,
});
