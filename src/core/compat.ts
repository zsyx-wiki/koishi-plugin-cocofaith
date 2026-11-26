/** 兼容导出清单：冻结现有名称，避免内部新增实现自动成为公共 API。
 * @deprecated 新扩展使用 SDK 与 koishi-plugin-cocofaith/gameplay；下一主版本再迁移移除。
 */
export { FaithBonusService } from "./bonus";
export type {
  BonusCalculation,
  BonusContribution,
  BonusProvider,
  BonusProviderContext,
  BonusProviderOptions,
  BonusRequest,
  BonusValueType,
} from "./bonus";
export {
  FaithBusinessCoreScope,
  FaithBusinessDataService,
  createBusinessBonusesApi,
  createBusinessBulkApi,
  createBusinessEconomyApi,
  createBusinessEffectsApi,
  createBusinessFaithsApi,
  createBusinessHooksApi,
  createBusinessIdentitiesApi,
  createBusinessItemsApi,
  createBusinessPermissionsApi,
  createBusinessProfessionsApi,
  createBusinessSharedApis,
  createBusinessStatusIdentitiesApi,
  createBusinessUsersApi,
} from "./business";
export type {
  FaithBusinessAtomicTransactionApi,
  FaithBusinessBonusesApi,
  FaithBusinessBulkApi,
  FaithBusinessEconomyApi,
  FaithBusinessEconomyOptions,
  FaithBusinessEffectsApi,
  FaithBusinessFaithsApi,
  FaithBusinessHooksApi,
  FaithBusinessIdentitiesApi,
  FaithBusinessItemLevelsApi,
  FaithBusinessItemsApi,
  FaithBusinessPermissionsApi,
  FaithBusinessProfessionsApi,
  FaithBusinessRewardOptions,
  FaithBusinessSharedApis,
  FaithBusinessStatusIdentitiesApi,
  FaithBusinessUsersApi,
} from "./business";
export { normalizeCoreConfig } from "./config/validation";
export { CORE_EASTER_EGGS } from "./data/easterEggs";
export { CORE_FAITHS, CORE_FAITH_PRAYERS, FAITH_CAMPS } from "./data/faiths";
export { CORE_ITEMS } from "./data/items";
export { CORE_JUNK_PICKABLE_ITEM_IDS, CORE_OPENABLE_ITEMS } from "./data/openable-items";
export { CORE_PROFESSIONS } from "./data/professions";
export { registerBusinessModel, registerCoreModels } from "./database";
export type { BusinessModelFields } from "./database";
export { FAITH_CURRENCIES, FaithEconomyService } from "./economy";
export type {
  FaithCurrency,
  FaithEconomyChangeResult,
  FaithEconomyOptions,
  FaithMoney,
  FaithRewardOptions,
  FaithRewardPreview,
  FaithTransferResult,
  FaithWallet,
} from "./economy";
export { FaithEffectsService } from "./effects";
export type { CreateFaithEffect } from "./effects";
export { CORE_ERROR_CATALOG, FaithCoreError, coreError } from "./errors";
export type { FaithCoreErrorCode } from "./errors";
export { FaithRegistryService, FaithRegistryServiceBase, normalizePrayerWord } from "./faith";
export { FaithHealthService } from "./health";
export { FaithHooksService } from "./hooks";
export type {
  FaithCoreHookMap,
  FaithCoreHookName,
  FaithHookContext,
  FaithHookFailure,
  FaithHookHandler,
  FaithHookOptions,
  FaithHookReport,
} from "./hooks";
export { FaithIdentityService, FaithUidService, normalizeIdentity } from "./identity";
export { FaithIntegrityService } from "./integrity";
export type { IntegrityIssue } from "./integrity";
export {
  CORE_ITEM_LEVELS,
  FaithInventoryRepository,
  FaithItemLevelRegistry,
  FaithItemRegistry,
  FaithItemsService,
  assertNonNegativeQuantity,
  assertPositiveQuantity,
  createInventoryMutation,
  validateItemDefinition,
} from "./items";
export {
  CallbackDisposable,
  FaithGameDayService,
  FaithLifecycleScope,
  FaithLifecycleService,
} from "./lifecycle";
export type {
  FaithDisposable,
  FaithGameDayEvent,
  FaithLifecycleHandler,
  FaithLifecycleStage,
  FaithLifecycleState,
  LifecycleRegistration,
  LifecycleRegistrationOptions,
} from "./lifecycle";
export { KeyedLockService } from "./lock";
export { FaithPermissionsService } from "./permissions";
export type { PermissionContext, PermissionPolicy } from "./permissions";
export { FaithProfessionRegistry, FaithProfessionService } from "./professions";
export { CORE_SERVICE_ORDER, FaithCoreService } from "./service";
export type { FaithAdapterIdentityApi } from "./service";
export { FaithStatusIdentityService } from "./status-identities";
export {
  FaithAuditService,
  FaithBusinessTransactionService,
  FaithTransactionService,
  atomicTable,
} from "./transaction";
export type {
  AtomicTableDefinition,
  CoreDatabase,
  FaithAtomicBusinessDataApi,
  FaithAtomicEconomyApi,
  FaithAtomicItemsApi,
  FaithAtomicRewardOptions,
  FaithAtomicScope,
  FaithAtomicStatusIdentitiesApi,
  FaithAtomicTableApi,
  FaithAtomicUserApi,
  FaithTransactionOptions,
} from "./transaction";
export { UID_MAX, UID_MIN } from "./types";
export type {
  FaithAdapter,
  FaithCoreBusinessData,
  FaithCoreConfig,
  FaithCoreFaithRow,
  FaithCoreInventoryRow,
  FaithCoreLedgerEntry,
  FaithCoreTransactionRow,
  FaithCoreUidSequence,
  FaithCoreUserData,
  FaithCoreUserIdentity,
  FaithDefinition,
  FaithEffectRow,
  FaithItemDefinition,
  FaithItemLevelDefinition,
  FaithOpenResult,
  FaithOpenableCurrencyReward,
  FaithOpenableDefinition,
  FaithOpenableIndependentDrop,
  FaithOpenablePoolEntry,
  FaithPermissionGrant,
  FaithProfessionDefinition,
  FaithStatusIdentityBonus,
  FaithStatusIdentityDefinition,
  FaithStatusIdentityLevel,
  FaithStatusIdentityRow,
  FaithStatusIdentityState,
  IdentityInput,
  IdentityScope,
  IdentityType,
  InventoryItem,
  InventoryMutation,
  InventoryStack,
  ItemQuery,
  UserValueDelta,
} from "./types";
export { FaithBulkOperationsService, FaithUsersService, normalizeFaiths } from "./users";
export type {
  FaithBulkFailure,
  FaithBulkOptions,
  FaithBulkResult,
  UserChangeOptions,
} from "./users";
export {
  MAX_BUSINESS_RECORD_BYTES,
  assertBusinessName,
  assertUid,
  cloneBusinessRecord,
} from "./validation";
export { COCOFAITH_CORE_VERSION } from "./version";
