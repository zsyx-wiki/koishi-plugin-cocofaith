import type { Context } from "koishi";
import { Model } from "koishi";
import type { FaithBonusService } from "../bonus";
import type { BusinessModelFields } from "../database";
import type { FaithHooksService } from "../hooks";
import type { FaithLifecycleScope, FaithLifecycleService } from "../lifecycle";
import type { FaithAtomicScope, FaithBusinessTransactionService } from "../transaction";
import { assertBusinessName } from "../validation";
import type { FaithBusinessDataService } from "./data";
import { createBusinessBonusesApi, createBusinessBulkApi, createBusinessEconomyApi, createBusinessEffectsApi, createBusinessHooksApi, createBusinessItemsApi, createBusinessPermissionsApi, createBusinessProfessionsApi, createBusinessStatusIdentitiesApi, type FaithBusinessBonusesApi, type FaithBusinessBulkApi, type FaithBusinessEconomyApi, type FaithBusinessEffectsApi, type FaithBusinessFaithsApi, type FaithBusinessHooksApi, type FaithBusinessIdentitiesApi, type FaithBusinessItemsApi, type FaithBusinessPermissionsApi, type FaithBusinessProfessionsApi, type FaithBusinessSharedApis, type FaithBusinessStatusIdentitiesApi, type FaithBusinessUsersApi } from "./scope-api";
export class FaithBusinessCoreScope {
    #businessData: FaithBusinessDataService;
    #registerModel: (name: string, fields: BusinessModelFields, config?: Partial<Model.Config>) => string;
    #tableName?: string;
    #tablePrimary = new Set<string>();
    readonly lifecycle: FaithLifecycleScope;
    readonly runtime: Readonly<{
        apiVersion: string;
        version?: string;
        capabilities: readonly string[];
    }>;
    readonly users: Readonly<FaithBusinessUsersApi>;
    readonly items: Readonly<FaithBusinessItemsApi>;
    readonly permissions: Readonly<FaithBusinessPermissionsApi>;
    readonly hooks: Readonly<FaithBusinessHooksApi>;
    readonly bonuses: Readonly<FaithBusinessBonusesApi>;
    readonly professions: Readonly<FaithBusinessProfessionsApi>;
    readonly identities: Readonly<FaithBusinessIdentitiesApi>;
    readonly statusIdentities: Readonly<FaithBusinessStatusIdentitiesApi>;
    readonly faiths: Readonly<FaithBusinessFaithsApi>;
    readonly transaction: FaithBusinessAtomicTransactionApi;
    readonly effects: Readonly<FaithBusinessEffectsApi>;
    readonly bulk: Readonly<FaithBusinessBulkApi>;
    readonly economy: Readonly<FaithBusinessEconomyApi>;
    readonly gameDay: Readonly<{
        currentDate(now?: Date): string;
    }>;
    readonly data: Readonly<{
        get(uid: number): ReturnType<FaithBusinessDataService["get"]>;
        set(uid: number, value: {
            private?: Record<string, unknown>;
            public?: Record<string, unknown>;
        }): ReturnType<FaithBusinessDataService["set"]>;
    }>;
    readonly table: Readonly<{
        get<T extends object = Record<string, unknown>>(query?: Record<string, unknown>, cursor?: Record<string, unknown>): Promise<T[]>;
        create<T extends object>(value: T): Promise<T>;
        upsert(values: readonly Record<string, unknown>[], keys?: readonly string[]): Promise<unknown>;
        set(query: Record<string, unknown>, patch: Record<string, unknown>): Promise<{
            matched?: number;
        }>;
        remove(query: Record<string, unknown>): Promise<unknown>;
    }>;
    constructor(lifecycle: FaithLifecycleService, readonly name: string, apis: FaithBusinessSharedApis, hooks: FaithHooksService, bonuses: FaithBonusService, professions: import("../professions").FaithProfessionService, businessData: FaithBusinessDataService, transactions: FaithBusinessTransactionService, gameDay: import("../lifecycle").FaithGameDayService, registerModel: (name: string, fields: BusinessModelFields, config?: Partial<Model.Config>) => string, database?: Context["database"], runtime: {
        apiVersion: string;
        version?: string;
        capabilities: readonly string[];
    } = { apiVersion: "3.0", capabilities: [] }) {
        assertBusinessName(name);
        this.lifecycle = lifecycle.scope(`business:${name}`);
        this.runtime = Object.freeze({ ...runtime, capabilities: Object.freeze([...runtime.capabilities]) });
        this.users = apis.users;
        this.items = createBusinessItemsApi(apis.items, name);
        this.permissions = createBusinessPermissionsApi(apis.permissions, name);
        this.hooks = createBusinessHooksApi(hooks, name);
        this.bonuses = createBusinessBonusesApi(bonuses, name);
        this.professions = createBusinessProfessionsApi(professions, name);
        this.identities = apis.identities;
        this.statusIdentities = createBusinessStatusIdentitiesApi(apis.statusIdentities, name);
        this.faiths = apis.faiths;
        this.effects = createBusinessEffectsApi(apis.effects, name);
        this.bulk = createBusinessBulkApi(apis.bulk, name);
        this.economy = createBusinessEconomyApi(apis.economy, name);
        this.gameDay = Object.freeze({ currentDate: (now?: Date) => gameDay.getDate(now) });
        this.transaction = Object.freeze({
            run: <T>(uid: number, task: (scope: FaithAtomicScope) => Promise<T>, options?: import("../transaction").FaithTransactionOptions) => transactions.run(this.name, uid, task, options, this.atomicTableDefinition()),
            runMany: <T>(uids: readonly number[], task: (scopes: ReadonlyMap<number, FaithAtomicScope>) => Promise<T>, options?: import("../transaction").FaithTransactionOptions) => transactions.runMany(this.name, uids, task, options, this.atomicTableDefinition()),
        });
        this.#businessData = businessData;
        this.#registerModel = registerModel;
        const requireTable = () => {
            if (!this.#tableName || !database)
                throw new Error(`业务 ${name} 尚未注册独立业务表`);
            return this.#tableName as never;
        };
        const requireQuery = (query: Record<string, unknown>) => {
            if (!query || typeof query !== "object" || Array.isArray(query) || !Object.keys(query).length)
                throw new Error("独立业务表写操作必须提供非空查询条件");
            return query as never;
        };
        const requirePatch = (patch: Record<string, unknown>) => {
            if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length)
                throw new Error("独立业务表更新内容不能为空");
            const primary = Object.keys(patch).find((key) => this.#tablePrimary.has(key));
            if (primary)
                throw new Error(`独立业务表不能修改主键：${primary}`);
            return patch as never;
        };
        this.table = Object.freeze({
            get: <T extends object = Record<string, unknown>>(query: Record<string, unknown> = {}, cursor?: Record<string, unknown>) => database!.get(requireTable(), query as never, cursor as never) as unknown as Promise<T[]>,
            create: <T extends object>(value: T) => database!.create(requireTable(), value as never) as unknown as Promise<T>,
            upsert: (values: readonly Record<string, unknown>[], keys?: readonly string[]) => database!.upsert(requireTable(), values as never, keys as never),
            set: (query: Record<string, unknown>, patch: Record<string, unknown>) => database!.set(requireTable(), requireQuery(query), requirePatch(patch)) as Promise<{
                matched?: number;
            }>,
            remove: (query: Record<string, unknown>) => database!.remove(requireTable(), requireQuery(query)),
        });
        this.data = Object.freeze({
            get: (uid: number) => this.#businessData.get(uid, this.name),
            set: (uid: number, value: {
                private?: Record<string, unknown>;
                public?: Record<string, unknown>;
            }) => this.#businessData.set(uid, this.name, value),
        });
        this.lifecycle.defer(async () => {
            hooks.removeOwner(`business:${name}`);
            bonuses.removeOwner(`business:${name}`);
            apis.permissions.removeOwner(`business:${name}`);
        });
    }
    private atomicTableDefinition() {
        return this.#tableName ? { name: this.#tableName, primary: [...this.#tablePrimary] } : undefined;
    }
    registerTable(fields: BusinessModelFields, config: Partial<Model.Config> = {}) {
        if (this.lifecycle.disposed)
            throw new Error(`业务 ${this.name} 的作用域已卸载`);
        if (this.#tableName)
            throw new Error(`业务 ${this.name} 只能注册一张独立业务表`);
        const primary = config.primary ?? "id";
        this.#tablePrimary = new Set(Array.isArray(primary) ? primary : [primary]);
        for (const field of this.#tablePrimary)
            if (!(field in fields))
                throw new Error(`独立业务表缺少主键字段：${field}`);
        return this.#tableName = this.#registerModel(this.name, fields, config);
    }
}
export interface FaithBusinessAtomicTransactionApi {
    run<T>(uid: number, task: (scope: FaithAtomicScope) => Promise<T>, options?: import("../transaction").FaithTransactionOptions): Promise<T>;
    runMany<T>(uids: readonly number[], task: (scopes: ReadonlyMap<number, FaithAtomicScope>) => Promise<T>, options?: import("../transaction").FaithTransactionOptions): Promise<T>;
}
