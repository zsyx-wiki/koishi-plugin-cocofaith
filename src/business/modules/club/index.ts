import { defineBuiltInGameplay } from "../../framework/built-in";
import { createClubModule } from "./module";
import { CLUB_CONFIG } from "./config";
export * from "./config";
export * from "./data";
export * from "./module";
export * from "./service";
export * from "./types";

export default defineBuiltInGameplay({
  name: "club",
  description: "椰汁俱乐部",
  order: 110,
  config: { key: "club", definition: CLUB_CONFIG },
  create: createClubModule,
});
