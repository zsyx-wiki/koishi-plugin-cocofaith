import type { FaithBusinessCoreScope, FaithDisposable } from "cocofaith-sdk/core";
import type { GameplayResult as BusinessResult } from "cocofaith-sdk/gameplay";
export interface FaithAdminCommandContext {
  actorUid: number;
  args: readonly string[];
  core: FaithBusinessCoreScope;
  requestId?: string;
}
export interface FaithAdminCommand {
  business: string;
  command: string;
  description?: string;
  execute(context: FaithAdminCommandContext): BusinessResult | Promise<BusinessResult>;
}
export interface FaithAdminCommandsApi {
  register(command: FaithAdminCommand): FaithDisposable;
  list(): readonly Omit<Readonly<FaithAdminCommand>, "execute">[];
}
export interface FaithAdminNumericOperation {
  actorUid: number;
  targetUid: number;
  delta: number;
  /** 全体操作时提供。业务应将其作为事务幂等键，避免平台事件重投导致重复修改。 */
  operationId?: string;
}
export interface FaithAdminNumericField {
  name: string;
  description?: string;
  change(operation: FaithAdminNumericOperation): void | string | Promise<void | string>;
}
export interface FaithAdminNumericFieldsApi {
  register(field: FaithAdminNumericField): FaithDisposable;
  get(name: string): Readonly<FaithAdminNumericField> | undefined;
  list(): Readonly<FaithAdminNumericField>[];
}
