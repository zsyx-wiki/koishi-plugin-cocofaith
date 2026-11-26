/** 兼容出口：旧实现类与内置模块保留至下一主版本迁移，不作为新扩展入口。 */
export * from "./framework/contributions";
export * from "./framework/errors";
export * from "./framework/gameplay-adapter";
export * from "./framework/graph";
export * from "./framework/interfaces";
export * from "./framework/manager";
export * from "./framework/module-config";
export * from "./framework/protocol";
export * from "./framework/registry";
export * from "./framework/router";
export * from "./framework/runtime";
export * from "./framework/service";
export * from "./framework/types";
export * from "./modules";
export * from "./contracts/tokens";
export { MESSAGES } from "./shared/messages";
export type { FaithMessages } from "./shared/messages";
export * from "./version";
export * from "./framework/built-in";

export type * from "./contracts/gameplay";
