import { defineGameplayConfig, gameplayInteger, refineGameplayConfig } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
export const DAILY_PRAYER_CONFIG = refineGameplayConfig(defineGameplayConfig({
    baseLimit: gameplayInteger(1, {
        min: 1, max: 10000, description: "每日基础祈祷次数。默认 1。"
    }),
    ascensionMin: gameplayInteger(-10, {
        min: -1000000, max: 1000000, description: "登神分基础奖励下限。默认 -10。"
    }),
    ascensionMax: gameplayInteger(75, {
        min: -1000000, max: 1000000, description: "登神分基础奖励上限。默认 75。"
    }),
    goldMin: gameplayInteger(-25, {
        min: -1000000, max: 1000000, description: "金币基础奖励下限。默认 -25。"
    }),
    goldMax: gameplayInteger(400, {
        min: -1000000, max: 1000000, description: "金币基础奖励上限。默认 400。"
    }),
}), value => {
    if (value.ascensionMin > value.ascensionMax || value.goldMin > value.goldMax)
        throw new RangeError("每日祈祷奖励下限不能大于上限");
});
export type DailyPrayerConfig = ReturnType<typeof DAILY_PRAYER_CONFIG.parse>;
export const DEFAULT_DAILY_PRAYER_CONFIG = DAILY_PRAYER_CONFIG.defaults;
export function validateDailyPrayerConfig(value: unknown): DailyPrayerConfig {
    try {
        return DAILY_PRAYER_CONFIG.parse(value);
    }
    catch (cause) {
        throw new BusinessError("CONFIG_INVALID", cause instanceof Error ? cause.message : "配置无效", undefined, { cause });
    }
}
