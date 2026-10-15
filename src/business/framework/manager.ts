import type { FaithCoreService } from "cocofaith-sdk/core";
import { BusinessContributionRegistry } from "./contributions";
import { BusinessError } from "./errors";
import { normalizeDependencies } from "./graph";
import { BusinessInterfaceRegistry } from "./interfaces";
import { BusinessConfigStore } from "./module-config";
import { BusinessModuleRegistry } from "./registry";
import { BusinessCommandRouter } from "./router";
import { BusinessModuleRuntime } from "./runtime";
import type { Config, FaithBusinessModule } from "./types";
export class BusinessModuleManager {
    readonly registry = new BusinessModuleRegistry();
    readonly interfaces = new BusinessInterfaceRegistry();
    readonly commands = new BusinessCommandRouter();
    readonly contributions: BusinessContributionRegistry;
    readonly configs: BusinessConfigStore;
    started = false;
    constructor(config: Config, private core: FaithCoreService, private logError: (message: string, error: unknown) => void) {
        this.configs = new BusinessConfigStore(config);
        this.contributions = new BusinessContributionRegistry(logError);
    }
    register(module: FaithBusinessModule) {
        if (this.started)
            throw new BusinessError("CONFLICT", "Core ready 后不能再注册新的业务模块。");
        if (this.registry.modules.has(module.name))
            throw new BusinessError("MODULE_EXISTS", `业务已注册：${module.name}`);
        const runtime: BusinessModuleRuntime = new BusinessModuleRuntime(module, this.configs, this.interfaces, this.contributions, () => this.core.createBusinessScope(module.name, {
            canRegisterTable: () => runtime.state === "initializing" || runtime.state === "readying",
        }));
        this.commands.register(module.name, module.commands ?? []);
        try {
            this.registry.add(module, runtime, this.configs.isEnabled(module.name));
        }
        catch (error) {
            this.commands.unregister(module.name);
            throw error;
        }
        if (!this.registry.enabled.has(module.name))
            runtime.state = "disabled";
    }
    async start() {
        if (this.started)
            return;
        this.registry.graph.validate();
        const started: string[] = [];
        try {
            for (const name of this.registry.graph.order()) {
                await this.registry.requireRuntime(name).start();
                started.push(name);
            }
            this.started = true;
        }
        catch (error) {
            for (const name of started.reverse())
                await this.safeStop(name, "disabled");
            throw error;
        }
    }
    async enable(name: string) {
        this.registry.requireModule(name);
        this.registry.graph.validate();
        const added: string[] = [], addedSet = new Set<string>(), visiting = new Set<string>();
        const add = (current: string) => {
            if (visiting.has(current))
                throw new BusinessError("DEPENDENCY_CYCLE", `启用 ${name} 时检测到循环依赖。`);
            if (this.registry.enabled.has(current) || addedSet.has(current))
                return;
            visiting.add(current);
            const module = this.registry.requireModule(current);
            for (const dependency of normalizeDependencies(module))
                add(dependency);
            visiting.delete(current);
            this.registry.setEnabled(current, true);
            this.configs.setEnabled(current, true);
            added.push(current);
            addedSet.add(current);
        };
        add(name);
        if (!this.started)
            return added;
        try {
            for (const current of this.registry.graph.order()) {
                if (addedSet.has(current))
                    await this.registry.requireRuntime(current).start();
            }
            return added;
        }
        catch (error) {
            for (const current of added.reverse()) {
                this.registry.setEnabled(current, false);
                this.configs.setEnabled(current, false);
                await this.safeStop(current, "disabled");
            }
            throw error;
        }
    }
    async disable(name: string, cascade = false) {
        this.registry.requireModule(name);
        if (!this.registry.enabled.has(name))
            return [];
        const targets = new Set([name]), queue = [name];
        for (let index = 0; index < queue.length; index++) {
            const current = queue[index];
            const dependents = this.registry.graph.dependents(current).filter((item) => !targets.has(item));
            if (dependents.length && !cascade) {
                throw new BusinessError("DEPENDENCY_IN_USE", `${current} 仍被以下业务依赖：${dependents.join(", ")}`, { dependents });
            }
            for (const dependent of dependents) {
                targets.add(dependent);
                queue.push(dependent);
            }
        }
        const order = [...this.registry.graph.order()].reverse().filter((item) => targets.has(item));
        for (const current of order) {
            if (this.started)
                await this.registry.requireRuntime(current).stop("disabled");
            this.registry.setEnabled(current, false);
            this.configs.setEnabled(current, false);
        }
        return order;
    }
    async reload(name?: string, config?: Record<string, unknown>) {
        if (name) {
            this.registry.requireModule(name);
            if (!this.registry.enabled.has(name))
                throw new BusinessError("MODULE_DISABLED", `业务未启用：${name}`);
            const previous = config ? this.configs.snapshot(name) : undefined;
            if (config)
                this.configs.update(name, config);
            try {
                await this.registry.requireRuntime(name).reload();
            }
            catch (error) {
                if (config)
                    this.configs.restore(name, previous);
                throw error;
            }
            return [name];
        }
        const order = this.registry.graph.order();
        for (const current of order)
            await this.registry.requireRuntime(current).reload();
        return [...order];
    }
    async shutdown() {
        if (!this.started)
            return;
        for (const name of [...this.registry.graph.order()].reverse())
            await this.safeStop(name, "disposed");
        this.started = false;
    }
    async unregister(name: string, force = false) {
        if (!this.registry.modules.has(name))
            return;
        if (this.registry.enabled.has(name) && !force)
            await this.disable(name);
        if (force)
            await this.safeStop(name, "disposed");
        this.interfaces.removeProvider(name);
        this.commands.unregister(name);
        this.registry.remove(name);
    }
    clear() {
        for (const name of this.registry.modules.keys())
            this.commands.unregister(name);
        this.interfaces.clear();
        this.contributions.clear();
        this.registry.clear();
    }
    private async safeStop(name: string, state: "disabled" | "disposed") {
        try {
            await this.registry.runtimes.get(name)?.stop(state);
        }
        catch (error) {
            this.logError(`业务卸载失败：${name}`, error);
        }
    }
}
