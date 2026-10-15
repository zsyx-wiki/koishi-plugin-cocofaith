import { defineBuiltInGameplay } from "../../framework/built-in";
import { createFaithAdminModule } from "./module";
export * from "./commands";
export * from "./fields";
export * from "./module";
export * from "./service";

export default defineBuiltInGameplay({
  name: "faith_admin",
  description: "创造者管理",
  order: 10,
  create: createFaithAdminModule,
});
