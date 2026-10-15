import { defineBuiltInGameplay } from "../../framework/built-in";
import { createBindingModule } from "./module";
import { BINDING_CONFIG } from "./config";
export * from "./config";
export * from "./module";
export * from "./service";

export default defineBuiltInGameplay({
  name: "binding",
  description: "平台身份绑定",
  order: 100,
  config: { key: "binding", definition: BINDING_CONFIG },
  create: createBindingModule,
});
