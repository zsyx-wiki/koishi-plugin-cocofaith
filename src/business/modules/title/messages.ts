export const TITLE_MESSAGES = Object.freeze({
    help: "称号命令｜称号 列表｜称号 详情 [称号名]｜称号 使用 [称号名]",
    empty: "你尚未获得任何称号。",
    list: (values: readonly {
        name: string;
        active: boolean;
    }[]) => values.map((value, index) => `${index + 1}. 【${value.name}】${value.active ? "（使用中）" : ""}`).join("\n"),
    detail: (name: string, description: string, source: string, bonuses: string) => `【${name}】\n${description}\n来源：${source}\n加成：${bonuses}`,
    used: (name: string) => `已使用称号【${name}】。`,
    granted: (uid: number, name: string, changed: boolean) => changed ? `已向 UID ${uid} 给予称号【${name}】。` : `UID ${uid} 已拥有该称号。`,
    revoked: (uid: number, name: string, changed: boolean) => changed ? `已从 UID ${uid} 收回称号【${name}】。` : `UID ${uid} 未持有该称号。`,
    active: (name?: string) => `称号：${name ? `【${name}】` : "无"}`,
});
