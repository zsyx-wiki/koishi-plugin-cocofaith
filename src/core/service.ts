import type { FaithCoreServiceContract } from "cocofaith-sdk/core";
import { Context, Service } from "koishi";
import { FaithBonusService } from "./bonus";
import { normalizeCoreConfig } from "./config/validation";
import { CORE_EASTER_EGGS } from "./data/easterEggs";
import { CORE_ITEMS } from "./data/items";
import { CORE_OPENABLE_ITEMS } from "./data/openable-items";
import { CORE_PROFESSIONS } from "./data/professions";
import { registerBusinessModel, type BusinessModelFields } from "./database";
import { FaithEconomyService } from "./economy";
import { FaithEffectsService } from "./effects";
import { FaithCoreError } from "./errors";
import { FaithRegistryService } from "./faith";
import { FaithHealthService } from "./health";
import { FaithHooksService } from "./hooks";
import { FaithIntegrityService } from "./integrity";
import { FaithItemsService } from "./items";
import { FaithGameDayService, FaithLifecycleService } from "./lifecycle";
import { KeyedLockService } from "./lock";
import { FaithPermissionsService } from "./permissions";
import { FaithProfessionService } from "./professions";
import { createBusinessSharedApis, FaithBusinessCoreScope, FaithBusinessDataService } from "./business";
import { FaithAuditService, FaithBusinessTransactionService, FaithTransactionService } from "./transaction";
import { FaithIdentityService, FaithUidService } from "./identity";
import { FaithBulkOperationsService, FaithUsersService } from "./users";
import { FaithStatusIdentityService } from "./status-identities";
import type { FaithCoreConfig, IdentityInput } from "./types";
import { COCOFAITH_CORE_VERSION } from "./version";
export const CORE_SERVICE_ORDER = [
    "lifecycle",
    "hooks",
    "locks",
    "permissions",
    "transactions",
    "uids",
    "users",
    "statusIdentities",
    "bonuses",
    "identities",
    "businessData",
    "items",
    "professions",
    "faiths",
    "economy",
    "bulk",
] as const;
export interface FaithAdapterIdentityApi {
    normalize(identity: IdentityInput): ReturnType<FaithIdentityService["normalize"]>;
    resolve(identity: IdentityInput): Promise<number | null>;
    bind(uid: number, identity: IdentityInput): Promise<boolean>;
}
export class FaithCoreService extends Service implements FaithCoreServiceContract {
    readonly apiVersion = "3.0";
    private readonly capabilitySet = new Set([
        "transactions.idempotency", "transactions.multi-uid", "transactions.ledger", "transactions.callbacks",
        "permissions.persistent", "items.levels", "effects.persistent", "lifecycle.game-day", "integrity.check",
        "bulk.idempotent", "inventory.lightweight", "config.reload", "status-identities.levels",
    ]);
    private readonly capabilityList = Object.freeze([...this.capabilitySet]);
    readonly capabilities = Object.freeze({
        has: (capability: string) => this.capabilitySet.has(capability),
        all: () => this.capabilityList,
    });
    readonly lifecycle: FaithLifecycleService;
    readonly gameDay: FaithGameDayService;
    readonly hooks: FaithHooksService;
    readonly bonuses: FaithBonusService;
    readonly professions: FaithProfessionService;
    readonly faiths: FaithRegistryService;
    readonly locks = new KeyedLockService();
    readonly permissions: FaithPermissionsService;
    private readonly transactions: FaithTransactionService;
    private readonly uids = new FaithUidService();
    readonly users: FaithUsersService;
    readonly statusIdentities: FaithStatusIdentityService;
    private readonly identities: FaithIdentityService;
    readonly adapter: Readonly<FaithAdapterIdentityApi>;
    private readonly businessData: FaithBusinessDataService;
    private readonly businessTransactions: FaithBusinessTransactionService;
    readonly items: FaithItemsService;
    readonly audit: FaithAuditService;
    readonly effects: FaithEffectsService;
    readonly integrity: FaithIntegrityService;
    readonly health: FaithHealthService;
    readonly bulk: FaithBulkOperationsService;
    readonly economy: FaithEconomyService;
    private readonly businessApis;
    private readonly businessTableDefinitions = new Map<string, string>();
    declare config: Readonly<FaithCoreConfig>;
    constructor(ctx: Context, config: Readonly<FaithCoreConfig>) {
        super(ctx, "faithCore", true);
        this.config = normalizeCoreConfig(config);
        this.lifecycle = new FaithLifecycleService(ctx);
        this.permissions = new FaithPermissionsService(ctx);
        this.audit = new FaithAuditService(ctx.database);
        this.effects = new FaithEffectsService(ctx);
        this.hooks = new FaithHooksService(ctx);
        this.gameDay = new FaithGameDayService(ctx, this.config.gameDay, this.lifecycle, this.locks, this.hooks);
        this.transactions = new FaithTransactionService(ctx, this.hooks);
        this.users = new FaithUsersService(ctx, this.transactions, this.locks, this.hooks, this.audit);
        this.statusIdentities = new FaithStatusIdentityService(ctx, this.users);
        this.bonuses = new FaithBonusService(this.users, this.hooks);
        this.bonuses.registerProvider(this.effects.provider, {
            id: "core:persistent-effects", owner: "core", priority: -10000
        });
        this.bonuses.registerProvider(this.statusIdentities.provider, {
            id: "core:status-identities", owner: "core", priority: -9000
        });
        this.users.attachBonuses(this.bonuses);
        this.identities = new FaithIdentityService(ctx, this.transactions, this.locks, this.hooks, this.uids, this.users);
        this.adapter = Object.freeze({
            normalize: (identity: IdentityInput) => this.identities.normalize(identity),
            resolve: (identity: IdentityInput) => this.identities.resolve(identity),
            bind: (uid: number, identity: IdentityInput) => this.identities.bind(uid, identity),
        });
        this.businessData = new FaithBusinessDataService(ctx, this.transactions, this.locks, this.users);
        this.items = new FaithItemsService(ctx, this.transactions, this.locks, this.hooks, this.users, this.audit);
        this.professions = new FaithProfessionService(ctx, this.transactions, this.locks, this.users, this.hooks);
        this.professions.registerMany(CORE_PROFESSIONS, { owner: "core" });
        this.faiths = new FaithRegistryService(ctx, this.identities, this.users, this.professions, this.locks, this.hooks, this.config.registration.initialGold, this.audit, this.transactions);
        this.users.attachFaiths(this.faiths);
        this.integrity = new FaithIntegrityService(ctx, this.items, this.professions, this.faiths);
        this.health = new FaithHealthService(ctx, this);
        this.businessTransactions = new FaithBusinessTransactionService(this.transactions, this.locks, this.hooks, this.users, this.items, this.professions, this.audit, this.faiths, this.statusIdentities, this.bonuses);
        this.economy = new FaithEconomyService(this.users, this.bonuses, this.businessTransactions);
        this.bulk = new FaithBulkOperationsService(ctx, this.users, this.items, this.businessTransactions);
        this.businessApis = createBusinessSharedApis(this.users, this.items, this.permissions, this.bonuses, this.identities, this.faiths, this.effects, this.bulk, this.economy, this.statusIdentities);
        this.registerBuiltInItems();
        this.registerCoreLifecycle();
    }
    async reloadConfig(input: FaithCoreConfig) {
        const next = normalizeCoreConfig(input);
        return this.locks.run("core:config-reload", async () => {
            if (sameConfig(this.config, next))
                return this.config;
            const previous = this.config;
            try {
                await this.applyRuntimeConfig(next);
                await this.lifecycle.reload(Object.freeze({
                    type: "core-config", previous, current: next
                }));
                return this.config;
            }
            catch (error) {
                try {
                    await this.applyRuntimeConfig(previous);
                }
                catch (rollbackError) {
                    throw new AggregateError([error, rollbackError], "Core 配置更新及回滚均失败");
                }
                throw new FaithCoreError("LIFECYCLE_FAILED", "Core 配置 reload 失败，已恢复旧配置", { cause: error instanceof Error ? error.message : String(error) });
            }
        });
    }
    private async applyRuntimeConfig(config: Readonly<FaithCoreConfig>) {
        if (!sameGameDay(this.config.gameDay, config.gameDay))
            await this.gameDay.reconfigure(config.gameDay);
        this.faiths.configureRegistration(config.registration.initialGold);
        this.config = config;
    }
    private registerBuiltInItems() {
        this.items.registerMany([
            ...CORE_ITEMS,
            ...CORE_EASTER_EGGS,
            ...CORE_OPENABLE_ITEMS,
        ], { owner: "core" });
    }
    private registerCoreLifecycle() {
        this.lifecycle.onReady(() => this.transactions.run((database) => this.uids.initialize(database)), {
            name: "core.uid-sequence", priority: -10000, critical: true
        });
        this.lifecycle.onReady(() => this.faiths.load(), {
            name: "core.faith-registry", priority: -9000, critical: true
        });
        this.lifecycle.onReady(() => this.gameDay.start(), {
            name: "core.game-day", priority: -8000, critical: true
        });
        this.lifecycle.onGameDay(async () => {
            await this.effects.cleanupExpired();
            await this.permissions.cleanupExpired();
        }, {
            name: "core.expired-resources", priority: -10000, critical: true
        });
        this.lifecycle.defer(async () => {
            this.gameDay.stop();
            await this.locks.drain();
            this.hooks.clear();
            this.permissions.clear();
            this.bonuses.clear();
            this.professions.clear();
            this.statusIdentities.clear();
            this.faiths.clear();
            this.items.clear();
        });
    }
    listIdentities(uid: number) {
        return this.identities.list(uid);
    }
    unbindIdentity(uid: number, identity: IdentityInput) {
        return this.identities.unbind(uid, identity);
    }
    private registerBusinessTable(name: string, fields: BusinessModelFields, config = {}, businessInitializing = false) {
        const definition = JSON.stringify([fields, config]);
        const existing = this.businessTableDefinitions.get(name);
        if (existing !== undefined) {
            if (existing !== definition)
                throw new Error(`业务 ${name} 不能在运行中改变表结构`);
            return `faith_business_${name}`;
        }
        const allowed = ["created", "initializing", "initialized", "readying"];
        if (!allowed.includes(this.lifecycle.state) && !(businessInitializing && this.lifecycle.state === "ready")) {
            throw new Error(`业务表只能在 init/ready 初始化阶段注册，当前状态：${this.lifecycle.state}`);
        }
        const table = registerBusinessModel(this.ctx, name, fields, config);
        this.businessTableDefinitions.set(name, definition);
        return table;
    }
    createBusinessScope(name: string, options: {
        canRegisterTable?: () => boolean;
    } = {}) {
        return new FaithBusinessCoreScope(this.lifecycle, name, this.businessApis, this.hooks, this.bonuses, this.professions, this.businessData, this.businessTransactions, this.gameDay, (business, fields, config) => {
            const initializing = options.canRegisterTable?.() === true;
            if (options.canRegisterTable && !initializing)
                throw new Error(`业务 ${business} 只能在自身 init/ready 初始化阶段注册表`);
            return this.registerBusinessTable(business, fields, config, initializing);
        }, this.ctx.database, {
            apiVersion: this.apiVersion, version: COCOFAITH_CORE_VERSION, capabilities: this.capabilities.all()
        });
    }
}
function sameGameDay(a: FaithCoreConfig["gameDay"], b: FaithCoreConfig["gameDay"]) {
    return a.enabled === b.enabled && a.timezone === b.timezone && a.rolloverHour === b.rolloverHour && a.rolloverMinute === b.rolloverMinute && a.checkIntervalSeconds === b.checkIntervalSeconds && a.lockTimeoutSeconds === b.lockTimeoutSeconds && a.runOnStartup === b.runOnStartup;
}
function sameConfig(a: FaithCoreConfig, b: FaithCoreConfig) {
    return a.registration.initialGold === b.registration.initialGold && sameGameDay(a.gameDay, b.gameDay);
}
