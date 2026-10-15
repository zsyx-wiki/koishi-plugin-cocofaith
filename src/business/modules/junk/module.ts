import type { GameplayAtomicCommandContext, GameplaySetupContext } from "cocofaith-sdk/gameplay";
import {
  defineGameplay,
  defineGameplayState,
  gameplayBoolean,
  gameplayString,
} from "cocofaith-sdk/gameplay";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { formatItem } from "../../shared/item-format";
import { JUNK_CONFIG } from "./config";
import { JUNK_MESSAGES } from "./messages";
import { JunkService } from "./service";
import type { JunkConfig, JunkState } from "./types";
export const junkState = defineGameplayState({
  fields: {
    date: gameplayString(""),
    freeUsed: gameplayBoolean(false),
    paidUsed: gameplayBoolean(false),
  },
});

type Context = GameplayAtomicCommandContext<JunkConfig, ReturnType<typeof setupJunk>, JunkState>;

function setupJunk({ core, config }: GameplaySetupContext<JunkConfig>) {
  return {
    picker: new JunkService(core, config),
    item: (name: string) => core.items.require(name),
  };
}

async function pickJunk({ tx, state, service }: Context) {
  const result = await service.picker.pickInTransaction(tx, state.data, state.gameDay);
  const counts = new Map<string, number>();
  for (const name of result.items) counts.set(name, (counts.get(name) ?? 0) + 1);
  return JUNK_MESSAGES.result(
    result.cost,
    [...counts].map(([name, count]) => `${formatItem(service.item(name))}×${count}`).join("\n"),
  );
}

export function createJunkGameplay() {
  return defineGameplay({
    name: "junk",
    dependencies: ["faith"],
    config: JUNK_CONFIG,
    state: junkState,
    setup: setupJunk,
    commands: {
      junk: {
        triggers: ["捡垃圾"],
        scenes: ["group"],
        description: "从虚空中捞取可开启物品",
        atomic: "user",
        run: pickJunk,
      },
    },
  });
}
export function createJunkModule() {
  return adaptGameplayDefinition(createJunkGameplay());
}
export const junkModule = createJunkModule();
