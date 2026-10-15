import { defineGameplayConfig, gameplayInteger, gameplayNumber } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
export const CLUB_CONFIG = defineGameplayConfig({
  firstGoldFee: gameplayInteger(2000, {
    min: 0,
    max: 9007199254740991,
    description: "首次入会金币会费。默认 2000。",
  }),
  firstAscensionFee: gameplayInteger(200, {
    min: 0,
    max: 9007199254740991,
    description: "首次入会登神分会费。默认 200。",
  }),
  dailyGoldFee: gameplayInteger(200, {
    min: 0,
    max: 9007199254740991,
    description: "每日金币会费。默认 200。",
  }),
  dailyAscensionFee: gameplayInteger(20, {
    min: 0,
    max: 9007199254740991,
    description: "每日登神分会费。默认 20。",
  }),
  poolRate: gameplayNumber(1.1, {
    min: 1,
    max: 10,
    description: "poolRate",
  }),
  aidGold: gameplayInteger(300, {
    min: 0,
    max: 9007199254740991,
    description: "单次救济金币。默认 300。",
  }),
  aidAscension: gameplayInteger(40, {
    min: 0,
    max: 9007199254740991,
    description: "单次救济登神分。默认 40。",
  }),
  aidGoldThreshold: gameplayInteger(2000, {
    min: 0,
    max: 9007199254740991,
    description: "领取救济时金币必须低于此值。默认 2000。",
  }),
  aidAscensionThreshold: gameplayInteger(600, {
    min: 0,
    max: 9007199254740991,
    description: "领取救济时登神分必须低于此值。默认 600。",
  }),
});
export type ClubConfig = ReturnType<typeof CLUB_CONFIG.parse>;
export const DEFAULT_CLUB_CONFIG = CLUB_CONFIG.defaults;
export function validateClubConfig(value: unknown): ClubConfig {
  try {
    return CLUB_CONFIG.parse(value);
  } catch (cause) {
    throw new BusinessError(
      "CONFIG_INVALID",
      cause instanceof Error ? cause.message : "配置无效",
      undefined,
      { cause },
    );
  }
}
