import { Schema } from "koishi";
import { BUILT_IN_CONFIGS } from "./config-catalog";
import type { Config as BusinessConfig } from "./framework/types";
const fields = Object.fromEntries(Object.entries(BUILT_IN_CONFIGS).map(([key, { definition, description }]) => [key,
    Schema.object({
        enabled: Schema.boolean().default(true),
        config: (definition.schema as Schema<Record<string, unknown>>).default(structuredClone(definition.defaults)),
    }).default({ enabled: true, config: structuredClone(definition.defaults) }).description(description),
]));
export const Config: Schema<BusinessConfig> = Schema.object({
    ...fields,
    modules: Schema.dict(Schema.object({
        enabled: Schema.boolean().default(true),
        config: Schema.dict(Schema.any()).default({}),
    })).default({}).description("额外业务模块配置。"),
});
export type Config = BusinessConfig;
