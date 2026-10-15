import type { FaithCoreError } from "cocofaith-sdk/core";
import { provideGameplayInterface, useGameplayInterface } from "cocofaith-sdk/gameplay";
import { defineAdvancedGameplay } from "../../framework/types";
import { CONTAINER_API, ROULETTE_API, TITLE_API } from "../../shared/contracts";
import { registerContainerAdmin } from "./admin";
import { createContainerCommands } from "./commands";
import { CONTAINER_CONFIG, type ContainerConfig } from "./config";
import { CONTAINER_IDENTITY, CONTAINER_ITEMS } from "./data";
import { ContainerService } from "./service";
export function createContainerModule() {
    let service: ContainerService;
    return defineAdvancedGameplay<never, never, ContainerConfig>({
        name: "container",
        dependencies: ["faith_admin", "title", "roulette"],
        config: CONTAINER_CONFIG,
        init(context) {
            for (const item of CONTAINER_ITEMS)
                context.core.items.register(item);
            context.core.lifecycle.track(context.core.statusIdentities.register(CONTAINER_IDENTITY));
            service = new ContainerService(context.core, useGameplayInterface(context, TITLE_API), useGameplayInterface(context, ROULETTE_API), context.config);
            provideGameplayInterface(context, CONTAINER_API, Object.freeze({ grant: service.grant.bind(service), status: service.status.bind(service) }), { version: "1.0.0" });
            context.core.lifecycle.track(context.core.bonuses.registerProvider(({ uid, type }) => service.bonusContributions(uid, type), {
                id: "container-bonuses", types: ["gold", "ascension_score", "void_prayer.daily_limit", "daily_prayer.daily_limit"],
            }));
            context.core.lifecycle.onGameDay((event) => service.renewAll(event.date), {
                name: "container.daily", priority: 50, critical: false
            });
            context.core.lifecycle.track(context.core.hooks.on<{
                maxLevelUids?: readonly number[];
            }>("business/roulette/settled", async ({ maxLevelUids = [] }) => {
                for (const uid of maxLevelUids) {
                    try {
                        await service.grant(uid, "roulette_max_level", `container:roulette-max:${uid}`);
                    }
                    catch (error) {
                        if ((error as FaithCoreError).code !== "IDEMPOTENCY_CONFLICT")
                            throw error;
                    }
                }
            }));
            registerContainerAdmin(context, service);
        },
        ready() {
            return service.restorePersistentDefinitions();
        },
        reload(context) {
            service.configure(context.config);
        },
        commands: createContainerCommands(() => service),
    });
}
export const containerModule = createContainerModule();
