import type { FaithBusinessService } from "../framework/service";
import { createAboutModule } from "./about";
import { createBindingModule } from "./binding";
import { createClubModule } from "./club";
import { createCollectionModule } from "./collection";
import { createContainerModule } from "./container";
import { createDailyPrayerModule } from "./daily-prayer";
import { createFaithModule } from "./faith";
import { createFaithAdminModule } from "./faith-admin";
import { createJunkModule } from "./junk";
import { createRoomsModule } from "./rooms";
import { createRouletteModule } from "./roulette";
import { createTitleModule } from "./title";
import { createVoidPrayerModule } from "./void-prayer";
export function createBuiltInBusinessModules() {
    return [
        createFaithModule(),
        createFaithAdminModule(),
        createVoidPrayerModule(),
        createDailyPrayerModule(),
        createJunkModule(),
        createTitleModule(),
        createRoomsModule(),
        createRouletteModule(),
        createAboutModule(),
        createCollectionModule(),
        createBindingModule(),
        createClubModule(),
        createContainerModule(),
    ] as const;
}
export const BUILT_IN_BUSINESS_MODULES = createBuiltInBusinessModules();
export function registerBuiltInBusinessModules(service: FaithBusinessService) {
    return createBuiltInBusinessModules().map((module) => service.register(module));
}
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
