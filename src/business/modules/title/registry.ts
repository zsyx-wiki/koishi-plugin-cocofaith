import { BusinessError } from "../../framework/errors";
import type { TitleDefinition } from "./types";
export class TitleRegistry {
    private definitions = new Map<string, Readonly<TitleDefinition>>();
    private idsByName = new Map<string, string>();
    register(input: TitleDefinition, options: {
        replace?: boolean;
    } = {}) {
        const value = normalize(input), byId = this.definitions.get(value.id), nameId = this.idsByName.get(value.name);
        if (!options.replace && (byId || nameId))
            throw new BusinessError("CONFLICT", `称号已注册：${value.name}`);
        if (nameId && nameId !== value.id)
            throw new BusinessError("CONFLICT", `称号名称已被使用：${value.name}`);
        if (byId && byId.name !== value.name)
            this.idsByName.delete(byId.name);
        this.definitions.set(value.id, value);
        this.idsByName.set(value.name, value.id);
        return value;
    }
    registerMany(values: readonly TitleDefinition[], options: {
        replace?: boolean;
    } = {}) {
        return values.map((value) => this.register(value, options));
    }
    get(id: string) {
        return this.definitions.get(id);
    }
    getByName(name: string) {
        const id = this.idsByName.get(name.trim());
        return id ? this.get(id) : undefined;
    }
    resolve(value: string) {
        return this.get(value.trim()) ?? this.getByName(value);
    }
    all() {
        return Object.freeze([...this.definitions.values()]);
    }
    remove(value: string) {
        const title = this.resolve(value);
        if (!title)
            return false;
        this.definitions.delete(title.id);
        this.idsByName.delete(title.name);
        return true;
    }
}
function normalize(input: TitleDefinition): Readonly<TitleDefinition> {
    if (!input || !/^[a-z][a-z0-9-]{0,63}$/.test(input.id) || !input.name?.trim() || input.name.length > 64)
        throw new BusinessError("INVALID_INPUT", "称号 ID 或名称无效。");
    if (!input.description?.trim() || input.description.length > 1000 || !input.source?.trim() || input.source.length > 500)
        throw new BusinessError("INVALID_INPUT", `称号【${input.name}】描述或来源无效。`);
    const bonuses = (input.bonuses ?? []).map((bonus) => {
        if (!/^[a-z][a-z0-9_.:/-]{0,63}$/.test(bonus.type) || !Number.isFinite(bonus.modifier ?? 0) || !Number.isFinite(bonus.fixedBonus ?? 0) || Math.abs(bonus.modifier ?? 0) > 100 || Math.abs(bonus.fixedBonus ?? 0) > 1e12)
            throw new BusinessError("INVALID_INPUT", `称号【${input.name}】加成无效。`);
        return Object.freeze({ ...bonus, activeWhen: bonus.activeWhen ?? "owned" });
    });
    return Object.freeze({
        ...input, name: input.name.trim(), description: input.description.trim(), source: input.source.trim(), hidden: input.hidden ?? true, custom: input.custom ?? true, bonuses: Object.freeze(bonuses)
    });
}
