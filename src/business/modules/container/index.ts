import { defineBuiltInGameplay } from "../../framework/built-in";
import { createContainerModule } from "./module";
import { CONTAINER_CONFIG } from "./config";
export * from "./commands";
export * from "./config";
export * from "./data";
export * from "./messages";
export * from "./module";
export * from "./service";
export * from "./state";
export * from "./types";

export default defineBuiltInGameplay({
  name: "container",
  description: "神性容器",
  order: 120,
  config: { key: "container", definition: CONTAINER_CONFIG },
  create: createContainerModule,
});
