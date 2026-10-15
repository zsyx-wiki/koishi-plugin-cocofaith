import { defineBuiltInGameplay } from "../../framework/built-in";
import { createRoomsModule } from "./module";
export * from "./module";
export * from "./service";
export * from "./types";

export default defineBuiltInGameplay({
  name: "rooms",
  description: "游戏房间",
  order: 60,
  create: createRoomsModule,
});
