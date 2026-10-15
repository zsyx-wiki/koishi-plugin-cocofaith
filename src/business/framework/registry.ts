import { BusinessError } from "./errors";
import { assertNoCycles, BusinessDependencyGraph, normalizeDependencies } from "./graph";
import type { BusinessModuleRuntime } from "./runtime";
import type { FaithBusinessModule } from "./types";
export class BusinessModuleRegistry {
    readonly modules = new Map<string, FaithBusinessModule>();
    readonly runtimes = new Map<string, BusinessModuleRuntime>();
    readonly enabled = new Set<string>();
    readonly graph = new BusinessDependencyGraph(this.modules, this.enabled);
    add(module: FaithBusinessModule, runtime: BusinessModuleRuntime, enabled: boolean) {
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(module.name))
            throw new BusinessError("INVALID_INPUT", `非法业务名称：${module.name}`);
        if (this.modules.has(module.name))
            throw new BusinessError("MODULE_EXISTS", `业务已注册：${module.name}`);
        normalizeDependencies(module);
        this.modules.set(module.name, module);
        this.runtimes.set(module.name, runtime);
        if (enabled)
            this.enabled.add(module.name);
        try {
            assertNoCycles(this.modules);
        }
        catch (error) {
            this.remove(module.name);
            throw error;
        }
        this.graph.invalidate();
    }
    remove(name: string) {
        this.enabled.delete(name);
        this.runtimes.delete(name);
        this.modules.delete(name);
        this.graph.invalidate();
    }
    setEnabled(name: string, enabled: boolean) {
        if (enabled)
            this.enabled.add(name);
        else
            this.enabled.delete(name);
        this.graph.invalidate();
    }
    requireModule(name: string) {
        const module = this.modules.get(name);
        if (!module)
            throw new BusinessError("NOT_FOUND", `业务不存在：${name}`);
        return module;
    }
    requireRuntime(name: string) {
        this.requireModule(name);
        return this.runtimes.get(name)!;
    }
    clear() {
        this.enabled.clear();
        this.runtimes.clear();
        this.modules.clear();
        this.graph.invalidate();
    }
}
