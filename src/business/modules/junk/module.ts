import { JUNK_MESSAGES } from "./messages";
import {
  defineGameplay,
  defineGameplayState,
  gameplayString,
  gameplayBoolean,
} from "cocofaith-sdk/gameplay";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { formatItem } from "../../shared/item-format";
import { JUNK_CONFIG } from "./config";
import { JunkService } from "./service";
export const junkState = defineGameplayState({
  fields: {
    date: gameplayString(""),
    freeUsed: gameplayBoolean(false),
    paidUsed: gameplayBoolean(false),
  },
});

export function createJunkGameplay() {
  return defineGameplay({
    name: "junk",
    dependencies: ["faith"],
    config: JUNK_CONFIG,
    state: junkState,
    setup({ core, config }) {
      return {
        picker: new JunkService(core, config),
        item: (name: string) => core.items.require(name),
      };
    },
    commands: {
      junk: {
        triggers: ["捡垃圾"],
        scenes: ["group"],
        description: "从虚空中捞取可开启物品",
        atomic: "user",
        async run({ tx, state, service }) {
          const result = await service.picker.pickInTransaction(tx, state.data, state.gameDay);
          const counts = new Map<string, number>();
          for (const name of result.items) counts.set(name, (counts.get(name) ?? 0) + 1);
          return JUNK_MESSAGES.result(
            result.cost,
            [...counts]
              .map(([name, count]) => `${formatItem(service.item(name))}×${count}`)
              .join("\n"),
          );
        },
      },
    },
  });
}
export function createJunkModule() {
  return adaptGameplayDefinition(createJunkGameplay());
}
export const junkModule = createJunkModule();
