import { Context } from "koishi";
import { Config as ConfigSchema, type Config as CoreConfig } from "./config";
import { registerCoreModels } from "./database";
import { CORE_SERVICE_ORDER, FaithCoreService } from "./service";
export const name = "cocofaith-core";
export const inject = ["database"];
export const Config = ConfigSchema;
export type Config = CoreConfig;
declare module "koishi" {
    interface Context {
        faithCore: FaithCoreService;
    }
}
export async function apply(ctx: Context, config: Config) {
    const logger = ctx.logger("cocofaith-core");
    const startedAt = Date.now();
    registerCoreModels(ctx);
    logger.debug("数据库模型已注册");
    const core = new FaithCoreService(ctx, config);
    try {
        await core.lifecycle.init();
        ctx.set("faithCore", core);
    } catch (error) {
        await core.lifecycle.dispose();
        throw error;
    }
    logger.info(`Core 初始化完成（${Date.now() - startedAt}ms，API ${core.apiVersion}）`);
    logger.debug(`服务层级：${CORE_SERVICE_ORDER.join(" → ")}`);
}
