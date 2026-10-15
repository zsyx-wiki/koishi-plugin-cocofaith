import { Schema } from "koishi";
import { BUILT_IN_CONFIGS } from "./config-catalog";
import type { Config as BusinessConfig } from "./framework/types";

// 控制台会序列化并重建 Schema，不能执行依赖 SDK 闭包的 transform。
// 表单保留字段约束，跨字段校验仍由 BusinessConfigStore 的 validateConfig 执行。
function formSchema(schema: Schema): Schema {
    if (schema.type === "transform") {
        const inner = formSchema(schema.inner!);
        return new Schema({ ...inner, meta: { ...inner.meta, ...schema.meta } });
    }
    return new Schema({
        ...schema,
        ...(schema.inner && { inner: formSchema(schema.inner) }),
        ...(schema.sKey && { sKey: formSchema(schema.sKey) }),
        ...(schema.list && { list: schema.list.map(formSchema) }),
        ...(schema.dict && { dict: Object.fromEntries(Object.entries(schema.dict).map(([key, value]) => [key, formSchema(value)])) }),
    });
}

const fields = Object.fromEntries(Object.entries(BUILT_IN_CONFIGS).map(([key, { definition, description }]) => [key,
    Schema.object({
        enabled: Schema.boolean().default(true),
        config: formSchema(definition.schema).default(structuredClone(definition.defaults)),
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
