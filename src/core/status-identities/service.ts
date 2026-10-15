import type { Context } from "koishi";
import type { BonusProviderContext } from "../bonus";
import { FaithCoreError } from "../errors";
import { CallbackDisposable } from "../lifecycle";
import type { CoreDatabase } from "../transaction";
import type { FaithStatusIdentityBonus, FaithStatusIdentityDefinition, FaithStatusIdentityLevel, FaithStatusIdentityRow, FaithStatusIdentityState } from "../types";
import type { FaithUsersService } from "../users";
import { cloneBusinessRecord } from "../validation";
interface DefinitionEntry {
    owner: string;
    value: Readonly<FaithStatusIdentityDefinition>;
    levels: ReadonlyMap<string, Readonly<FaithStatusIdentityLevel>>;
}
export class FaithStatusIdentityService {
    private readonly definitions = new Map<string, DefinitionEntry>();
    private readonly cache = new Map<string, {
        value: Readonly<FaithStatusIdentityState> | null;
        expiresAt: number;
    }>();
    constructor(private readonly ctx: Context, private readonly users: FaithUsersService) {
    }
    register(definition: FaithStatusIdentityDefinition, owner = "external") {
        const entry = normalizeDefinition(definition, owner);
        if (this.definitions.has(entry.value.id))
            throw new FaithCoreError("CONFLICT", `身份状态已注册：${entry.value.id}`);
        this.definitions.set(entry.value.id, entry);
        return new CallbackDisposable(() => {
            if (this.definitions.get(entry.value.id) === entry)
                this.definitions.delete(entry.value.id);
        });
    }
    get(id: string) {
        return this.definitions.get(normalizeId(id))?.value;
    }
    require(id: string) {
        const value = this.get(id);
        if (!value)
            throw new FaithCoreError("NOT_FOUND", `身份状态不存在：${id}`);
        return value;
    }
    all() {
        return Object.freeze([...this.definitions.values()].map((entry) => entry.value));
    }
    level(identity: string, level: string) {
        const entry = this.requireEntry(identity), value = entry.levels.get(normalizeId(level));
        if (!value)
            throw new FaithCoreError("VALIDATION_FAILED", `身份 ${identity} 不存在等级：${level}`);
        return value;
    }
    async state(uid: number, identity: string, database: CoreDatabase = this.ctx.database) {
        assertUid(uid);
        const id = normalizeId(identity);
        this.require(id);
        if (database !== this.ctx.database)
            return this.read(uid, id, database);
        const key = `${uid}:${id}`, cached = this.cache.get(key);
        if (cached && cached.expiresAt > Date.now())
            return cached.value;
        const value = await this.read(uid, id, database);
        if (this.cache.size >= 20000)
            this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { value, expiresAt: Date.now() + 30000 });
        return value;
    }
    async list(uid: number) {
        assertUid(uid);
        await this.users.require(uid);
        const rows = await this.ctx.database.get("faith_core_status_identities", { uid }, { sort: { identity: "asc" } });
        const values = rows.map(freezeState);
        this.rememberUser(uid, values);
        return Object.freeze(values);
    }
    async listByIdentity(identity: string, options: {
        active?: boolean;
        afterUid?: number;
        limit?: number;
    } = {}) {
        const id = normalizeId(identity);
        this.require(id);
        const limit = options.limit ?? 100, after = options.afterUid ?? 0;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(after) || after < 0)
            throw new FaithCoreError("VALIDATION_FAILED", "身份状态分页参数无效");
        const query: Record<string, unknown> = { identity: id, uid: { $gt: after } };
        if (options.active !== undefined)
            query.active = options.active;
        const rows = await this.ctx.database.get("faith_core_status_identities", query, { limit, sort: { uid: "asc" } });
        return Object.freeze(rows.map(freezeState));
    }
    async writeForOwner(uid: number, identity: string, input: {
        level: string;
        active: boolean;
        parameters?: Record<string, unknown>;
    }, owner: string, database: CoreDatabase) {
        const id = normalizeId(identity), entry = this.requireEntry(id);
        if (entry.owner !== owner)
            throw new FaithCoreError("PERMISSION_DENIED", `业务不能修改其他所有者的身份状态：${id}`);
        await this.users.require(uid, database);
        const level = this.level(id, input.level).id;
        if (typeof input.active !== "boolean")
            throw new FaithCoreError("VALIDATION_FAILED", "身份激活状态必须是布尔值");
        const parameters = cloneBusinessRecord(input.parameters ?? {}), serialized = JSON.stringify(parameters);
        if (Buffer.byteLength(serialized, "utf8") > 64 * 1024)
            throw new FaithCoreError("VALIDATION_FAILED", "身份参数不能超过 64 KiB");
        const previous = await this.read(uid, id, database), now = new Date();
        if (!previous) {
            try {
                const state = freezeState(await database.create("faith_core_status_identities", {
                    uid, identity: id, level, active: input.active, parameters, version: 0, updated_at: now
                }));
                this.invalidate(uid, id);
                return state;
            }
            catch (error) {
                throw new FaithCoreError("TRANSACTION_CONFLICT", "身份状态刚刚发生变化，请重试", { uid, identity: id }, { cause: error });
            }
        }
        const result = await database.set("faith_core_status_identities", {
            uid, identity: id, version: previous.version
        }, {
            level, active: input.active, parameters, version: previous.version + 1, updated_at: now
        });
        if (result.matched !== 1)
            throw new FaithCoreError("TRANSACTION_CONFLICT", "身份状态刚刚发生变化，请重试", { uid, identity: id });
        const state = Object.freeze({
            ...previous, level, active: input.active, parameters: Object.freeze(parameters), version: previous.version + 1, updated_at: now
        });
        this.invalidate(uid, id);
        return state;
    }
    invalidate(uid: number, identity?: string) {
        if (identity)
            this.cache.delete(`${uid}:${normalizeId(identity)}`);
        else
            for (const key of this.cache.keys())
                if (key.startsWith(`${uid}:`))
                    this.cache.delete(key);
    }
    readonly provider = async ({ uid, type }: BonusProviderContext) => {
        const states = await this.statesForKnownUser(uid), result = [];
        for (const state of states) {
            if (!state.active)
                continue;
            const level = this.definitions.get(state.identity)?.levels.get(state.level);
            for (const bonus of level?.bonuses ?? [])
                if (bonus.type === type)
                    result.push({
                        source: `identity:${state.identity}:${state.level}`, type, modifier: bonus.modifier, fixedBonus: bonus.fixedBonus, detail: bonus.detail
                    });
        }
        return result;
    };
    clear() {
        this.definitions.clear();
        this.cache.clear();
    }
    private requireEntry(id: string) {
        const entry = this.definitions.get(normalizeId(id));
        if (!entry)
            throw new FaithCoreError("NOT_FOUND", `身份状态不存在：${id}`);
        return entry;
    }
    private async read(uid: number, identity: string, database: CoreDatabase) {
        const [row] = await database.get("faith_core_status_identities", { uid, identity });
        return row ? freezeState(row) : null;
    }
    private async statesForKnownUser(uid: number) {
        const identities = [...this.definitions.keys()], now = Date.now();
        const cached = identities.map((identity) => this.cache.get(`${uid}:${identity}`));
        if (cached.every((entry) => entry && entry.expiresAt > now)) {
            return cached.flatMap((entry) => entry!.value ? [entry!.value] : []);
        }
        const rows = await this.ctx.database.get("faith_core_status_identities", { uid });
        const values = rows.map(freezeState);
        this.rememberUser(uid, values);
        return values.filter((state) => this.definitions.has(state.identity));
    }
    private rememberUser(uid: number, values: readonly Readonly<FaithStatusIdentityState>[]) {
        const expiresAt = Date.now() + 30000, byIdentity = new Map(values.map((value) => [value.identity, value]));
        for (const identity of this.definitions.keys())
            this.cache.set(`${uid}:${identity}`, { value: byIdentity.get(identity) ?? null, expiresAt });
        while (this.cache.size > 20000)
            this.cache.delete(this.cache.keys().next().value!);
    }
}
function normalizeDefinition(input: FaithStatusIdentityDefinition, owner: string): DefinitionEntry {
    const id = normalizeId(input.id), name = input.name?.trim();
    if (!name || name.length > 64 || !/^[a-z][a-z0-9_.:-]{0,79}$/.test(owner))
        throw new FaithCoreError("VALIDATION_FAILED", "身份状态定义无效");
    if (input.description !== undefined && (typeof input.description !== "string" || input.description.trim().length > 1000))
        throw new FaithCoreError("VALIDATION_FAILED", "身份状态描述不能超过 1000 字符");
    if (!Array.isArray(input.levels) || !input.levels.length || input.levels.length > 32)
        throw new FaithCoreError("VALIDATION_FAILED", "身份状态必须包含 1-32 个等级");
    const ids = new Set<string>(), ranks = new Set<number>();
    const levels = input.levels.map((item) => {
        const levelId = normalizeId(item.id), levelName = item.name?.trim();
        if (!levelName || levelName.length > 64 || !Number.isSafeInteger(item.rank) || item.rank < 0 || ids.has(levelId) || ranks.has(item.rank))
            throw new FaithCoreError("VALIDATION_FAILED", `身份等级定义无效：${item.id}`);
        ids.add(levelId);
        ranks.add(item.rank);
        if ((item.bonuses?.length ?? 0) > 64)
            throw new FaithCoreError("VALIDATION_FAILED", `单个身份等级最多包含 64 项加成：${item.id}`);
        const bonuses = Object.freeze((item.bonuses ?? []).map((bonus: FaithStatusIdentityBonus) => {
            const modifier = bonus.modifier ?? 0, fixedBonus = bonus.fixedBonus ?? 0;
            if (!/^[a-z][a-z0-9_.:/-]{0,63}$/.test(bonus.type) || !Number.isFinite(modifier) || !Number.isFinite(fixedBonus) || Math.abs(modifier) > 100 || Math.abs(fixedBonus) > 1e12 || (bonus.detail !== undefined && (typeof bonus.detail !== "string" || bonus.detail.length > 500)))
                throw new FaithCoreError("VALIDATION_FAILED", `身份等级加成无效：${item.id}`);
            return Object.freeze({ ...bonus });
        }));
        return Object.freeze({
            ...item, id: levelId, name: levelName, bonuses
        });
    }).sort((a, b) => a.rank - b.rank);
    const value = Object.freeze({
        id, name, description: input.description?.trim(), levels: Object.freeze(levels)
    });
    return {
        owner, value, levels: new Map(levels.map((level) => [level.id, level]))
    };
}
function normalizeId(value: string) {
    const id = value?.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_.:-]{0,63}$/.test(id))
        throw new FaithCoreError("VALIDATION_FAILED", `身份状态 ID 无效：${value}`);
    return id;
}
function assertUid(uid: number) {
    if (!Number.isSafeInteger(uid) || uid < 0)
        throw new FaithCoreError("VALIDATION_FAILED", `UID 无效：${uid}`);
}
function freezeState(row: FaithStatusIdentityRow): Readonly<FaithStatusIdentityState> {
    return Object.freeze({
        uid: row.uid, identity: row.identity, level: row.level, active: !!row.active, parameters: Object.freeze(cloneBusinessRecord(row.parameters ?? {})), version: row.version, updated_at: row.updated_at
    });
}
