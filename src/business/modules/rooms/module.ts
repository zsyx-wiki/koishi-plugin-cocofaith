import { lazyCompatibilityValue } from "../../framework/compatibility";
import { provideGameplayInterface } from "cocofaith-sdk/gameplay";
import { defineAdvancedGameplay } from "../../framework/types";
import { ROOMS_API } from "../../shared/contracts";
import { GameRoomService } from "./service";
export function createRoomsModule() {
  let rooms: GameRoomService;
  return defineAdvancedGameplay({
    name: "rooms",
    init(ctx) {
      ctx.core.registerTable(
        {
          key: "string",
          active: "boolean",
          version: "unsigned",
          room: "json",
        },
        { primary: "key", indexes: ["active"] },
      );
      rooms = new GameRoomService(ctx.core);
      provideGameplayInterface(ctx, ROOMS_API, {
        register: rooms.register.bind(rooms),
        create: rooms.create.bind(rooms),
        command: rooms.command.bind(rooms),
        progress: rooms.progress.bind(rooms),
        updateProgress: rooms.updateProgress.bind(rooms),
      });
    },
    ready: () => rooms.load(),
    dispose: () => rooms.close(),
  });
}
/** @deprecated 兼容单例；新代码通过玩法声明按需创建模块。 */
export const roomsModule = lazyCompatibilityValue(createRoomsModule);
