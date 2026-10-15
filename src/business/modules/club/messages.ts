export const CLUB_MESSAGES = Object.freeze({
    help: "俱乐部 加入\n俱乐部 退出\n俱乐部 救济\n俱乐部 贡献 [金币|登神分] [数值]\n俱乐部 信息",
    firstJoin: (level: string, gold: number, ascension: number, titles: readonly string[]) => `欢迎加入椰汁俱乐部。\n已缴纳初次会费：${gold} 金币、${ascension} 登神分\n当前等级：${level}${titles.length ? `\n获得称号：${titles.join("、")}` : ""}`,
    rejoin: (level: string, charged: boolean, gold: number, ascension: number) => charged
        ? `欢迎回到椰汁俱乐部。\n已缴纳本日会费：${gold} 金币、${ascension} 登神分\n当前等级：${level}`
        : `欢迎回到椰汁俱乐部。\n今天已经缴过会费，本次不会重复收取。\n当前等级：${level}`,
    hallRejoin: (charged: boolean, gold: number, ascension: number) => charged
        ? `欢迎归来。每日会费已恢复。\n本日会费：${gold} 金币、${ascension} 登神分`
        : "每日会费已恢复。本日会费已经缴纳，不再重复收取。",
    quit: "你已退出椰汁俱乐部，在会期间的收益加成已经停止。历史贡献和永久称号仍会保留。",
    hallQuit: "殿堂椰汁的荣誉与权益将永久保留。每日会费已停止，重新加入后可继续缴纳。",
    donated: (type: string, amount: number, level: string, titles: readonly string[]) => `已向椰汁俱乐部贡献 ${amount} ${type}。\n当前等级：${level}${titles.length ? `\n获得称号：${titles.join("、")}` : ""}`,
    aided: (gold: number, ascension: number) => `椰汁俱乐部已提供救济：金币 +${gold}，登神分 +${ascension}。`,
    info: (level: string, active: boolean, duesEnabled: boolean, fees: number, gold: number, ascension: number, poolGold: number, poolAscension: number) => [`椰汁等级：${level}`, `身份状态：${active ? "生效" : "未激活"}`, `每日会费：${duesEnabled ? "收取中" : "已停止"}`, `累计缴费：${fees} 次`, `累计贡献金币：${gold}`, `累计贡献登神分：${ascension}`, `贡献池：${poolGold} 金币 / ${poolAscension} 登神分`].join("\n"),
    nonMemberInfo: (gold: number, ascension: number) => `你尚未加入椰汁俱乐部。\n贡献池：${gold} 金币 / ${ascension} 登神分`,
    distributed: (count: number, gold: number, ascension: number) => `分成完成：${count} 名椰汁获得共 ${gold} 金币、${ascension} 登神分。`,
    poolChanged: (gold: number, ascension: number) => `贡献池已调整：${gold} 金币 / ${ascension} 登神分。`,
    statsChanged: (uid: number, name: string, value: number) => `已调整 UID ${uid} 的${name}，当前值：${value}。`,
});
