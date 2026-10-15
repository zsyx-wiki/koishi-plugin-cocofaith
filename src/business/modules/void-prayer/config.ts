import { defineGameplayConfig, gameplayArray, gameplayInteger, gameplayNumber, gameplayObject, gameplayString, refineGameplayConfig } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
export const VOID_PRAYER_CONFIG = refineGameplayConfig(defineGameplayConfig({
    baseCost: gameplayInteger(45, {
        min: 0, max: 1000000000, description: "每日前三次祈求的单次金币消耗。默认 45。"
    }),
    extraCost: gameplayInteger(80, {
        min: 0, max: 1000000000, description: "超过基础次数后的单次金币消耗。默认 80。"
    }),
    baseCostDraws: gameplayInteger(3, {
        min: 0, max: 10000, description: "每日使用基础价格的次数。默认 3。"
    }),
    dailyLimit: gameplayInteger(10, {
        min: 1, max: 10000, description: "每日基础祈求上限。默认 10。"
    }),
    maxDrawsPerCommand: gameplayInteger(100, {
        min: 1, max: 1000, description: "单条命令最大祈求次数。默认 100。"
    }),
    easterEggChance: gameplayNumber(0.05, {
        min: 0, max: 1, description: "彩蛋概率。默认 0.05。"
    }),
    probabilities: gameplayObject({
        SP: gameplayNumber(0.0005, {
            min: 0, max: 1, description: "SP 概率"
        }),
        SSS: gameplayNumber(0.0043, {
            min: 0, max: 1, description: "SSS 概率"
        }),
        SS: gameplayNumber(0.0152, {
            min: 0, max: 1, description: "SS 概率"
        }),
        S: gameplayNumber(0.0374, {
            min: 0, max: 1, description: "S 概率"
        }),
        A: gameplayNumber(0.0897, {
            min: 0, max: 1, description: "A 概率"
        }),
        B: gameplayNumber(0.1608, {
            min: 0, max: 1, description: "B 概率"
        }),
        C: gameplayNumber(0.3188, {
            min: 0, max: 1, description: "C 概率"
        }),
        D: gameplayNumber(0.3733, {
            min: 0, max: 1, description: "D 概率"
        }),
    }),
    upSpItems: gameplayArray(gameplayString("真理仪轨", { minLength: 1 }), ["真理仪轨", "忆妄之镜", "骨仆赎罪者子嗣之戒", "骨仆乐乐尔之戒"], { maxLength: 100 }),
}), value => {
    if (Math.abs(Object.values(value.probabilities).reduce((sum, chance) => sum + chance, 0) - 1) > 1e-9)
        throw new RangeError("虚空祈求概率总和必须为 1");
});
export type VoidPrayerConfig = ReturnType<typeof VOID_PRAYER_CONFIG.parse>;
export const DEFAULT_VOID_PRAYER_CONFIG = VOID_PRAYER_CONFIG.defaults;
export function validateVoidPrayerConfig(value: unknown): VoidPrayerConfig {
    try {
        return VOID_PRAYER_CONFIG.parse(value);
    }
    catch (cause) {
        throw new BusinessError("CONFIG_INVALID", cause instanceof Error ? cause.message : "配置无效", undefined, { cause });
    }
}
