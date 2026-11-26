import type * as Sdk from "cocofaith-sdk/core";
import type {
  FaithBusinessUsersApi,
  FaithBusinessBonusesApi,
  FaithBusinessEffectsApi,
  FaithBusinessBulkApi,
  FaithBusinessEconomyApi,
  FaithBusinessEconomyOptions,
  FaithBusinessRewardOptions,
  FaithBusinessFaithsApi,
} from "cocofaith-sdk/core";
export type {
  FaithBusinessUsersApi,
  FaithBusinessBonusesApi,
  FaithBusinessEffectsApi,
  FaithBusinessBulkApi,
  FaithBusinessEconomyApi,
  FaithBusinessEconomyOptions,
  FaithBusinessRewardOptions,
  FaithBusinessFaithsApi,
} from "cocofaith-sdk/core";
import type { BonusRequest, FaithBonusService } from "../bonus";
import type { FaithEconomyService, FaithMoney } from "../economy";
import type { CreateFaithEffect, FaithEffectsService } from "../effects";
import type { FaithRegistryService } from "../faith";
import type { FaithHooksService } from "../hooks";
import type { FaithIdentityService } from "../identity";
import type { FaithItemsService } from "../items";
import type { FaithDisposable } from "../lifecycle";
import type { FaithPermissionsService } from "../permissions";
import type { FaithProfessionService } from "../professions";
import type { FaithStatusIdentityService } from "../status-identities";
import type {
  FaithCoreUserData,
  FaithItemDefinition,
  FaithItemLevelDefinition,
  FaithProfessionDefinition,
  FaithStatusIdentityDefinition,
  IdentityInput,
  InventoryItem,
  ItemQuery,
  UserValueDelta,
} from "../types";
import type { FaithBulkOperationsService, FaithBulkOptions, FaithUsersService } from "../users";

/** SDK 契约的实现侧扩展，只声明额外能力或更完整的返回数据。 */
export interface FaithBusinessItemsApi extends Sdk.FaithBusinessItemsApi {
  getByName(name: string): Readonly<FaithItemDefinition> | undefined;
  list(query?: ItemQuery): Readonly<FaithItemDefinition>[];
  getInventorySnapshot(uid: number): Promise<Readonly<Record<string, InventoryItem>>>;
  listInventory(
    uid: number,
    options?: {
      type?: string;
      level?: string;
      offset?: number;
      limit?: number;
    },
  ): Promise<InventoryItem[]>;
  canReceive(uid: number, itemIdOrName: string, quantity?: number): Promise<boolean>;
  readonly levels: FaithBusinessItemLevelsApi;
}
/** SDK 契约的实现侧扩展，只声明额外能力或更完整的返回数据。 */
export interface FaithBusinessItemLevelsApi extends Sdk.FaithBusinessItemLevelsApi {
  register(
    definition: FaithItemLevelDefinition,
    options?: {
      replace?: boolean;
    },
  ): Readonly<FaithItemLevelDefinition>;
  registerMany(
    definitions: readonly FaithItemLevelDefinition[],
    options?: {
      replace?: boolean;
    },
  ): Readonly<FaithItemLevelDefinition>[];
  get(id: string): Readonly<FaithItemLevelDefinition> | undefined;
  require(id: string): Readonly<FaithItemLevelDefinition>;
  all(): Readonly<FaithItemLevelDefinition>[];
}
/** SDK 契约的实现侧扩展，只声明额外能力或更完整的返回数据。 */
export interface FaithBusinessPermissionsApi extends Sdk.FaithBusinessPermissionsApi {
  register(permission: string, policy: import("../permissions").PermissionPolicy): FaithDisposable;
}
/** SDK 契约的实现侧扩展，只声明额外能力或更完整的返回数据。 */
export interface FaithBusinessProfessionsApi extends Sdk.FaithBusinessProfessionsApi {
  getByName(name: string): Readonly<FaithProfessionDefinition> | undefined;
}
/** SDK 契约的实现侧扩展，只声明额外能力或更完整的返回数据。 */
export interface FaithBusinessIdentitiesApi extends Sdk.FaithBusinessIdentitiesApi {
  list(uid: number): Promise<import("../types").FaithCoreUserIdentity[]>;
}
/** SDK 契约的实现侧扩展，只声明额外能力或更完整的返回数据。 */
export interface FaithBusinessStatusIdentitiesApi extends Sdk.FaithBusinessStatusIdentitiesApi {
  listByIdentity(
    identity: string,
    options?: {
      active?: boolean;
      afterUid?: number;
      limit?: number;
    },
  ): Promise<readonly Readonly<import("../types").FaithStatusIdentityState>[]>;
}

