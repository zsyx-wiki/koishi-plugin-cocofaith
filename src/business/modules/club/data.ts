import type { FaithStatusIdentityDefinition } from "cocofaith-sdk/core";
import type { ClubLevel, ClubStats } from "./types";
export const CLUB_IDENTITY_ID = "coconut_juice_club";
export const CLUB_LEVELS: Readonly<Record<ClubLevel, {
    name: string;
    title?: string;
    rank: number;
    shareFactor: number;
}>> = Object.freeze({
    public: Object.freeze({
        name: "公益椰汁", rank: 0, shareFactor: 0
    }),
    silver: Object.freeze({
        name: "银牌椰汁", title: "silver-coconut-juice", rank: 1, shareFactor: 0
    }),
    gold: Object.freeze({
        name: "金牌椰汁", title: "gold-coconut-juice", rank: 2, shareFactor: 1
    }),
    honor: Object.freeze({
        name: "荣誉椰汁", title: "honor-coconut-juice", rank: 3, shareFactor: 1
    }),
    hall: Object.freeze({
        name: "殿堂椰汁", title: "hall-coconut-juice", rank: 4, shareFactor: 1.3
    }),
});
export const CLUB_IDENTITY: FaithStatusIdentityDefinition = Object.freeze({
    id: CLUB_IDENTITY_ID,
    name: "椰汁俱乐部会员",
    description: "椰汁俱乐部会员身份、等级与生效状态。",
    levels: Object.freeze(([
        ["public", 0, 0.2, 0.1], ["silver", 1, 0.3, 0.15], ["gold", 2, 0.4, 0.2],
        ["honor", 3, 0.5, 0.25], ["hall", 4, 0.5, 0.25],
    ] as const).map(([id, rank, gold, ascension]) => Object.freeze({
        id, name: CLUB_LEVELS[id].name, rank, bonuses: Object.freeze([
            Object.freeze({
                type: "gold", modifier: gold, detail: `${CLUB_LEVELS[id].name}金币收益加成`
            }),
            Object.freeze({
                type: "ascension_score", modifier: ascension, detail: `${CLUB_LEVELS[id].name}登神分收益加成`
            }),
        ])
    }))),
});
export function levelFor(stats: ClubStats): ClubLevel {
    if (stats.hallUnlocked || (stats.feeCount >= 300 && stats.goldContribution >= 100000 && stats.ascensionContribution >= 5000))
        return "hall";
    if (stats.feeCount >= 90)
        return "honor";
    if (stats.feeCount >= 60 && stats.goldContribution >= 30000 && stats.ascensionContribution >= 2000)
        return "gold";
    if (stats.feeCount >= 30 && stats.goldContribution >= 20000 && stats.ascensionContribution >= 1000)
        return "silver";
    return "public";
}
export function qualifyingTitles(stats: ClubStats) {
    const result = ["good-coconut-juice"];
    if (stats.feeCount >= 30 && stats.goldContribution >= 20000 && stats.ascensionContribution >= 1000)
        result.push("silver-coconut-juice");
    if (stats.feeCount >= 60 && stats.goldContribution >= 30000 && stats.ascensionContribution >= 2000)
        result.push("gold-coconut-juice");
    if (stats.feeCount >= 90)
        result.push("honor-coconut-juice");
    if (stats.hallUnlocked || (stats.feeCount >= 300 && stats.goldContribution >= 100000 && stats.ascensionContribution >= 5000))
        result.push("hall-coconut-juice");
    return result;
}
