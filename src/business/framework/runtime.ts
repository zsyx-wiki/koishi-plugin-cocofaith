import type { FaithBusinessCoreScope, FaithDisposable } from "cocofaith-sdk/core";
import { assertFaithBusinessCoreScope } from "cocofaith-sdk/core";
import { BusinessContributionRegistry } from "./contributions";
import { BusinessError } from "./errors";
import { BusinessInterfaceRegistry } from "./interfaces";
import { BusinessConfigStore } from "./module-config";
import type { BusinessCommandContext, BusinessEvent, BusinessExecutionContext, BusinessModuleContext, BusinessModuleState, BusinessResult, FaithBusinessModule, LegacyModuleResult } from "./types";
export class BusinessModuleRuntime {
    state: BusinessModuleState = "registered";
    error?: Error;
    private config: Readonly<unknown> = Object.freeze({});
    private core?: FaithBusinessCoreScope;
    private contextCache?: BusinessModuleContext;
    private resources: FaithDisposable[] = [];
    private dependencies: ReadonlySet<string>;
    private activeExecutions = 0;
    private drainWaiters = new Set<() => void>();
    constructor(readonly module: FaithBusinessModule, private configs: BusinessConfigStore, private interfaces: BusinessInterfaceRegistry, private contributions: BusinessContributionRegistry, private createCoreScope: () => FaithBusinessCoreScope) {
        this.dependencies = new Set(module.dependencies ?? []);
    }
    async start() {
        if (this.state === "ready")
            return;
        if (!["registered", "disabled", "disposed", "failed"].includes(this.state)) {
            throw new BusinessError("CONFLICT", `业务 ${this.module.name} 当前不能启动：${this.state}`);
        }
        this.error = undefined;
        this.config = this.configs.resolve(this.module);
        this.core = this.createCoreScope();
        this.contextCache = this.createContext();
        try {
            this.state = "initializing";
            assertFaithBusinessCoreScope(this.core);
            await this.module.init?.(this.contextCache);
            this.state = "initialized";
            this.state = "readying";
            await this.module.ready?.(this.contextCache);
            this.state = "ready";
        }
        catch (error) {
            this.state = "failed";
            this.error = error instanceof Error ? error : new Error(String(error));
            const cleanupErrors = await this.releaseResources();
            const cause = cleanupErrors.length ? new AggregateError([error, ...cleanupErrors], `业务 ${this.module.name} 启动及清理均失败`) : error;
            throw new BusinessError("LIFECYCLE_FAILED", `业务 ${this.module.name} 启动失败。`, undefined, { cause });
        }
    }
    async reload() {
        this.assertReady();
        const previousConfig = this.config;
        const previousContext = this.contextCache;
        const nextConfig = this.configs.resolve(this.module);
        this.state = "reloading";
        await this.drain();
        this.config = nextConfig;
        this.contextCache = this.createContext();
        try {
            await this.module.reload?.(this.contextCache, previousConfig);
            this.state = "ready";
        }
        catch (error) {
            this.config = previousConfig;
            this.contextCache = previousContext;
            this.state = error instanceof BusinessError && error.details?.rollbackFailed ? "failed" : "ready";
            this.error = error instanceof Error ? error : new Error(String(error));
            throw new BusinessError("LIFECYCLE_FAILED", `业务 ${this.module.name} reload 失败。`, undefined, { cause: error });
        }
    }
    async execute<I, O>(uid: number, input: I): Promise<LegacyModuleResult<O>> {
        if (!this.module.execute)
            throw new BusinessError("NOT_ALLOWED", `业务 ${this.module.name} 不提供内部 execute 接口。`);
        return this.withExecution(uid, (context) => this.module.execute!(context, input) as Promise<LegacyModuleResult<O>>);
    }
    async executeCommand(uid: number | null, event: Readonly<BusinessEvent>, args: readonly string[], path: readonly string[], execute: (context: BusinessCommandContext) => Promise<BusinessResult> | BusinessResult) {
        return this.withExecution(uid, async (base) => {
            const context = Object.create(base) as BusinessCommandContext;
            Object.defineProperties(context, {
                event: { value: event, enumerable: true }, args: { value: args, enumerable: true }, path: { value: path, enumerable: true },
            });
            return execute(Object.freeze(context));
        });
    }
    private async withExecution<T>(uid: number | null, task: (context: BusinessExecutionContext) => Promise<T>): Promise<T> {
        this.assertReady();
        this.activeExecutions++;
        try {
            const context = Object.create(this.contextCache!) as BusinessExecutionContext;
            Object.defineProperty(context, "uid", { value: uid, enumerable: true });
            return await task(Object.freeze(context));
        }
        finally {
            this.activeExecutions--;
            if (!this.activeExecutions) {
                for (const resolve of this.drainWaiters)
                    resolve();
                this.drainWaiters.clear();
            }
        }
    }
    async stop(finalState: "disabled" | "disposed" = "disabled") {
        if (["disabled", "disposed", "registered"].includes(this.state)) {
            this.state = finalState;
            const cleanupErrors = await this.releaseResources();
            if (cleanupErrors.length)
                throw new BusinessError("LIFECYCLE_FAILED", `业务 ${this.module.name} 清理失败。`, undefined, { cause: new AggregateError(cleanupErrors) });
            return;
        }
        this.state = "disposing";
        await this.drain();
        let failure: unknown;
        try {
            if (this.contextCache)
                await this.module.dispose?.(this.contextCache);
        }
        catch (error) {
            failure = error;
        }
        const cleanupErrors = await this.releaseResources();
        this.state = finalState;
        if (failure || cleanupErrors.length) {
            const errors = [...(failure ? [failure] : []), ...cleanupErrors];
            throw new BusinessError("LIFECYCLE_FAILED", `业务 ${this.module.name} 卸载失败。`, undefined, { cause: errors.length === 1 ? errors[0] : new AggregateError(errors) });
        }
    }
    status(enabled: boolean) {
        return {
            name: this.module.name, state: this.state, enabled, dependencies: [...this.dependencies], error: this.error?.message
        };
    }
    private createContext(): BusinessModuleContext {
        if (!this.core)
            throw new BusinessError("MODULE_NOT_READY", `业务 ${this.module.name} Core Scope 不存在。`);
        return Object.freeze({
            name: this.module.name,
            core: this.core,
            config: this.config as Readonly<Record<string, unknown>>,
            provide: <T>(name: string, value: T, options?: {
                version?: string;
            }) => {
                const resource = this.interfaces.provide(this.module.name, name, value, options?.version);
                this.resources = this.resources.filter(entry => !entry.disposed);
                this.resources.push(resource);
                return resource;
            },
            use: <T>(business: string, name = "default") => this.interfaces.use<T>(this.module.name, business, name, this.dependencies),
            contribute: <I, O>(slot: string, handler: import("./contributions").BusinessContributionHandler<I, O>, options: import("./contributions").BusinessContributionOptions) => {
                const resource = this.contributions.register(this.module.name, slot, handler, options);
                this.resources = this.resources.filter(entry => !entry.disposed);
                this.resources.push(resource);
                return resource;
            },
            collect: <I, O>(slot: string, input: Readonly<I>) => this.contributions.collect<I, O>(slot, input),
        });
    }
    private assertReady() {
        if (this.state !== "ready" || !this.contextCache) {
            throw new BusinessError("MODULE_NOT_READY", `业务 ${this.module.name} 尚未就绪。`);
        }
    }
    private drain() {
        if (!this.activeExecutions)
            return Promise.resolve();
        return new Promise<void>((resolve) => this.drainWaiters.add(resolve));
    }
    private async releaseResources() {
        const errors: unknown[] = [];
        for (const resource of this.resources.splice(0).reverse()) {
            try {
                await resource.dispose();
            }
            catch (error) {
                errors.push(error);
            }
        }
        this.interfaces.removeProvider(this.module.name);
        try {
            await this.core?.lifecycle?.dispose?.();
        }
        catch (error) {
            errors.push(error);
        }
        this.core = undefined;
        this.contextCache = undefined;
        return errors;
    }
}
