import { assertFaithCoreContract, type FaithCoreServiceContract, type FaithLifecycleScope } from "cocofaith-sdk/core";
import { isGameplayDefinition, type GameplayDefinition } from "cocofaith-sdk/gameplay";
import { Context, Service } from "koishi";
import { BusinessError, businessFailure } from "./errors";
import { adaptGameplayDefinition } from "./gameplay-adapter";
import { BusinessModuleManager } from "./manager";
import { assertBusinessResult, normalizeBusinessEvent } from "./protocol";
import type { BusinessDispatchResult, BusinessEvent, Config, FaithBusinessModule, LegacyModuleResult } from "./types";
export class FaithBusinessService extends Service {
    readonly lifecycle: FaithLifecycleScope;
    readonly manager: BusinessModuleManager;
    readonly interfaces;
    private readonly businessLogger;
    private readonly core;
    constructor(ctx: Context & {
        faithCore: FaithCoreServiceContract;
    }, config: Config) {
        super(ctx, "faithBusiness", true);
        assertFaithCoreContract(ctx.faithCore);
        this.businessLogger = ctx.logger("cocofaith-business");
        this.core = ctx.faithCore;
        this.manager = new BusinessModuleManager(config, ctx.faithCore, (message, error) => this.businessLogger.error(message, error));
        this.interfaces = this.manager.interfaces;
        this.lifecycle = ctx.faithCore.lifecycle.scope("faith-business");
        this.lifecycle.onReady(() => this.start(), {
            name: "faith-business.start", priority: -5000, critical: true,
        });
        this.lifecycle.onReload(async () => {
            await this.reload();
        }, {
            name: "faith-business.reload",
        });
        this.lifecycle.onDispose(() => this.shutdown(), {
            name: "faith-business.stop", priority: 9000,
        });
        this.lifecycle.defer(() => this.manager.clear());
        ctx.on("dispose", async () => {
            try {
                await this.shutdown();
            }
            finally {
                await this.lifecycle.dispose();
            }
        });
    }
    register<M extends FaithBusinessModule<any, any, any> | GameplayDefinition<any, any>>(module: M): ReturnType<FaithLifecycleScope["defer"]> {
        const normalized = isGameplayDefinition(module)
            ? adaptGameplayDefinition(module)
            : module;
        this.manager.register(normalized as FaithBusinessModule);
        return this.lifecycle.defer(() => this.unregister(normalized.name, true));
    }
    async start() {
        const startedAt = Date.now();
        const started = await this.manage(async () => {
            if (this.manager.started)
                return false;
            await this.manager.start();
            return true;
        });
        if (!started)
            return;
        const modules = [...this.manager.registry.enabled];
        this.businessLogger.info(`Business 已就绪（${modules.length} 个模块，${Date.now() - startedAt}ms）：${modules.join(" → ")}`);
    }
    enable(name: string) {
        return this.manage(() => this.manager.enable(name));
    }
    disable(name: string, options: {
        cascade?: boolean;
    } = {}) {
        return this.manage(() => this.manager.disable(name, options.cascade));
    }
    reload(name?: string, config?: Record<string, unknown>) {
        return this.manage(() => this.manager.reload(name, config));
    }
    async execute<I, O>(name: string, uid: number, input: I): Promise<LegacyModuleResult<O>> {
        const runtime = this.manager.registry.runtimes.get(name);
        if (!runtime)
            return businessFailure(new BusinessError("NOT_FOUND", `业务不存在：${name}`));
        if (!this.manager.registry.enabled.has(name)) {
            return businessFailure(new BusinessError("MODULE_DISABLED", `业务未启用：${name}`));
        }
        try {
            return await this.core.locks.run(`business:${name}:uid:${uid}`, () => runtime.execute<I, O>(uid, input));
        }
        catch (error) {
            if (!(error instanceof BusinessError) || error.code === "INTERNAL_ERROR" || error.code === "LIFECYCLE_FAILED")
                this.businessLogger.error(`业务执行失败：${name}`, error);
            return businessFailure(error);
        }
    }
    async dispatch(event: BusinessEvent): Promise<BusinessDispatchResult> {
        const startedAt = Date.now();
        let normalized: Readonly<BusinessEvent>;
        try {
            normalized = normalizeBusinessEvent(this.core, event);
        }
        catch (error) {
            return dispatchFailure("unknown", "unknown", error);
        }
        if (!normalized.content.trim())
            return { matched: false, reason: "empty" };
        let match;
        try {
            match = this.manager.commands.resolve(normalized);
        }
        catch (error) {
            return dispatchFailure("unknown", "unknown", error);
        }
        if (!match)
            return { matched: false, reason: "not-found" };
        const { business, commandId } = match;
        if (normalized.uid === null && !match.command.allowUnregistered) {
            const message = normalized.adapter?.allowRegistration
                ? "你尚未注册，只能使用“信仰 注册 [信仰名]”。"
                : normalized.identity?.adapter === "onebot"
                    ? "当前 OneBot QQ 尚未绑定 UID，请私聊发送“椰子水 申请绑定”。"
                    : "当前接入端未开放新 UID 注册。";
            return dispatchFailure(business, commandId, new BusinessError("UNREGISTERED", message));
        }
        if (!this.manager.registry.enabled.has(business)) {
            return dispatchFailure(business, commandId, new BusinessError("MODULE_DISABLED", `业务未启用：${business}`));
        }
        const runtime = this.manager.registry.runtimes.get(business);
        if (!runtime)
            return dispatchFailure(business, commandId, new BusinessError("NOT_FOUND", `业务不存在：${business}`));
        try {
            const result = await this.core.locks.run(normalized.uid === null ? unregisteredLockKey(business, normalized) : `business:${business}:uid:${normalized.uid}`, () => runtime.executeCommand(normalized.uid, normalized, Object.freeze([...match.args]), Object.freeze([...match.path]), match.command.execute!));
            assertBusinessResult(result);
            this.businessLogger.debug(`命令完成 ${business}/${commandId} uid=${normalized.uid ?? "unregistered"} scene=${normalized.scene} duration=${Date.now() - startedAt}ms`);
            return {
                matched: true, business, command: commandId, result
            };
        }
        catch (error) {
            if (!(error instanceof BusinessError) || error.code === "INTERNAL_ERROR" || error.code === "LIFECYCLE_FAILED")
                this.businessLogger.error(`命令执行失败 ${business}/${commandId} uid=${normalized.uid ?? "unregistered"} duration=${Date.now() - startedAt}ms`, error);
            else
                this.businessLogger.debug(`命令拒绝 ${business}/${commandId} code=${error.code} duration=${Date.now() - startedAt}ms`);
            return dispatchFailure(business, commandId, error);
        }
    }
    commands() {
        return this.manager.commands.list();
    }
    acceptsCommand(content: string) {
        return this.manager.commands.acceptsCommand(content);
    }
    status(name?: string) {
        const registry = this.manager.registry;
        if (name)
            return registry.runtimes.get(name)?.status(registry.enabled.has(name));
        return [...registry.runtimes].map(([key, runtime]) => runtime.status(registry.enabled.has(key)));
    }
    list() {
        return [...this.manager.registry.modules.keys()];
    }
    has(name: string) {
        return this.manager.registry.modules.has(name);
    }
    shutdown() {
        return this.manage(() => this.manager.shutdown());
    }
    private unregister(name: string, force = false) {
        return this.manage(() => this.manager.unregister(name, force));
    }
    private manage<T>(task: () => Promise<T>) {
        return this.core.locks.run("business:module-management", task);
    }
}
function unregisteredLockKey(business: string, event: Readonly<BusinessEvent>) {
    const value = event.identity!;
    return `business:${business}:identity:${value.adapter}:${value.type}:${value.scope}:${value.scopeValue ?? ""}:${value.value}`;
}
function dispatchFailure(business: string, command: string, error: unknown): BusinessDispatchResult {
    const failure = businessFailure(error);
    return {
        matched: true, business, command, error: {
            code: failure.code, message: failure.message, details: failure.details
        }
    };
}
