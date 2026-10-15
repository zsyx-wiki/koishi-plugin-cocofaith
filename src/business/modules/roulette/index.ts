import { defineBuiltInGameplay } from "../../framework/built-in";
import { createRouletteModule } from "./module";
import { ROULETTE_CONFIG } from "./config";
export * from "./config";
export * from "./engine";
export * from "./messages";
export * from "./module";
export * from "./progress";
export * from "./protection";
export * from "./registry";
export * from "./service";
export * from "./types";

export default defineBuiltInGameplay({
  name: "roulette",
  description: "恶魔轮盘",
  order: 70,
  config: { key: "roulette", definition: ROULETTE_CONFIG },
  create: createRouletteModule,
});
