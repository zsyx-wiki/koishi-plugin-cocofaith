import { defineGameplayConfig, gameplayInteger, refineGameplayConfig } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
export const BINDING_CONFIG = refineGameplayConfig(defineGameplayConfig({
    tokenTtlSeconds: gameplayInteger(300, {
        min: 60, max: 900, description: "绑定令牌有效时间。默认 300 秒，范围 60-900。"
    }),
    maxPending: gameplayInteger(1000, {
        min: 10, max: 5000, description: "同时保留的待确认绑定数量。默认 1000，范围 10-5000。"
    }),
}), value => {
    // Field constraints are generated from the same definition as the Koishi schema.
});
export type BindingConfig = ReturnType<typeof BINDING_CONFIG.parse>;
export const DEFAULT_BINDING_CONFIG = BINDING_CONFIG.defaults;
export function validateBindingConfig(value: unknown): BindingConfig {
    try {
        return BINDING_CONFIG.parse(value);
    }
    catch (cause) {
        throw new BusinessError("CONFIG_INVALID", cause instanceof Error ? cause.message : "配置无效", undefined, { cause });
    }
}
