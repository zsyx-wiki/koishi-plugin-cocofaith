import type { FaithDisposable, FaithLifecycleScope } from "cocofaith-sdk/core";
import { GameplayError, type GameplayCommandDefinition, type GameplayDefinition, type GameplaySetupContext, } from "cocofaith-sdk/gameplay";
import { executeGameplayCommand } from "cocofaith-sdk/runtime";
import { BusinessError } from "./errors";
import type { BusinessCommand, BusinessModuleContext, BusinessResult, FaithBusinessModule } from "./types";
/** 按 setup 批次管理服务与注册资源，初始化失败时一并清理。 */
export function adaptGameplayDefinition<C extends Record<string, unknown>, S, D extends Record<string, unknown>, P extends Record<string, unknown>, A extends Record<string, unknown>>(definition: GameplayDefinition<C, S, D, P, A>): FaithBusinessModule {
    // 模块注册表统一存储不同配置类型的玩法。
    return adaptGameplayRuntime(definition as unknown as GameplayDefinition<Record<string, unknown>, unknown>);
}
function adaptGameplayRuntime(definition: GameplayDefinition<Record<string, unknown>, unknown>): FaithBusinessModule {
    let service: unknown;
    let resources: FaithDisposable[] = [];
    let initialized = false;
    const cleanup = async () => {
        const failures: unknown[] = [];
        if (initialized) {
            initialized = false;
            try {
                await definition.dispose?.(service);
            }
            catch (error) {
                failures.push(error);
            }
        }
        service = undefined;
        for (const resource of resources.splice(0).reverse()) {
            try {
                await resource.dispose();
            }
            catch (error) {
                failures.push(error);
            }
        }
        if (failures.length)
            throw new AggregateError(failures, `玩法 ${definition.name} 清理失败`);
    };
    const setup = async (context: BusinessModuleContext) => {
        const track = <T extends FaithDisposable>(resource: T): T => {
            resources.push(resource);
            return resource;
        };
        const lifecycle = new Proxy(context.core.lifecycle, {
            get(target, key) {
                const value = Reflect.get(target, key);
                if (typeof value !== "function")
                    return value;
                if (key === "dispose")
                    return () => {
                        throw new TypeError("setup 不能卸载整个玩法作用域");
                    };
                return (...args: unknown[]) => {
                    const result = value.apply(target, args);
                    return result && typeof result.dispose === "function" ? track(result) : result;
                };
            },
        }) as FaithLifecycleScope;
        const scoped: GameplaySetupContext<Record<string, unknown>> = {
            ...context,
            core: new Proxy(context.core, { get(target, key) {
                    if (key === "lifecycle")
                        return lifecycle;
                    const value = Reflect.get(target, key);
                    return typeof value === "function" ? value.bind(target) : value;
                } }),
            track,
            defer: (callback) => track(context.core.lifecycle.defer(callback)),
            provide: (name, value, options) => track(context.provide(name, value, options)),
            contribute: (slot, handler, options) => track(context.contribute(slot, handler, options)),
        };
        try {
            service = definition.setup ? await definition.setup(scoped) : undefined;
            initialized = true;
        }
        catch (error) {
            try {
                await cleanup();
            }
            catch (cleanupError) {
                throw new AggregateError([error, cleanupError], `玩法 ${definition.name} 初始化及清理失败`);
            }
            throw error;
        }
    };
    return {
        name: definition.name,
        dependencies: definition.dependencies,
        defaultConfig: definition.config?.defaults ?? {},
        validateConfig: definition.config ? value => definition.config!.parse(value) : undefined,
        init: setup,
        async reload(context, previousConfig) {
            try {
                await cleanup();
            }
            catch (cause) {
                throw new BusinessError("LIFECYCLE_FAILED", "玩法资源清理失败", {
                    module: definition.name, phase: "cleanup", rollbackFailed: true
                }, { cause });
            }
            try {
                await setup(context);
            }
            catch (error) {
                try {
                    await setup({ ...context, config: previousConfig });
                }
                catch (rollbackError) {
                    throw new BusinessError("LIFECYCLE_FAILED", `玩法 ${definition.name} 重载和恢复均失败`, { module: definition.name, rollbackFailed: true }, { cause: new AggregateError([error, rollbackError]) });
                }
                throw error;
            }
        },
        dispose: cleanup,
        commands: definition.commands.map(command => adaptCommand(definition, command, () => service)),
    };
}
function adaptCommand(definition: GameplayDefinition<Record<string, unknown>, unknown>, command: GameplayCommandDefinition<Record<string, unknown>, unknown>, service: () => unknown): BusinessCommand {
    return {
        id: command.id,
        commands: command.triggers,
        description: command.description,
        scenes: command.scenes,
        match: command.match,
        children: command.children?.map(child => adaptCommand(definition, child, service)),
        allowUnregistered: command.guest === true,
        execute: command.run ? async (context) => {
            try {
                return await executeGameplayCommand({
                    business: definition.name,
                    command,
                    uid: context.uid,
                    event: context.event,
                    args: context.args,
                    path: context.path,
                    core: context.core,
                    config: context.config,
                    service: service(),
                    stateDefinition: definition.state,
                }) as BusinessResult;
            }
            catch (error) {
                if (error instanceof GameplayError) {
                    throw new BusinessError(error.code, error.message, {
                        ...error.details, module: definition.name, command: command.id
                    }, { cause: error });
                }
                throw error;
            }
        } : undefined,
    };
}
