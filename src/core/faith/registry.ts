import { FaithCoreError } from "../errors";
import type { FaithDefinition } from "../types";
export class FaithRegistryServiceBase {
    protected registry = new Map<string, Readonly<FaithDefinition>>();
    private prayerOwners = new Map<string, string>();
    private pathMembers = new Map<string, Set<string>>();
    register(definition: FaithDefinition, options: {
        override?: boolean;
    } = {}) {
        const item = validateFaith(definition);
        const previous = this.registry.get(item.name);
        if (!options.override && previous)
            throw new Error(`信仰已注册：${item.name}`);
        if (item.prayer_word) {
            const owner = this.prayerOwners.get(item.prayer_word);
            if (owner && owner !== item.name)
                throw new Error(`祷词已由信仰 ${owner} 使用`);
        }
        if (previous?.prayer_word && previous.prayer_word !== item.prayer_word)
            this.prayerOwners.delete(previous.prayer_word);
        if (previous && previous.path !== item.path)
            this.removePathMember(previous.path, previous.name);
        this.registry.set(item.name, item);
        if (item.prayer_word)
            this.prayerOwners.set(item.prayer_word, item.name);
        let members = this.pathMembers.get(item.path);
        if (!members)
            this.pathMembers.set(item.path, members = new Set());
        members.add(item.name);
        return item;
    }
    registerMany(definitions: readonly FaithDefinition[]) {
        const registry = new Map(this.registry), prayerOwners = new Map(this.prayerOwners);
        const pathMembers = new Map([...this.pathMembers].map(([path, members]) => [path, new Set(members)]));
        try {
            return definitions.map((item) => this.register(item));
        }
        catch (error) {
            this.registry = registry;
            this.prayerOwners = prayerOwners;
            this.pathMembers = pathMembers;
            throw error;
        }
    }
    unregister(name: string) {
        const key = name.trim(), current = this.registry.get(key);
        if (!current)
            return false;
        if (current.prayer_word)
            this.prayerOwners.delete(current.prayer_word);
        this.removePathMember(current.path, current.name);
        return this.registry.delete(key);
    }
    get(name: string) {
        return this.registry.get(name.trim());
    }
    require(name: string) {
        const item = this.get(name);
        if (!item)
            throw new Error(`信仰不存在：${name}`);
        return item;
    }
    has(name: string) {
        return !!this.get(name);
    }
    all() {
        return [...this.registry.values()];
    }
    paths() {
        return Object.freeze([...this.pathMembers.keys()]);
    }
    byPath(path: string) {
        const result: Readonly<FaithDefinition>[] = [];
        for (const name of this.pathMembers.get(path.trim()) ?? []) {
            const faith = this.registry.get(name);
            if (faith)
                result.push(faith);
        }
        return result;
    }
    resolvePrayerWord(word: string) {
        const name = this.prayerOwners.get(word.trim());
        return name ? this.registry.get(name) : undefined;
    }
    clear() {
        this.registry.clear();
        this.prayerOwners.clear();
        this.pathMembers.clear();
    }
    private removePathMember(path: string, name: string) {
        const members = this.pathMembers.get(path);
        if (!members)
            return;
        members.delete(name);
        if (!members.size)
            this.pathMembers.delete(path);
    }
}
function validateFaith(value: FaithDefinition): Readonly<FaithDefinition> {
    if (!value || typeof value !== "object")
        throw new TypeError("信仰定义必须是对象");
    for (const key of ["name", "path"] as const)
        if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 64)
            throw new Error(`信仰字段无效：${key}`);
    if (value.type !== "fixed" && value.type !== "dynamic")
        throw new Error("信仰类型无效");
    if (!Number.isSafeInteger(value.believer_count) || value.believer_count < 0)
        throw new Error("信徒数量无效");
    const prayer = normalizePrayerWord(value.prayer_word);
    return Object.freeze({
        ...value, name: value.name.trim(), path: value.path.trim(), prayer_word: prayer || undefined, custom_professions: Object.freeze({ ...(value.custom_professions ?? {}) }), metadata: Object.freeze({ ...(value.metadata ?? {}) })
    });
}
export function normalizePrayerWord(value: string | undefined): string | undefined {
    if (value === undefined || value === "")
        return undefined;
    if (typeof value !== "string" || value.length !== 9 || !/^[\u4e00-\u9fff]{4}，[\u4e00-\u9fff]{4}$/.test(value))
        throw new FaithCoreError("VALIDATION_FAILED", "祷词格式必须是四个汉字、一个中文逗号、四个汉字，例如：椰风轻拂，神光降临。");
    return value;
}
