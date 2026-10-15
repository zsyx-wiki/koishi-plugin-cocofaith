import type { GameplayOutput } from "cocofaith-sdk/gameplay";
import {
  defineGameplay,
  provideGameplayInterface,
  type GameplayCommandContext,
} from "cocofaith-sdk/gameplay";
import { createHash, randomUUID } from "node:crypto";
import { BusinessError } from "../../framework/errors";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { ADMIN_COMMANDS_API, ADMIN_FIELDS_API } from "../../shared/contracts";
import { ADMIN_MESSAGES } from "./messages";
import { FaithAdminService } from "./service";
type Context = GameplayCommandContext<Record<string, never>, FaithAdminService, number | null>;

async function handleFaithAdmin(ctx: Context): Promise<GameplayOutput> {
  if (ctx.uid === null || !(await ctx.service.isCreator(ctx.uid))) return { type: "silent" };
  if (!ctx.service.commands.get("数值"))
    throw new BusinessError(
      "MODULE_NOT_READY",
      "管理命令尚未就绪，请重新加载 CoCoFaith Business。",
    );
  const [name, ...args] = ctx.args,
    command = name ? ctx.service.commands.get(name) : undefined;
  if (!command)
    throw new BusinessError(
      "INVALID_INPUT",
      ADMIN_MESSAGES.commands(ctx.service.commands.list().map((item) => item.command)),
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

export function createFaithAdminGameplay() {
  return defineGameplay({
    name: "faith_admin",
    dependencies: ["faith"],
    setup(context) {
      const admin = new FaithAdminService(context.core);
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
      context.track(
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

      return admin;
    },
    dispose(admin) {
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
    reload() {
      // 依赖玩法持有这些注册表，配置重载不能替换它们。
    },
  });
}

export function createFaithAdminModule() {
  return adaptGameplayDefinition(createFaithAdminGameplay());
}
export const faithAdminModule = createFaithAdminModule();
