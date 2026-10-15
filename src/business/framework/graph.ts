import { BusinessError } from "./errors";
import type { FaithBusinessModule } from "./types";
export function normalizeDependencies(module: FaithBusinessModule) {
    const dependencies = [...new Set(module.dependencies ?? [])];
    if (dependencies.includes(module.name))
        throw new BusinessError("DEPENDENCY_CYCLE", `业务 ${module.name} 不能依赖自身。`);
    return dependencies;
}
export function assertNoCycles(modules: ReadonlyMap<string, FaithBusinessModule>) {
    const visiting: string[] = [], visited = new Set<string>();
    const visit = (name: string) => {
        if (visited.has(name))
            return;
        const cycleAt = visiting.indexOf(name);
        if (cycleAt >= 0) {
            const cycle = [...visiting.slice(cycleAt), name];
            throw new BusinessError("DEPENDENCY_CYCLE", `检测到循环依赖：${cycle.join(" -> ")}`, { cycle });
        }
        visiting.push(name);
        const module = modules.get(name)!;
        for (const dependency of normalizeDependencies(module))
            if (modules.has(dependency))
                visit(dependency);
        visiting.pop();
        visited.add(name);
    };
    for (const name of modules.keys())
        visit(name);
}
export function topologicalOrder(modules: ReadonlyMap<string, FaithBusinessModule>, enabled: ReadonlySet<string>) {
    const order: string[] = [], visiting: string[] = [], visited = new Set<string>();
    const visit = (name: string) => {
        if (visited.has(name))
            return;
        const cycleAt = visiting.indexOf(name);
        if (cycleAt >= 0) {
            const cycle = [...visiting.slice(cycleAt), name];
            throw new BusinessError("DEPENDENCY_CYCLE", `检测到循环依赖：${cycle.join(" -> ")}`, { cycle });
        }
        const module = modules.get(name);
        if (!module)
            throw new BusinessError("DEPENDENCY_MISSING", `业务依赖不存在：${name}`);
        visiting.push(name);
        for (const dependency of normalizeDependencies(module)) {
            if (!modules.has(dependency))
                throw new BusinessError("DEPENDENCY_MISSING", `${name} 依赖未注册业务 ${dependency}`);
            if (!enabled.has(dependency))
                throw new BusinessError("DEPENDENCY_DISABLED", `${name} 依赖未启用业务 ${dependency}`);
            visit(dependency);
        }
        visiting.pop();
        visited.add(name);
        order.push(name);
    };
    for (const name of enabled)
        visit(name);
    return order;
}
export function enabledDependents(target: string, modules: ReadonlyMap<string, FaithBusinessModule>, enabled: ReadonlySet<string>) {
    return [...enabled].filter((name) => name !== target && normalizeDependencies(modules.get(name)!).includes(target));
}
export class BusinessDependencyGraph {
    private revision = 0;
    private cachedRevision = -1;
    private cachedOrder: string[] = [];
    private reverse = new Map<string, Set<string>>();
    constructor(private modules: ReadonlyMap<string, FaithBusinessModule>, private enabled: ReadonlySet<string>) {
    }
    invalidate() {
        this.revision++;
    }
    validate() {
        assertNoCycles(this.modules);
        this.order();
    }
    order() {
        if (this.cachedRevision === this.revision)
            return this.cachedOrder;
        this.cachedOrder = topologicalOrder(this.modules, this.enabled);
        this.reverse.clear();
        for (const [name, module] of this.modules) {
            for (const dependency of normalizeDependencies(module)) {
                const dependents = this.reverse.get(dependency) ?? new Set();
                dependents.add(name);
                this.reverse.set(dependency, dependents);
            }
        }
        this.cachedRevision = this.revision;
        return this.cachedOrder;
    }
    dependents(name: string) {
        this.order();
        return [...(this.reverse.get(name) ?? [])].filter((item) => this.enabled.has(item));
    }
}
