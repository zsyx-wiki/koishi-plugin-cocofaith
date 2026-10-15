import { Schema } from "koishi";
import { Config as CoreSchema, type Config as CoreConfig } from "./core/config";
import { Config as BusinessSchema, type Config as BusinessConfig } from "./business/config";

export interface Config {
  core: CoreConfig;
  business: BusinessConfig;
}

export const Config: Schema<Config> = Schema.object({
  core: CoreSchema.default(Schema.resolve({}, CoreSchema, {})[0]).description("数据与基础服务。"),
  business: BusinessSchema.default(Schema.resolve({}, BusinessSchema, {})[0]).description("玩法与模块配置。"),
});
