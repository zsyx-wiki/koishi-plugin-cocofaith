import { defineGameplayConfig, gameplayInteger, gameplayNumber, refineGameplayConfig, } from "cocofaith-sdk/gameplay";
const CONTAINER_FIELDS = defineGameplayConfig({
    maxCapacity: gameplayInteger(300, {
        min: 1, max: 1000000, description: "神性容器硬上限。"
    }),
    manualInfusionMax: gameplayInteger(250, {
        min: 1, max: 1000000, description: "允许手动投入达到的神性上限。"
    }),
    passiveMaxDivinity: gameplayInteger(150, { min: 0, max: 1000000 }),
    goldPerDivinity: gameplayNumber(0.002, { min: 0, max: 100 }),
    ascensionPerDivinity: gameplayNumber(0.0015, { min: 0, max: 100 }),
    maxConsecrationCharges: gameplayInteger(16, { min: 0, max: 1000000 }),
    dailyChargeRecovery: gameplayInteger(2, { min: 0, max: 1000000 }),
    consecrationDivinityCost: gameplayInteger(4, { min: 1, max: 1000000 }),
    consecrationAudienceReward: gameplayInteger(1, { min: 0, max: 1000000 }),
    subgodDivinityCost: gameplayInteger(150, { min: 1, max: 1000000 }),
    subgodGoldReward: gameplayInteger(5000, { min: 0, max: 1000000000 }),
    subgodAscensionReward: gameplayInteger(500, { min: 0, max: 1000000000 }),
    subgodAudienceReward: gameplayInteger(5, { min: 0, max: 1000000000 }),
    subgodGoldBonus: gameplayNumber(0.25, { min: 0, max: 100 }),
    subgodAscensionBonus: gameplayNumber(0.15, { min: 0, max: 100 }),
    subgodVoidPrayerBonus: gameplayInteger(10, { min: 0, max: 1000000 }),
    subgodDailyPrayerBonus: gameplayInteger(1, { min: 0, max: 1000000 }),
    truegodDivinityCost: gameplayInteger(250, { min: 1, max: 1000000 }),
    truegodBaseGoldCost: gameplayInteger(100000, { min: 0, max: 1000000000 }),
    truegodGoldIncrement: gameplayInteger(15000, { min: 0, max: 1000000000 }),
    truegodBaseAscensionCost: gameplayInteger(5000, { min: 0, max: 1000000000 }),
    truegodAscensionIncrement: gameplayInteger(1500, { min: 0, max: 1000000000 }),
    truegodGoldBonus: gameplayNumber(0.5, { min: 0, max: 100 }),
    truegodAscensionBonus: gameplayNumber(0.3, { min: 0, max: 100 }),
    truegodVoidPrayerBonus: gameplayInteger(50, { min: 0, max: 1000000 }),
});
export const CONTAINER_CONFIG = refineGameplayConfig(CONTAINER_FIELDS, config => {
    if (config.manualInfusionMax > config.maxCapacity)
        throw new RangeError("manualInfusionMax 不能超过 maxCapacity");
    if (config.subgodDivinityCost > config.maxCapacity || config.truegodDivinityCost > config.maxCapacity)
        throw new RangeError("登神所需神性不能超过容器上限");
});
export type ContainerConfig = ReturnType<typeof CONTAINER_CONFIG.parse>;
export const validateContainerConfig = CONTAINER_CONFIG.parse;
