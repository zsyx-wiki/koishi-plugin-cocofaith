import { defineBuiltInGameplay } from "../../framework/built-in";
import { createVoidPrayerModule } from "./module";
import { VOID_PRAYER_CONFIG } from "./config";
export * from "./config";
export * from "./module";
export * from "./pool";
export * from "./service";
export * from "./types";

export default defineBuiltInGameplay({
  name: "void_prayer",
  description: "虚空祈求",
  order: 20,
  config: { key: "voidPrayer", definition: VOID_PRAYER_CONFIG },
  create: createVoidPrayerModule,
});
