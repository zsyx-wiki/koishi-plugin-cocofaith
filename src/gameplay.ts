/** 高级玩法公共清单。普通玩法定义、配置与测试工具直接从 cocofaith-sdk 导入。 */
export { defineAdvancedGameplay } from "./business/framework/types";
export type {
  AdvancedGameplayModule,
  AdvancedGameplayCommand,
  BusinessModuleContext,
  BusinessCommandContext,
  BusinessExecutionContext,
  BusinessInterfaceOptions,
} from "./business/framework/types";
export { BusinessError } from "./business/framework/errors";
export type { BusinessErrorCode } from "./business/framework/errors";
export type { BusinessEvent, BusinessDispatchResult } from "cocofaith-sdk/protocol";
export type { GameplayResult } from "cocofaith-sdk/gameplay";
export type * from "./business/contracts/gameplay";
export {
  TITLE_API, ROOMS_API, ROULETTE_API, ADMIN_FIELDS_API, ADMIN_COMMANDS_API,
  FAITH_INFO, FAITH_BEFORE_ABANDON, BINDING_API, CLUB_API, DAILY_PRAYER_API,
  VOID_PRAYER_API, COLLECTION_API, CONTAINER_API, FAITH_REGISTRY_API,
} from "./business/shared/contracts";
