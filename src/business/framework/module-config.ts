import { BUILT_IN_CONFIGS } from "../config-catalog";
import { BusinessError } from "./errors";
import type { BusinessModuleConfig, Config, FaithBusinessModule } from "./types";
export const MAX_BUSINESS_CONFIG_BYTES = 256 * 1024;
function clone<T>(value: T): T {
    let serialized: string;
    try {
        const result = JSON.stringify(value ?? {});
        if (result === undefined)
            throw new TypeError("配置不可序列化");
        serialized = result;
    }
    catch (error) {
        throw new BusinessError("CONFIG_INVALID", "业务配置必须可序列化。", undefined, { cause: error });
    }
    if (Buffer.byteLength(serialized, "utf8") > MAX_BUSINESS_CONFIG_BYTES)
        throw new BusinessError("CONFIG_INVALID", "单个业务配置不能超过 256 KiB。");
    const result = JSON.parse(serialized) as T;
    assertSafeObject(result);
    return result;
}
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
function assertSafeObject(value: unknown, depth = 0): void {
    if (depth > 64)
        throw new BusinessError("CONFIG_INVALID", "业务配置嵌套层级不能超过 64。");
    if (!value || typeof value !== "object")
        return;
    for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(key))
            throw new BusinessError("CONFIG_INVALID", `业务配置包含禁止字段：${key}`);
        assertSafeObject(child, depth + 1);
    }
}
function deepFreeze<T>(value: T): Readonly<T> {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value))
            deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}
function merge(base: Record<string, unknown>, override: Record<string, unknown>) {
    const output: Record<string, unknown> = Object.assign(Object.create(null), base);
    for (const [key, value] of Object.entries(override)) {
        if (value && typeof value === "object" && !Array.isArray(value) && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) {
            output[key] = merge(output[key] as Record<string, unknown>, value as Record<string, unknown>);
        }
        else
            output[key] = value;
    }
    return output;
}
export class BusinessConfigStore {
    private overrides: Config["modules"];
    constructor(config: Config) {
        this.overrides = clone(config.modules ?? {});
        for (const [key, entry] of Object.entries(BUILT_IN_CONFIGS)) {
            const value = config[key as keyof typeof BUILT_IN_CONFIGS];
            if (value)
                this.overrides[entry.module] = clone({ ...(this.overrides[entry.module] ?? {}), ...value });
        }
    }
    isEnabled(name: string) {
        return this.overrides[name]?.enabled !== false;
    }
    resolve<C>(module: FaithBusinessModule<unknown, unknown, C>): Readonly<C> {
        const defaults = clone(module.defaultConfig ?? {}) as Record<string, unknown>;
        const override = clone(this.overrides[module.name]?.config ?? {});
        const merged = merge(defaults, override);
        try {
            return deepFreeze(module.validateConfig ? module.validateConfig(merged) : merged as C);
        }
        catch (error) {
            throw new BusinessError("CONFIG_INVALID", `业务 ${module.name} 配置无效。`, undefined, { cause: error });
        }
    }
    update(name: string, config: Record<string, unknown>) {
        this.overrides[name] = { ...(this.overrides[name] ?? {}), config: clone(config) };
    }
    snapshot(name: string): BusinessModuleConfig | undefined {
        const value = this.overrides[name];
        return value === undefined ? undefined : clone(value);
    }
    restore(name: string, value: BusinessModuleConfig | undefined) {
        if (value === undefined)
            delete this.overrides[name];
        else
            this.overrides[name] = clone(value);
    }
    setEnabled(name: string, enabled: boolean) {
        this.overrides[name] = { ...(this.overrides[name] ?? {}), enabled };
    }
}
