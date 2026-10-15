import type { FaithCoreServiceContract } from "cocofaith-sdk/core";
import { Context } from "koishi";
import { Config as ConfigSchema, type Config as BusinessConfig } from "./config";
import { FaithBusinessService } from "./framework/service";
import { registerBuiltInBusinessModules } from "./modules";
export const name = "cocofaith-business";
export const inject = ["faithCore"];
export const Config = ConfigSchema;
export type Config = BusinessConfig;
declare module "koishi" {
    interface Context {
        faithBusiness: FaithBusinessService;
    }
}
export function apply(ctx: Context, config: Config) {
    const business = new FaithBusinessService(ctx as Context & {
        faithCore: FaithCoreServiceContract;
    }, config);
    ctx.set("faithBusiness", business);
    registerBuiltInBusinessModules(business);
    ctx.on("ready", async () => {
        try {
            await ctx.faithCore.lifecycle.ready();
            await business.start();
        } catch (error) {
            await business.shutdown();
            await business.lifecycle.dispose();
            throw error;
        }
    });
}
