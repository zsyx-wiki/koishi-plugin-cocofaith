export type FaithCurrency = "gold" | "ascension_score";
export type { FaithEconomyChangeResult, FaithEconomyOptions, FaithMoney, FaithRewardOptions, FaithRewardPreview, FaithTransferResult, FaithWallet } from "cocofaith-sdk/core";
export const FAITH_CURRENCIES = Object.freeze({
    gold: Object.freeze({ id: "gold" as const, name: "金币" }),
    ascension_score: Object.freeze({ id: "ascension_score" as const, name: "登神分数" }),
});
