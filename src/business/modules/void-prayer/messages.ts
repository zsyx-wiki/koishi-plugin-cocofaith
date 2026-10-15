const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
export const VOID_PRAYER_MESSAGES = Object.freeze({
    status: (used: number, limit: number, remaining: number, extra: number, reduction: number) => `虚空祈求｜今日 ${used}/${limit}\n剩余 ${remaining} 次（奖励次数 ${extra}）\n费用减免 ${Math.round(reduction * 100)}%`,
    result: (actual: number, requested: number, cost: number, levels: string, items: string, used: number, limit: number, remaining: number) => [
        `虚空祈求 ×${actual}｜消耗 ${cost} 金币`, levels, `最高稀有物品：\n${items}`,
        `今日 ${used}/${limit}｜剩余 ${remaining} 次`, actual < requested ? `可用次数不足，已自动调整为 ${actual} 次。` : "",
    ].filter(Boolean).join("\n"),
    adjusted: (uid: number, name: string, delta: number, after: number) => `已调整 UID ${uid} 的${name}：${signed(delta)}，当前为 ${after}。`,
});
