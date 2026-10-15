import { CallbackDisposable } from "cocofaith-sdk/core";
import { BusinessError } from "./errors";
export type BusinessContributionHandler<I, O> = (input: Readonly<I>) => O | readonly O[] | null | undefined | Promise<O | readonly O[] | null | undefined>;
export interface BusinessContributionOptions {
    id: string;
    priority?: number;
}
export interface BusinessContributionFailure {
    provider: string;
    id: string;
    error: unknown;
}
export interface BusinessContributionResult<O> {
    results: readonly O[];
    failures: readonly BusinessContributionFailure[];
}
interface Entry {
    provider: string;
    id: string;
    priority: number;
    order: number;
    handler: BusinessContributionHandler<unknown, unknown>;
}
export class BusinessContributionRegistry {
    private slots = new Map<string, Map<string, Entry>>();
    private ordered = new Map<string, readonly Entry[]>();
    private order = 0;
    constructor(private logError: (message: string, error: unknown) => void) {
    }
    register<I, O>(provider: string, slot: string, handler: BusinessContributionHandler<I, O>, options: BusinessContributionOptions) {
        validateName(slot, "扩展槽");
        validateName(options.id, "扩展 ID");
        if (typeof handler !== "function")
            throw new TypeError("扩展处理器必须是函数");
        if (!Number.isFinite(options.priority ?? 0))
            throw new BusinessError("INVALID_INPUT", "扩展优先级必须是有限数字");
        const entries = this.slots.get(slot) ?? new Map<string, Entry>(), key = `${provider}:${options.id}`;
        if (entries.has(key))
            throw new BusinessError("INTERFACE_EXISTS", `扩展已注册：${slot}/${key}`);
        if (entries.size >= 256)
            throw new BusinessError("CONFLICT", `扩展槽已达到数量上限：${slot}`);
        entries.set(key, {
            provider, id: options.id, priority: options.priority ?? 0, order: this.order++, handler: handler as BusinessContributionHandler<unknown, unknown>
        });
        this.slots.set(slot, entries);
        this.ordered.delete(slot);
        return new CallbackDisposable(() => {
            entries.delete(key);
            this.ordered.delete(slot);
            if (!entries.size)
                this.slots.delete(slot);
        });
    }
    async collect<I, O>(slot: string, input: Readonly<I>): Promise<BusinessContributionResult<O>> {
        validateName(slot, "扩展槽");
        let entries = this.ordered.get(slot);
        if (!entries) {
            entries = Object.freeze([...(this.slots.get(slot)?.values() ?? [])].sort((a, b) => a.priority - b.priority || a.order - b.order));
            this.ordered.set(slot, entries);
        }
        const settled = await Promise.all(entries.map(async (entry) => {
            try {
                const value = await entry.handler(input);
                return { values: value === null || value === undefined ? [] : Array.isArray(value) ? value as O[] : [value as O] };
            }
            catch (error) {
                this.logError(`业务扩展执行失败：${slot}/${entry.provider}:${entry.id}`, error);
                return { values: [] as O[], failure: Object.freeze({
                        provider: entry.provider, id: entry.id, error
                    }) };
            }
        }));
        const results = settled.flatMap((item) => item.values);
        const failures = settled.flatMap((item) => item.failure ? [item.failure] : []);
        return Object.freeze({ results: Object.freeze(results), failures: Object.freeze(failures) });
    }
    clear() {
        this.slots.clear();
        this.ordered.clear();
    }
}
function validateName(value: string, label: string) {
    if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(value))
        throw new BusinessError("INVALID_INPUT", `${label}名称无效：${value}`);
}
