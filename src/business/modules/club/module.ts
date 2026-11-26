import { registerClubAdmin } from "./admin";
import { createClubCommands } from "./commands";
import { lazyCompatibilityValue } from "../../framework/compatibility";
import {
  defineGameplay,
  provideGameplayInterface,
  useGameplayInterface,
} from "cocofaith-sdk/gameplay";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { CLUB_API, TITLE_API } from "../../contracts/tokens";
import { CLUB_CONFIG } from "./config";
import { CLUB_IDENTITY } from "./data";
import { ClubService } from "./service";
export function createClubGameplay() {
  return defineGameplay({
    name: "club",
    dependencies: ["faith_admin", "title"],
    config: CLUB_CONFIG,
    setup(context) {
      context.core.registerTable(
        {
          key: "string",
          kind: "string",
          uid: "unsigned",
          gold: "double",
          ascension_score: "double",
          weight: "double",
          status: "string",
          version: "unsigned",
          created_at: "timestamp",
          updated_at: "timestamp",
        },
        { primary: "key", indexes: [["kind", "status"], "uid"] },
      );
      context.track(context.core.statusIdentities.register(CLUB_IDENTITY));
      const titles = useGameplayInterface(context, TITLE_API);
      const service = new ClubService(context.core, titles, context.config);
      provideGameplayInterface(
        context,
        CLUB_API,
        Object.freeze({ status: service.status.bind(service), pool: service.pool.bind(service) }),
        { version: "1.0.0" },
      );
      context.core.lifecycle.onGameDay(
        async (event) => {
          await service.renewAll(event.date);
        },
        {
          name: "club.daily-fees",
          priority: 100,
          critical: false,
        },
      );
      registerClubAdmin(context, service);

      return service;
    },
    ready(service) {
      return service.initialize();
    },
    reload(service, config) {
      service.configure(config);
    },
    commands: createClubCommands(),
  });
}

export function createClubModule() {
  return adaptGameplayDefinition(createClubGameplay());
}
/** @deprecated 兼容单例；新代码通过玩法声明按需创建模块。 */
export const clubModule = lazyCompatibilityValue(createClubModule);
