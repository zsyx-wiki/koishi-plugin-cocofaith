import type { FaithBusinessCoreScope, FaithLifecycleScope } from "cocofaith-sdk/core";
import type { InterfaceInvocation } from "./interfaces";

/** Typed registration boundaries; no method-name/argument-position callback table. */
export function createOwnedCoreScope(
  core: FaithBusinessCoreScope,
  run: InterfaceInvocation,
): FaithBusinessCoreScope {
  const lifecycleCallbacks = {
    onGameDay: (handler, options) =>
      core.lifecycle.onGameDay((...args) => run(() => handler(...args)), options),
    onReload: (handler, options) =>
      core.lifecycle.onReload((...args) => run(() => handler(...args)), options),
  } satisfies Pick<FaithLifecycleScope, "onGameDay" | "onReload">;
  const lifecycle = new Proxy(core.lifecycle, {
    get(target, key) {
      if (Object.hasOwn(lifecycleCallbacks, key))
        return lifecycleCallbacks[key as keyof typeof lifecycleCallbacks];
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const hooks: FaithBusinessCoreScope["hooks"] = {
    ...core.hooks,
    on: <T, R = void>(
      event: string,
      handler: (payload: T) => R | Promise<R>,
      options?: Parameters<FaithBusinessCoreScope["hooks"]["on"]>[2],
    ) => core.hooks.on<T, R>(event, (...args) => run(() => handler(...args)), options),
  };
  const bonuses: FaithBusinessCoreScope["bonuses"] = {
    ...core.bonuses,
    registerProvider: (provider, options) =>
      core.bonuses.registerProvider((...args) => run(() => provider(...args)), options),
  };
  const apis = { lifecycle, hooks, bonuses } satisfies Pick<
    FaithBusinessCoreScope,
    "lifecycle" | "hooks" | "bonuses"
  >;
  return new Proxy(core, {
    get(target, key) {
      if (Object.hasOwn(apis, key)) return apis[key as keyof typeof apis];
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
