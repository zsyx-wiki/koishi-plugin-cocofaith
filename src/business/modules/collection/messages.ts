export const COLLECTION_MESSAGES = Object.freeze({
    help: "图鉴 查看\n图鉴 详情 [页码]\n图鉴 限定详情 [页码]",
    progress: (rows: readonly string[]) => ["图鉴进度", ...rows].join("\n"),
    page: (limited: boolean, page: number, pages: number, entries: readonly string[]) => [`${limited ? "限定" : "稀有"}图鉴：${page}/${pages} 页`, ...entries, ...(entries.length ? [] : ["暂无收藏品"])].join("\n"),
    refreshed: (checked: number, added: number, failed: number) => `图鉴刷新：检查 ${checked} 人，新增 ${added} 项，失败 ${failed} 人。`,
    refreshedOne: (uid: number, added: number) => `图鉴刷新：UID ${uid} 新增 ${added} 项。`,
});
