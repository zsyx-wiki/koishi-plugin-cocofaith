import { defineGameplay, defineGameplayState, defineGameplayConfig, defineGameplayParameters, gameplayArgument, gameplayInteger } from "cocofaith-sdk/gameplay";
import { createGameplayTestHarness } from "cocofaith-sdk/testing";
import { defineAdvancedGameplay } from "../../src/business/framework/types";
import type { FaithBusinessService } from "../../src/business/framework/service";

const config = defineGameplayConfig({ amount: gameplayInteger(1) });
const state = defineGameplayState({ defaults: { count: 0 }, parse(value) {
  const data = value as { count: number };
  if (!Number.isSafeInteger(data.count)) throw new TypeError("count");
  return { count: data.count };
} });
const parameters = defineGameplayParameters({ amount: gameplayArgument(gameplayInteger(1)) });
const game = defineGameplay({ name: "typed_game", config, state,
  commands: [{ id: "add", triggers: ["add"], parameters, atomic: "user", run({ params, state, config }) {
    state.data.count += params.amount + config.amount;
    return "ok";
  } }],
});
declare const host: FaithBusinessService;
host.register(game);
createGameplayTestHarness(game).run("add", ["1"]);
const advanced = defineAdvancedGameplay({ name: "advanced_typed", config,
  commands: [{ id: "read", triggers: ["read"], run({ config }) {
    const value: number = config.amount;
    // @ts-expect-error Config is inferred from the same declaration as simple gameplay.
    const wrong: string = config.amount;
    return String(value);
  } }],
});
host.register(advanced);
