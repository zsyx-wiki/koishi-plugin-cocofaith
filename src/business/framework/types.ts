import type { FaithBusinessCoreScope, FaithDisposable } from "cocofaith-sdk/core";
import {
  commandEntries,
  type CommandCollection,
  normalizeGameplayResult,
} from "cocofaith-sdk/gameplay";
import type { BusinessEvent } from "cocofaith-sdk/protocol";
import type {
  BusinessContributionHandler,
  BusinessContributionOptions,
  BusinessContributionResult,
} from "./contributions";
export type BusinessModuleState =
  | "registered"
  | "disabled"
  | "initializing"
  | "initialized"
  | "readying"
  | "ready"
  | "reloading"
  | "disposing"
  | "failed"
  | "disposed";
export type BusinessScene = "group" | "private";
export type {
  GameplayDeliveryOptions as BusinessDeliveryOptions,
  GameplayImageNode as MessageImageNode,
  GameplaySilentResult as MessageSilentNode,
  GameplayTextNode as MessageTextNode,
} from "cocofaith-sdk/gameplay";
export type {
  BusinessAdapterInfo,
  BusinessDispatchResult,
  BusinessEvent,
} from "cocofaith-sdk/protocol";
export type MessageNode =
  | import("cocofaith-sdk/gameplay").GameplayTextNode
  | import("cocofaith-sdk/gameplay").GameplayImageNode;
export type BusinessResult = import("cocofaith-sdk/gameplay").GameplayResult;
export interface BusinessInterfaceOptions {
  version?: string;
}
export interface BusinessModuleContext<C = Record<string, unknown>> {
  readonly name: string;
  readonly core: FaithBusinessCoreScope;
  readonly config: Readonly<C>;
  provide<T>(name: string, value: T, options?: BusinessInterfaceOptions): FaithDisposable;
  use<T>(business: string, name?: string): T;
  contribute<I, O>(
    slot: string,
    handler: BusinessContributionHandler<I, O>,
    options: BusinessContributionOptions,
  ): FaithDisposable;
  collect<I, O>(slot: string, input: Readonly<I>): Promise<BusinessContributionResult<O>>;
}
export interface BusinessExecutionContext<C = Record<string, unknown>>
  extends BusinessModuleContext<C> {
  readonly uid: number;
}
export interface BusinessCommandContext<C = Record<string, unknown>>
  extends BusinessModuleContext<C> {
  readonly uid: number | null;
  readonly event: Readonly<BusinessEvent>;
  readonly args: readonly string[];
  readonly path: readonly string[];
}
export interface BusinessCommand<C = Record<string, unknown>> {
  readonly id: string;
  readonly commands: readonly string[];
  /** 用于祷词等动态内容；仅在没有普通根命令命中时执行，必须是无副作用的同步判断。 */
  readonly match?: (content: string) => boolean;
  readonly description?: string;
  readonly scenes?: readonly BusinessScene[];
  readonly allowUnregistered?: boolean;
  readonly children?: readonly BusinessCommand<C>[];
  execute?(context: BusinessCommandContext<C>): Promise<BusinessResult> | BusinessResult;
}
export type LegacyModuleResult<T> =
  | {
      ok: true;
      code: string;
      data: T;
    }
  | {
      ok: false;
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
export interface FaithBusinessModule<I = unknown, O = unknown, C = Record<string, unknown>> {
  readonly name: string;
  readonly dependencies?: readonly string[];
  readonly defaultConfig?: C;
  readonly commands?: readonly BusinessCommand<C>[];
  validateConfig?(config: unknown): C;
  init?(context: BusinessModuleContext<C>): void | Promise<void>;
  ready?(context: BusinessModuleContext<C>): void | Promise<void>;
  reload?(context: BusinessModuleContext<C>, previousConfig: Readonly<C>): void | Promise<void>;
  dispose?(context: BusinessModuleContext<C>): void | Promise<void>;
  execute?(context: BusinessExecutionContext<C>, input: I): Promise<LegacyModuleResult<O>>;
}
export interface BusinessModuleConfig {
  enabled?: boolean;
  config?: Record<string, unknown>;
}
export type Config = {
  modules: Record<string, BusinessModuleConfig>;
} & {
  [K in keyof typeof import("../config-catalog").BUILT_IN_CONFIGS]?: BusinessModuleConfig;
};
export interface BusinessModuleStatus {
  name: string;
  state: BusinessModuleState;
  enabled: boolean;
  dependencies: readonly string[];
  error?: string;
}
export function defineBusinessModule<I = never, O = never, C = Record<string, unknown>>(
  module: FaithBusinessModule<I, O, C>,
) {
  return module;
}
export interface AdvancedGameplayCommand<C = Record<string, unknown>> {
  readonly id: string;
  readonly triggers: readonly string[];
  readonly description?: string;
  readonly scenes?: readonly BusinessScene[];
  readonly guest?: boolean;
  readonly match?: (content: string) => boolean;
  readonly children?: CommandCollection<AdvancedGameplayCommand<C> | BusinessCommand<C>>;
  run?(
    context: BusinessCommandContext<C>,
  ):
    | import("cocofaith-sdk/gameplay").GameplayOutput
    | Promise<import("cocofaith-sdk/gameplay").GameplayOutput>;
}
export type AdvancedGameplayModule<I = never, O = never, C = Record<string, unknown>> = Omit<
  FaithBusinessModule<I, O, C>,
  "commands"
> & {
  readonly config?: import("cocofaith-sdk/gameplay").GameplayConfigDefinition<
    C & Record<string, unknown>
  >;
  readonly commands?: CommandCollection<AdvancedGameplayCommand<C> | BusinessCommand<C>>;
};
export function defineAdvancedGameplay<I = never, O = never, C = Record<string, unknown>>(
  module: AdvancedGameplayModule<I, O, C>,
): FaithBusinessModule<I, O, C>;
/** @deprecated Prefer triggers/run/guest in new advanced gameplay definitions. */
export function defineAdvancedGameplay<I = never, O = never, C = Record<string, unknown>>(
  module: FaithBusinessModule<I, O, C>,
): FaithBusinessModule<I, O, C>;
export function defineAdvancedGameplay<I, O, C>(
  module: AdvancedGameplayModule<I, O, C> | FaithBusinessModule<I, O, C>,
): FaithBusinessModule<I, O, C> {
  const adapt = (
    command: AdvancedGameplayCommand<C> | BusinessCommand<C>,
    depth = 0,
  ): BusinessCommand<C> => {
    if (depth > 16) throw new TypeError(`玩法 ${module.name} 的命令嵌套超过 16 层`);
    const children = command.children
      ? commandEntries<AdvancedGameplayCommand<C> | BusinessCommand<C>>(command.children).map(
          (child) => adapt(child, depth + 1),
        )
      : undefined;
    if ("commands" in command) return children ? { ...command, children } : command;
    return {
      id: command.id,
      commands: command.triggers,
      description: command.description,
      scenes: command.scenes,
      allowUnregistered: command.guest,
      match: command.match,
      children,
      execute: command.run
        ? async (context) => normalizeGameplayResult(await command.run!(context))
        : undefined,
    };
  };
  return {
    ...module,
    defaultConfig:
      "config" in module && module.config ? (module.config.defaults as C) : module.defaultConfig,
    validateConfig:
      "config" in module && module.config
        ? (value) => module.config!.parse(value)
        : module.validateConfig,
    commands: module.commands
      ? commandEntries<AdvancedGameplayCommand<C> | BusinessCommand<C>>(module.commands).map(
          (command) => adapt(command),
        )
      : undefined,
  };
}
