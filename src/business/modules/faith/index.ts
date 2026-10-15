import { defineBuiltInGameplay } from "../../framework/built-in";
import { createFaithModule } from "./module";
import { FAITH_CONFIG } from "./config";
export * from "./config";
export * from "./module";
export * from "./open";
export * from "./sale";
export * from "./service";

export default defineBuiltInGameplay({
  name: "faith",
  description: "信仰基础",
  order: 0,
  config: { key: "faith", definition: FAITH_CONFIG },
  create: createFaithModule,
});
