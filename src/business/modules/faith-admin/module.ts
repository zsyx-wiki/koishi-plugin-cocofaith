import { ADMIN_MESSAGES } from "./messages";
import type { BusinessCommandContext } from "../../framework/types";
import type { GameplayOutput } from "cocofaith-sdk/gameplay";
import { provideGameplayInterface } from "cocofaith-sdk/gameplay";
import { createHash, randomUUID } from "node:crypto";
import { BusinessError } from "../../framework/errors";
import { defineAdvancedGameplay } from "../../framework/types";
import { ADMIN_COMMANDS_API, ADMIN_FIELDS_API } from "../../shared/contracts";
import { FaithAdminService } from "./service";
export function createFaithAdminModule() {
  let admin: FaithAdminService;
  async function handleFaithAdmin(ctx: BusinessCommandContext): Promise<GameplayOutput> {
    if (ctx.uid === null || !(await admin.isCreator(ctx.uid))) return { type: "silent" };
    if (!admin.commands.get("数值"))
      throw new BusinessError(
        "MODULE_NOT_READY",
        "管理命令尚未就绪，请重新加载 CoCoFaith Business。",
      );
    const [name, ...args] = ctx.args,
      command = name ? admin.commands.get(name) : undefined;
    if (!command)
      throw new BusinessError(
        "INVALID_INPUT",
        ADMIN_MESSAGES.commands(admin.commands.list().map((item) => item.command)),
      );
    const requestId = ctx.event.eventId
      ? createHash("sha256")
          .update(
            JSON.stringify([
              ctx.uid,
              ctx.event.identity,
              ctx.event.roomKey,
              ctx.event.channelId,
              ctx.event.eventId,
            ]),
          )
          .digest("hex")
          .slice(0, 48)
      : randomUUID();
    return command.execute({
      actorUid: ctx.uid,
      args,
      core: ctx.core,
      requestId,
    });
  }
  return defineAdvancedGameplay({
    name: "faith_admin",
    dependencies: ["faith"],
    init(context) {
      admin = new FaithAdminService(context.core);
      provideGameplayInterface(
        context,
        ADMIN_FIELDS_API,
        Object.freeze({
          register: admin.fields.register.bind(admin.fields),
          get: admin.fields.get.bind(admin.fields),
          list: admin.fields.list.bind(admin.fields),
        }),
        { version: "1.0.0" },
      );
      provideGameplayInterface(
        context,
        ADMIN_COMMANDS_API,
        Object.freeze({
          register: admin.commands.register.bind(admin.commands),
          list: admin.commands.list.bind(admin.commands),
        }),
        { version: "1.0.0" },
      );
      context.core.lifecycle.track(
        admin.commands.register({
          business: "faith_admin",
          command: "数值",
          description: "调整用户数值",
          async execute({ actorUid, args, requestId }) {
            if (args[0] === "全体") {
              if (args.length !== 3)
                throw new BusinessError(
                  "INVALID_INPUT",
                  "格式：信仰管理 数值 全体 [数值名] [变化值]",
                );
              return admin.changeAll(actorUid, args[1], args[2], requestId ?? randomUUID(), true);
            }
            if (args.length !== 4)
              throw new BusinessError(
                "INVALID_INPUT",
                "格式：信仰管理 数值 [数值名] [qq|uid] [目标] [变化值]\n全体调整：信仰管理 数值 全体 [数值名] [变化值]",
              );
            const result = await admin.change(actorUid, args[0], args[1], args[2], args[3], true);
            const content =
              typeof result.message === "string"
                ? result.message
                : ADMIN_MESSAGES.changed(result.targetUid, args[0], result.delta);
            return { type: "text", content };
          },
        }),
      );
    },
    dispose() {
      admin.fields.clear();
      admin.commands.clear();
    },
    commands: {
      faith_admin: {
        triggers: ["信仰管理"],
        description: "创造者管理命令",
        guest: true,
        run: handleFaithAdmin,
      },
    },
  });
}
export const faithAdminModule = createFaithAdminModule();
