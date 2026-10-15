import { defineBuiltInGameplay } from "../../framework/built-in";
import { createJunkModule } from "./module";
import { JUNK_CONFIG } from "./config";
export * from "./config";
export * from "./module";
export * from "./service";
export * from "./types";

export default defineBuiltInGameplay({
  name: "junk",
  description: "捡垃圾",
  order: 40,
  config: { key: "junk", definition: JUNK_CONFIG },
  create: createJunkModule,
});
