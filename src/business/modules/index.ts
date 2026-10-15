import { createBuiltInBusinessModule } from "../framework/built-in";
import { BUILT_IN_GAMEPLAYS } from "./catalog";

export * from "./catalog";

export function createBuiltInBusinessModules() {
  return BUILT_IN_GAMEPLAYS.map(createBuiltInBusinessModule);
}

export const BUILT_IN_BUSINESS_MODULES = createBuiltInBusinessModules();

export function registerBuiltInBusinessModules(
  service: import("../framework/service").FaithBusinessService,
) {
  return createBuiltInBusinessModules().map((module) => service.register(module));
}