/** SDK 契约的实现侧扩展，只声明额外能力或更完整的返回数据。 */
export interface FaithBusinessHooksApi extends Sdk.FaithBusinessHooksApi {
  on<T, R = void>(
    event: string,
    handler: import("../hooks").FaithHookHandler<T, R>,
    options?: import("../hooks").FaithHookOptions,
  ): FaithDisposable;
  emit<T>(event: string, payload: T): Promise<import("../hooks").FaithHookReport<void>>;
}

export function createBusinessUsersApi(
  service: FaithUsersService,
): Readonly<FaithBusinessUsersApi> {
  return Object.freeze({
    listUids: (after?: number, limit?: number) => service.listUids(after, limit),
    get: (uid: number) => service.get(uid),
    require: (uid: number) => service.require(uid),
    currentFaith: (user: FaithCoreUserData) => service.currentFaith(user),
  });
}
export function createBusinessItemsApi(
  service: FaithItemsService,
  business: string,
): Readonly<FaithBusinessItemsApi> {
  const owner = `business:${business}`;
  return Object.freeze({
    get revision() {
      return service.revision;
    },
    register: (
      definition: import("../types").FaithItemDefinition,
      options: {
        replace?: boolean;
      } = {},
    ) => service.register(definition, { ...options, owner }),
    registerMany: (
      definitions: readonly import("../types").FaithItemDefinition[],
      options: {
        replace?: boolean;
      } = {},
    ) => service.registerMany(definitions, { ...options, owner }),
    unregister: (itemId: string) => service.unregister(itemId, owner),
    get: (id: string) => service.get(id),
    getByName: (name: string) => service.getByName(name),
    resolve: (key: string) => service.resolve(key),
    require: (key: string) => service.require(key),
    has: (key: string) => service.has(key),
    all: () => service.all(),
    list: (query?: ItemQuery) => service.list(query),
    obtainable: () => service.obtainable(),
    marketable: () => service.marketable(),
    isOpenable: (key: string) => service.isOpenable(key),
    rollOpenable: (key: string, random?: () => number) => service.rollOpenable(key, random),
    getInventoryEntries: (uid: number) => service.getInventoryEntries(uid),
    getInventoryStacks: (uid: number) => service.getInventoryStacks(uid),
    getInventorySnapshot: (uid: number) => service.getInventorySnapshot(uid),
    listInventory: (
      uid: number,
      options?: {
        type?: string;
        level?: string;
        offset?: number;
        limit?: number;
      },
    ) => service.listInventory(uid, options),
    getQuantity: (uid: number, item: string) => service.getQuantity(uid, item),
    hasQuantity: (uid: number, item: string, quantity?: number) =>
      service.hasQuantity(uid, item, quantity),
    canReceive: (uid: number, item: string, quantity?: number) =>
      service.canReceive(uid, item, quantity),
    levels: Object.freeze({
      register: (
        definition: import("../types").FaithItemLevelDefinition,
        options: {
          replace?: boolean;
        } = {},
      ) => service.levels.register(definition, { ...options, owner }),
      registerMany: (
        definitions: readonly import("../types").FaithItemLevelDefinition[],
        options: {
          replace?: boolean;
        } = {},
      ) => service.levels.registerMany(definitions, { ...options, owner }),
      get: (id: string) => service.levels.get(id),
      require: (id: string) => service.levels.require(id),
      all: () => service.levels.all(),
      compare: (a: string, b: string) => service.levels.compare(a, b),
    }),
  });
}
export function createBusinessPermissionsApi(
  service: FaithPermissionsService,
  business: string,
): Readonly<FaithBusinessPermissionsApi> {
  return Object.freeze({
    register: (permission: string, policy: import("../permissions").PermissionPolicy) =>
      service.register(permission, policy, { owner: `business:${business}` }),
    check: (
      uid: number,
      permission: string,
      data?: Record<string, unknown>,
      scope?: string,
      scopeValue?: string,
    ) => service.check(uid, permission, data, scope, scopeValue),
  });
}
export function createBusinessProfessionsApi(
  service: FaithProfessionService,
  business: string,
): Readonly<FaithBusinessProfessionsApi> {
  const owner = `business:${business}`;
  return Object.freeze({
    register: (
      definition: import("../types").FaithProfessionDefinition,
      options: {
        override?: boolean;
      } = {},
    ) => service.register(definition, { ...options, owner }),
    registerMany: (
      definitions: readonly import("../types").FaithProfessionDefinition[],
      options: {
        override?: boolean;
      } = {},
    ) => service.registerMany(definitions, { ...options, owner }),
    unregister: (id: string) => service.unregister(id, owner),
    get: (id: string) => service.get(id),
    getByName: (name: string) => service.getByName(name),
    resolve: (key: string) => service.resolve(key),
    require: (key: string) => service.require(key),
    all: () => service.all(),
    list: (query?: { faith?: string; type?: string; source?: string }) => service.list(query),
    getUserProfession: (uid: number) => service.getUserProfession(uid),
  });
}
export function createBusinessIdentitiesApi(
  service: FaithIdentityService,
): Readonly<FaithBusinessIdentitiesApi> {
  return Object.freeze({
    resolve: (identity: IdentityInput) => service.resolve(identity),
    list: (uid: number) => service.list(uid),
    bindExisting: (uid: number, identity: IdentityInput) => service.bind(uid, identity),
  });
}
export function createBusinessStatusIdentitiesApi(
  service: FaithStatusIdentityService,
  business: string,
): Readonly<FaithBusinessStatusIdentitiesApi> {
  const owner = `business:${business}`;
  return Object.freeze({
    register: (definition: FaithStatusIdentityDefinition) => service.register(definition, owner),
    get: (id: string) => service.get(id),
    require: (id: string) => service.require(id),
    all: () => service.all(),
    state: (uid: number, identity: string) => service.state(uid, identity),
    list: (uid: number) => service.list(uid),
    listByIdentity: (
      identity: string,
      options?: {
        active?: boolean;
        afterUid?: number;
        limit?: number;
      },
    ) => service.listByIdentity(identity, options),
  });
}
export function createBusinessFaithsApi(
  service: FaithRegistryService,
): Readonly<FaithBusinessFaithsApi> {
  return Object.freeze({
    get: (name: string) => service.get(name),
    require: (name: string) => service.require(name),
    has: (name: string) => service.has(name),
    all: () => service.all(),
    paths: () => service.paths(),
    byPath: (path: string) => service.byPath(path),
    resolvePrayerWord: (word: string) => service.resolvePrayerWord(word),
    registerUser: (identity: IdentityInput, faith: string, initialGold?: number) =>
      service.registerUser(identity, faith, initialGold),
    registerDynamic: (input: {
      name: string;
      path: string;
      creatorUid: number;
      prayerWord?: string;
      metadata?: Record<string, unknown>;
    }) => service.registerDynamic(input),
    unregisterDynamic: (name: string, creatorUid?: number) =>
      service.unregisterDynamic(name, creatorUid),
    setPrayerWord: (name: string, word: string, creatorUid?: number) =>
      service.setPrayerWord(name, word, creatorUid),
    setCustomProfession: (name: string, type: string, profession: string, creatorUid?: number) =>
      service.setCustomProfession(name, type, profession, creatorUid),
  });
}
export function createBusinessHooksApi(
  service: FaithHooksService,
  business: string,
): Readonly<FaithBusinessHooksApi> {
  return Object.freeze({
    on: <T, R = void>(
      event: string,
      handler: import("../hooks").FaithHookHandler<T, R>,
      options: import("../hooks").FaithHookOptions = {},
    ) => {
      if (RESTRICTED_BUSINESS_HOOKS.has(event))
        throw new Error(`Business 不能订阅可改变 Core 控制流的 Hook：${event}`);
      return service.on(event, handler, { ...options, owner: `business:${business}` });
    },
    emit: <T>(event: string, payload: T) => {
      if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(event)) throw new Error(`非法业务 Hook 名称：${event}`);
      return service.emit(`business/${business}/${event}`, payload);
    },
  });
}
export function createBusinessBonusesApi(
  service: FaithBonusService,
  business: string,
): Readonly<FaithBusinessBonusesApi> {
  return Object.freeze({
    calculate: (request: BonusRequest) => service.calculate(request),
    overview: (uid: number, types?: readonly string[], baseValue?: number) =>
      service.overview(uid, types, baseValue),
    registerProvider: (
      provider: import("../bonus").BonusProvider,
      options: Omit<import("../bonus").BonusProviderOptions, "owner">,
    ) => service.registerProvider(provider, { ...options, owner: `business:${business}` }),
  });
}
export function createBusinessEffectsApi(
  service: FaithEffectsService,
  business: string,
): Readonly<FaithBusinessEffectsApi> {
  const owner = `business:${business}`;
  return Object.freeze({
    create: (input: Omit<CreateFaithEffect, "owner">) => service.create({ ...input, owner }),
    remove: async (id: number) => {
      const effect = await service.get(id);
      if (!effect || effect.owner !== owner) throw new Error("不能删除其他业务的效果");
      return service.remove(id);
    },
    list: (query?: Parameters<FaithEffectsService["list"]>[0]) =>
      service.list(query).then((rows) => rows.filter((row) => row.owner === owner)),
  });
}
export function createBusinessBulkApi(
  service: FaithBulkOperationsService,
  business: string,
): Readonly<FaithBusinessBulkApi> {
  const options = (value: FaithBulkOptions): FaithBulkOptions => {
    if (!value || typeof value.operationId !== "string" || value.operationId.length > 60)
      throw new Error("Business 全体操作 operationId 必须是最多 60 字符的字符串");
    return { ...value, operationId: `${business}:${value.operationId}` };
  };
  return Object.freeze({
    changeValuesForAll: (delta: Readonly<UserValueDelta>, value: FaithBulkOptions) =>
      service.changeValuesForAll(delta, options(value)),
    giveItemToAll: (item: string, quantity: number, value: FaithBulkOptions) =>
      service.giveItemToAll(item, quantity, options(value)),
  });
}
export function createBusinessEconomyApi(
  service: FaithEconomyService,
  business: string,
): Readonly<FaithBusinessEconomyApi> {
  const source = (action: string) => {
    if (
      typeof action !== "string" ||
      action.length > 62 ||
      !/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/.test(action)
    )
      throw new Error("经济操作 action 必须使用小写语义名称");
    return `${business}.${action}`;
  };
  const options = <T extends FaithBusinessEconomyOptions | FaithBusinessRewardOptions>(
    value: T,
  ) => {
    if (!value || typeof value !== "object") throw new Error("经济操作选项不能为空");
    const { action, ...rest } = value;
    return { ...rest, source: source(action) };
  };
  return Object.freeze({
    getWallet: (uid: number) => service.getWallet(uid),
    canAfford: (uid: number, cost: Readonly<FaithMoney>) => service.canAfford(uid, cost),
    requireFunds: (uid: number, cost: Readonly<FaithMoney>) => service.requireFunds(uid, cost),
    pay: (uid: number, cost: Readonly<FaithMoney>, value: FaithBusinessEconomyOptions) =>
      service.pay(uid, cost, options(value)),
    reward: (uid: number, amount: Readonly<FaithMoney>, value: FaithBusinessRewardOptions) =>
      service.reward(uid, amount, options(value)),
    refund: (uid: number, amount: Readonly<FaithMoney>, value: FaithBusinessEconomyOptions) =>
      service.refund(uid, amount, options(value)),
    transfer: (
      from: number,
      to: number,
      amount: Readonly<FaithMoney>,
      value: FaithBusinessEconomyOptions,
    ) => service.transfer(from, to, amount, options(value)),
    previewReward: (
      uid: number,
      amount: Readonly<FaithMoney>,
      action: string,
      metadata?: Readonly<Record<string, unknown>>,
    ) => service.previewReward(uid, amount, source(action), metadata),
  });
}
export function createBusinessSharedApis(
  users: FaithUsersService,
  items: FaithItemsService,
  permissions: FaithPermissionsService,
  _bonuses: FaithBonusService,
  identities: FaithIdentityService,
  faiths: FaithRegistryService,
  effects: FaithEffectsService,
  bulk: FaithBulkOperationsService,
  economy: FaithEconomyService,
  statusIdentities: FaithStatusIdentityService,
) {
  return Object.freeze({
    users: createBusinessUsersApi(users),
    items,
    permissions,
    identities: createBusinessIdentitiesApi(identities),
    faiths: createBusinessFaithsApi(faiths),
    effects,
    bulk,
    economy,
    statusIdentities,
  });
}
export type FaithBusinessSharedApis = ReturnType<typeof createBusinessSharedApis>;
const RESTRICTED_BUSINESS_HOOKS = new Set([
  "identity/before-create-user",
  "identity/before-bind",
  "user/before-values-change",
  "transaction/before",
  "bonus/before-calculate",
  "bonus/contributions",
]);
