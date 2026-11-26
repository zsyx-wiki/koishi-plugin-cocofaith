import { FaithCoreError } from "../errors";
import type { CoreDatabase } from "../transaction/service";
import type { FaithCoreUserData, UserValueDelta } from "../types";

/** Internal row primitives: no locks, transactions, Hooks or audit side effects. */
const USER_VALUE_FIELDS = new Set([
  "gold",
  "ascension_score",
  "audience_score",
  "audience_rank",
  "abandon_count",
]);
export function userValueQuery(user: FaithCoreUserData) {
  return {
    uid: user.uid,
    gold: user.gold,
    ascension_score: user.ascension_score,
    audience_score: user.audience_score,
    audience_rank: user.audience_rank,
    abandon_count: user.abandon_count,
  };
}
export function userStateQuery(user: FaithCoreUserData) {
  return {
    ...userValueQuery(user),
    profession_id: user.profession_id,
    status: user.status,
    status_reason: user.status_reason,
  };
}
export function validateUserValues(user: FaithCoreUserData) {
  for (const key of USER_VALUE_FIELDS)
    if (
      !Number.isFinite(user[key as keyof UserValueDelta]) ||
      Math.abs(user[key as keyof UserValueDelta]) > Number.MAX_SAFE_INTEGER
    )
      throw new FaithCoreError("VALIDATION_FAILED", `数值运算溢出或超出安全范围：${key}`);
  if (!Number.isSafeInteger(user.audience_rank) || user.audience_rank < 0)
    throw new FaithCoreError("VALIDATION_FAILED", "觐见之梯必须是非负安全整数");
}
export async function assertUserWrite(
  database: CoreDatabase,
  query: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  const result = await database.set("faith_core_users_data", query as never, patch as never);
  if (result.matched !== 1)
    throw new FaithCoreError("TRANSACTION_CONFLICT", "用户数据已被其他实例修改，请重试", {
      uid: Number(query.uid),
    });
}
export function validateDelta(delta: UserValueDelta) {
  const entries = Object.entries(delta);
  if (!entries.length) throw new FaithCoreError("VALIDATION_FAILED", "数值变更不能为空");
  for (const [key, value] of entries) {
    if (!USER_VALUE_FIELDS.has(key))
      throw new FaithCoreError("VALIDATION_FAILED", `不允许修改用户数值字段：${key}`);
    if (!Number.isFinite(value))
      throw new FaithCoreError("VALIDATION_FAILED", `数值变更必须是有限数字：${key}`);
    if ((key === "audience_rank" || key === "abandon_count") && !Number.isSafeInteger(value))
      throw new FaithCoreError("VALIDATION_FAILED", `${key} 变更必须是安全整数`);
  }
}

export function applyUserDelta(
  before: FaithCoreUserData,
  delta: UserValueDelta,
): FaithCoreUserData {
  validateDelta(delta);
  const after = { ...before };
  for (const key of Object.keys(delta) as (keyof UserValueDelta)[]) {
    const value = delta[key];
    if (value !== undefined) after[key] += value;
  }
  validateUserValues(after);
  if (after.abandon_count < 0 || !Number.isSafeInteger(after.abandon_count))
    throw new FaithCoreError("VALIDATION_FAILED", "弃誓次数不能为负数且必须是安全整数");
  return after;
}
