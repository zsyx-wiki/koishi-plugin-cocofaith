import { defineGameplayConfig, gameplayInteger, refineGameplayConfig } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
export const FAITH_CONFIG = refineGameplayConfig(defineGameplayConfig({
    abandonBaseAscensionCost: gameplayInteger(1200, {
        min: 0, max: 1000000000, description: "首次弃誓登神分消耗。默认 1200。"
    }),
    abandonAscensionCostPerUse: gameplayInteger(1000, {
        min: 0, max: 1000000000, description: "每次弃誓增加的登神分消耗。默认 1000。"
    }),
    abandonMaxAscensionCost: gameplayInteger(10000, {
        min: 0, max: 1000000000, description: "弃誓登神分消耗上限。默认 10000。"
    }),
    changeProfessionGoldCost: gameplayInteger(1000, {
        min: 0, max: 1000000000, description: "变更职业金币消耗。默认 1000。"
    }),
    changeProfessionAscensionCost: gameplayInteger(50, {
        min: 0, max: 1000000000, description: "变更职业登神分消耗。默认 50。"
    }),
}), value => {
    if (value.abandonMaxAscensionCost < value.abandonBaseAscensionCost)
        throw new RangeError("弃誓登神分上限不能低于基础消耗");
});
export type FaithGameplayConfig = ReturnType<typeof FAITH_CONFIG.parse>;
export const DEFAULT_FAITH_CONFIG = FAITH_CONFIG.defaults;
export function validateFaithConfig(value: unknown): FaithGameplayConfig {
    try {
        return FAITH_CONFIG.parse(value);
    }
    catch (cause) {
        throw new BusinessError("CONFIG_INVALID", cause instanceof Error ? cause.message : "配置无效", undefined, { cause });
    }
}
