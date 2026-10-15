import { defineBuiltInGameplay } from "../../framework/built-in";
import { createDailyPrayerModule } from "./module";
import { DAILY_PRAYER_CONFIG } from "./config";
export * from "./config";
export * from "./module";
export * from "./service";
export * from "./types";

export default defineBuiltInGameplay({
  name: "daily_prayer",
  description: "每日祈祷",
  order: 30,
  config: { key: "dailyPrayer", definition: DAILY_PRAYER_CONFIG },
  create: createDailyPrayerModule,
});
