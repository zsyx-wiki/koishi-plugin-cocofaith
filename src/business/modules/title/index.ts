import { defineBuiltInGameplay } from "../../framework/built-in";
import { createTitleModule } from "./module";
export * from "./data";
export * from "./module";
export * from "./registry";
export * from "./service";
export * from "./types";

export default defineBuiltInGameplay({
  name: "title",
  description: "称号",
  order: 50,
  create: createTitleModule,
});
