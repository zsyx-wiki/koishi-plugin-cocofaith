import type { FaithDisposable } from "cocofaith-sdk/core";
/** Lifecycle rejection is not a partial calculation: callers must fail outside the unavailable module. */
export const MODULE_NOT_READY = "MODULE_NOT_READY";

export function isLifecycleUnavailableError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === MODULE_NOT_READY
  );
}

// Internal Core/Business bridge. Symbol.for keeps separately bundled entrypoints interoperable.
export const SUSPEND_BONUS_PROVIDERS = Symbol.for("cocofaith.internal.suspend-bonus-providers");

export interface BonusTransitionScope {
  [SUSPEND_BONUS_PROVIDERS]?: (assertAvailable: () => void) => FaithDisposable;
}

export function suspendScopeBonusProviders(scope: object, assertAvailable: () => void) {
  return (scope as BonusTransitionScope)[SUSPEND_BONUS_PROVIDERS]?.(assertAvailable);
}
