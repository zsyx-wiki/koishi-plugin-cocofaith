import type { GameplayConfigDefinition } from "cocofaith-sdk/gameplay";
import type { FaithBusinessModule } from "./types";

export interface BuiltInGameplay {
  name: string;
  description: string;
  order?: number;
  config?: {
    key: string;
    definition: GameplayConfigDefinition<any>;
  };
  create(): FaithBusinessModule<any, any, any>;
}

export function defineBuiltInGameplay<const T extends BuiltInGameplay>(definition: T) {
  return Object.freeze({ ...definition, order: definition.order ?? 1000 });
}

export function collectBuiltInGameplays<const T extends readonly BuiltInGameplay[]>(
  definitions: T,
): readonly T[number][] {
  const names = new Set<string>();
  const configKeys = new Set<string>();
  for (const definition of definitions) {
    if (
      typeof definition.name !== "string" ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(definition.name) ||
      names.has(definition.name)
    ) {
      throw new TypeError(`内置玩法名称无效或重复：${definition.name}`);
    }
    if (typeof definition.create !== "function")
      throw new TypeError(`玩法 ${definition.name} 缺少创建函数`);
    if (!Number.isFinite(definition.order ?? 1000)) {
      throw new TypeError(`玩法 ${definition.name} 的加载顺序无效`);
    }
    names.add(definition.name);
    if (!definition.config) continue;
    const key = definition.config.key;
    if (
      !/^[a-z][a-zA-Z0-9_]{0,63}$/.test(key) ||
      ["modules", "constructor", "prototype", "__proto__"].includes(key) ||
      configKeys.has(key)
    ) {
      throw new TypeError(`内置玩法配置键无效或重复：${key}`);
    }
    configKeys.add(key);
  }
  return Object.freeze(
    [...definitions].sort(
      (left, right) =>
        (left.order ?? 1000) - (right.order ?? 1000) || left.name.localeCompare(right.name),
    ),
  );
}

type BuiltInConfigs<T extends readonly BuiltInGameplay[]> = {
  [Entry in T[number] as Entry extends { config: { key: infer Key extends string } }
    ? Key
    : never]: Entry extends { config: { definition: infer Definition } }
    ? { module: Entry["name"]; description: string; definition: Definition }
    : never;
};

export function builtInConfigs<const T extends readonly BuiltInGameplay[]>(
  definitions: T,
): BuiltInConfigs<T> {
  return Object.fromEntries(
    definitions.flatMap((entry) =>
      entry.config
        ? [
            [
              entry.config.key,
              {
                module: entry.name,
                description: entry.description,
                definition: entry.config.definition,
              },
            ],
          ]
        : [],
    ),
  ) as BuiltInConfigs<T>;
}

export function createBuiltInBusinessModule(definition: BuiltInGameplay): FaithBusinessModule {
  const module = definition.create();
  if (module.name !== definition.name) {
    throw new Error(`玩法声明 ${definition.name} 与模块 ${module.name} 不一致`);
  }
  const config = definition.config?.definition;
  if (!config) return module;
  return {
    ...module,
    defaultConfig: module.defaultConfig ?? config.defaults,
    validateConfig: module.validateConfig ?? ((value) => config.parse(value)),
  };
}
