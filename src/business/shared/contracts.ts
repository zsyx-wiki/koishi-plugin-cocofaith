import { defineGameplayContribution, defineGameplayInterface } from "cocofaith-sdk/gameplay";
import type { FaithAdminCommandsApi } from "../modules/faith-admin/commands";
import type { FaithAdminNumericFieldsApi } from "../modules/faith-admin/fields";
import type { GameRoomsApi } from "../modules/rooms";
import type { RouletteGameplayApi } from "../modules/roulette";
import type { TitleServiceApi } from "../modules/title";
export const TITLE_API = defineGameplayInterface<TitleServiceApi>("title");
export const ROOMS_API = defineGameplayInterface<GameRoomsApi>("rooms");
export const ROULETTE_API = defineGameplayInterface<RouletteGameplayApi>("roulette");
export const ADMIN_FIELDS_API = defineGameplayInterface<FaithAdminNumericFieldsApi>("faith_admin", "numeric-fields");
export const ADMIN_COMMANDS_API = defineGameplayInterface<FaithAdminCommandsApi>("faith_admin", "commands");
export const FAITH_INFO = defineGameplayContribution<{
    uid: number;
}, string>("faith.info");
export const FAITH_BEFORE_ABANDON = defineGameplayContribution<{
    uid: number;
    targetFaith: string;
}, string>("faith.before-abandon");
export const BINDING_API = defineGameplayInterface<Pick<import("../modules/binding/service").BindingService, "userInfo">>("binding");
export const CLUB_API = defineGameplayInterface<Pick<import("../modules/club/service").ClubService, "status" | "pool">>("club");
export const DAILY_PRAYER_API = defineGameplayInterface<Pick<import("../modules/daily-prayer/service").DailyPrayerService, "status">>("daily_prayer");
export const VOID_PRAYER_API = defineGameplayInterface<Pick<import("../modules/void-prayer/service").VoidPrayerService, "status">>("void_prayer");
export const COLLECTION_API = defineGameplayInterface<import("../modules/collection/module").CollectionApi>("collection");
export const CONTAINER_API = defineGameplayInterface<import("../modules/container/types").ContainerGameplayApi>("container");
export const FAITH_REGISTRY_API = defineGameplayInterface<Pick<import("cocofaith-sdk/core").FaithBusinessCoreScope["faiths"], "get" | "has" | "all" | "byPath">>("faith", "registry");
