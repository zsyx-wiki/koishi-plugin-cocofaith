export type { FaithAdapterInfo, FaithAdapterService } from "cocofaith-sdk/adapter";

export const name = "cocofaith";
export const inject = ["database", "faithAdapter"] as const;
export { Config } from "./config";
export { composeServices as apply } from "./composition";
export { COCOFAITH_VERSION } from "./version";
export * as core from "./core";
export * as business from "./business";
export { FaithCoreService } from "./core/service";
export { FaithBusinessService } from "./business/framework/service";
export type * from "cocofaith-sdk/core";
