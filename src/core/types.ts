import type {
  FaithStatusIdentityState,
  FaithItemDefinition,
  FaithOpenableDefinition,
} from "cocofaith-sdk/core";
export type {
  IdentityInput,
  FaithCoreUserData,
  FaithEffectRow,
  FaithStatusIdentityState,
  FaithItemDefinition,
  FaithOpenableDefinition,
  FaithOpenResult,
  InventoryMutation,
  UserValueDelta,
  FaithProfessionDefinition,
  FaithDefinition,
} from "cocofaith-sdk/core";
export const UID_MIN = 10000000;
export const UID_MAX = 99999999;
export interface FaithCoreConfig {
  registration: {
    initialGold: number;
  };
  gameDay: {
    enabled: boolean;
    timezone: string;
    rolloverHour: number;
    rolloverMinute: number;
    checkIntervalSeconds: number;
    lockTimeoutSeconds: number;
    runOnStartup: boolean;
  };
}
export type FaithAdapter = "onebot" | "qqbot" | (string & {});
export type IdentityType =
  | "qq_account"
  | "qqbot_user_openid"
  | "qqbot_member_openid"
  | (string & {});
export type IdentityScope = "global" | "private_chat" | "group_chat" | (string & {});
export interface FaithCoreUserIdentity {
  id: number;
  uid: number;
  adapter: FaithAdapter;
  type: IdentityType;
  value: string;
  scope: IdentityScope;
  scope_value: string;
}

export interface FaithCoreTransactionRow {
  id: number;
  transaction_id: string;
  idempotency_key: string;
  business: string;
  source: string;
  operator_uid: number;
  metadata: Record<string, unknown>;
  created_at: Date;
}
export interface FaithCoreLedgerEntry {
  id: number;
  transaction_id: string;
  uid: number;
  resource: string;
  before: number;
  delta: number;
  after: number;
  created_at: Date;
}
export interface FaithPermissionGrant {
  id: number;
  uid: number;
  permission: string;
  scope: string;
  scope_value: string;
  granted_by: number;
  expires_at: Date | null;
  created_at: Date;
}

export interface FaithStatusIdentityBonus {
  type: string;
  modifier?: number;
  fixedBonus?: number;
  detail?: string;
}
export interface FaithStatusIdentityLevel {
  id: string;
  name: string;
  rank: number;
  bonuses?: readonly FaithStatusIdentityBonus[];
}
export interface FaithStatusIdentityDefinition {
  id: string;
  name: string;
  description?: string;
  levels: readonly FaithStatusIdentityLevel[];
}

export interface FaithStatusIdentityRow extends FaithStatusIdentityState {
  id: number;
}
export interface FaithItemLevelDefinition {
  id: string;
  name: string;
  rank: number;
  color?: string;
  weight?: number;
  metadata?: Readonly<Record<string, unknown>>;
}
export interface FaithCoreInventoryRow {
  id: number;
  uid: number;
  item_id: string;
  quantity: number;
}
export interface FaithCoreBusinessData {
  id: number;
  uid: number;
  business: string;
  version: number;
  private: Record<string, unknown>;
  public: Record<string, unknown>;
}
export interface FaithCoreUidSequence {
  id: number;
  next_uid: number;
}

export type FaithOpenableCurrencyReward = NonNullable<FaithOpenableDefinition["guaranteed"]>;
export type FaithOpenableIndependentDrop = NonNullable<
  FaithOpenableDefinition["independentDrops"]
>[number];
export type FaithOpenablePoolEntry = NonNullable<
  FaithOpenableDefinition["randomDrop"]
>["itemPool"][number];

export interface ItemQuery {
  type?: string;
  level?: string;
  marketable?: boolean;
  obtainable?: boolean;
  name?: string;
}
export interface InventoryItem {
  uid: number;
  item_id: string;
  quantity: number;
  item: Readonly<FaithItemDefinition>;
}
export interface InventoryStack {
  item_id: string;
  quantity: number;
}

export interface FaithCoreFaithRow {
  id: number;
  name: string;
  path: string;
  type: "dynamic";
  creator_uid: number;
  believer_count: number;
  prayer_word: string;
  custom_professions: Record<string, string>;
  metadata: Record<string, unknown>;
  created_at: Date;
}
