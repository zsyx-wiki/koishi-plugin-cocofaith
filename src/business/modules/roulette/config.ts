import { defineGameplayConfig, gameplayInteger, refineGameplayConfig } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
export const ROULETTE_CONFIG = refineGameplayConfig(defineGameplayConfig({
    turnSeconds: gameplayInteger(45, {
        min: 5, max: 300, description: "每人操作时限，默认45秒，范围5-300。发送失败不暂停。"
    }),
    normalMin: gameplayInteger(4, {
        min: 2, max: 12, description: "普通模式最低人数，默认4，范围2-12。"
    }),
    gamblerMin: gameplayInteger(5, {
        min: 2, max: 15, description: "赌徒模式最低人数，默认5，范围2-15。"
    }),
    crazyMin: gameplayInteger(8, {
        min: 2, max: 16, description: "疯狂模式最低人数，默认8，范围2-16。"
    }),
    entryFee: gameplayInteger(100, {
        min: 0, max: 1000000, description: "疯狂模式基础门票，默认100金币；开局时按等级折扣统一扣费。"
    }),
}), value => {
    // Field constraints are generated from the same definition as the Koishi schema.
});
export type RouletteConfig = ReturnType<typeof ROULETTE_CONFIG.parse>;
export const DEFAULT_ROULETTE_CONFIG = ROULETTE_CONFIG.defaults;
export function validateRouletteConfig(value: unknown): RouletteConfig {
    try {
        return ROULETTE_CONFIG.parse(value);
    }
    catch (cause) {
        throw new BusinessError("CONFIG_INVALID", cause instanceof Error ? cause.message : "配置无效", undefined, { cause });
    }
}
