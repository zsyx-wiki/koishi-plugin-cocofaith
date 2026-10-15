import { defineGameplayConfig, gameplayInteger, refineGameplayConfig } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
export const JUNK_CONFIG = refineGameplayConfig(defineGameplayConfig({
    itemCount: gameplayInteger(3, {
        min: 1, max: 100, description: "每次捡到的物品数量。默认 3。"
    }),
    paidGoldCost: gameplayInteger(200, {
        min: 0, max: 1000000, description: "每日第二次捡垃圾消耗的金币。默认 200。"
    }),
    paidAscensionCost: gameplayInteger(5, {
        min: 0, max: 1000000, description: "每日第二次捡垃圾消耗的登神分。默认 5。"
    }),
}), value => {
    // Field constraints are generated from the same definition as the Koishi schema.
});
export type JunkConfig = ReturnType<typeof JUNK_CONFIG.parse>;
export const DEFAULT_JUNK_CONFIG = JUNK_CONFIG.defaults;
export function validateJunkConfig(value: unknown): JunkConfig {
    try {
        return JUNK_CONFIG.parse(value);
    }
    catch (cause) {
        throw new BusinessError("CONFIG_INVALID", cause instanceof Error ? cause.message : "配置无效", undefined, { cause });
    }
}
