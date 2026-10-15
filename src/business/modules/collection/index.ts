import { defineBuiltInGameplay } from "../../framework/built-in";
import { createCollectionModule } from "./module";
export * from "./catalog";
export * from "./module";
export * from "./service";

export default defineBuiltInGameplay({
  name: "collection",
  description: "图鉴",
  order: 90,
  create: createCollectionModule,
});
