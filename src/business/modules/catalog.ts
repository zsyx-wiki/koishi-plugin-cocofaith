// 由 scripts/generate-gameplays.cjs 生成，玩法声明位于各目录 index.ts。
import { collectBuiltInGameplays } from "../framework/built-in";
import about from "./about";
import binding from "./binding";
import club from "./club";
import collection from "./collection";
import container from "./container";
import daily_prayer from "./daily-prayer";
import faith from "./faith";
import faith_admin from "./faith-admin";
import junk from "./junk";
import rooms from "./rooms";
import roulette from "./roulette";
import title from "./title";
import void_prayer from "./void-prayer";

export const BUILT_IN_GAMEPLAYS = collectBuiltInGameplays([
  about,
  binding,
  club,
  collection,
  container,
  daily_prayer,
  faith,
  faith_admin,
  junk,
  rooms,
  roulette,
  title,
  void_prayer,
] as const);

export * from "./about";
export * from "./binding";
export * from "./club";
export * from "./collection";
export * from "./container";
export * from "./daily-prayer";
export * from "./faith";
export * from "./faith-admin";
export * from "./junk";
export * from "./rooms";
export * from "./roulette";
export * from "./title";
export * from "./void-prayer";
