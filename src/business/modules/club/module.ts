import type { GameplayOutput } from "cocofaith-sdk/gameplay";
import {
  defineGameplay,
  provideGameplayInterface,
  useGameplayInterface,
  type GameplayCommandContext,
} from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { ADMIN_COMMANDS_API, ADMIN_FIELDS_API, CLUB_API, TITLE_API } from "../../shared/contracts";
import { CLUB_CONFIG, type ClubConfig } from "./config";
import { CLUB_IDENTITY } from "./data";
import { CLUB_MESSAGES } from "./messages";
import { ClubService } from "./service";
type Context = GameplayCommandContext<ClubConfig, ClubService>;

async function handleClub(ctx: Context): Promise<GameplayOutput> {
  const uid = ctx.uid,
    [status, pool] = await Promise.all([ctx.service.status(uid), ctx.service.pool()]);
  if (status) await ctx.service.reconcileTitles(uid);
  return {
    type: "text",
    content: status
      ? CLUB_MESSAGES.info(
          status.levelName,
          status.active,
          status.duesEnabled,
          status.stats.feeCount,
          status.stats.goldContribution,
          status.stats.ascensionContribution,
          pool.gold,
          pool.ascension,
        )
      : CLUB_MESSAGES.nonMemberInfo(pool.gold, pool.ascension),
  };
}

async function handleClubJoin(ctx: Context): Promise<GameplayOutput> {
  const result = await ctx.service.join(ctx.uid, ctx.event.eventId);
  return {
    type: "text",
    content:
      result.kind === "first"
        ? CLUB_MESSAGES.firstJoin(
            result.status.levelName,
            result.cost.gold,
            result.cost.ascension_score,
            result.titles,
          )
        : result.status.level === "hall"
          ? CLUB_MESSAGES.hallRejoin(result.charged, result.cost.gold, result.cost.ascension_score)
          : CLUB_MESSAGES.rejoin(
              result.status.levelName,
              result.charged,
              result.cost.gold,
              result.cost.ascension_score,
            ),
  };
}

async function handleClubQuit(ctx: Context): Promise<GameplayOutput> {
  const result = await ctx.service.quit(ctx.uid, ctx.event.eventId);
  return {
    type: "text",
    content: result.kind === "hall" ? CLUB_MESSAGES.hallQuit : CLUB_MESSAGES.quit,
  };
}

async function handleClubAid(ctx: Context): Promise<GameplayOutput> {
  const result = await ctx.service.aid(ctx.uid, ctx.event.eventId);
  return { type: "text", content: CLUB_MESSAGES.aided(result.gold, result.ascension) };
}

async function handleClubDonate(ctx: Context): Promise<GameplayOutput> {
  if (ctx.args.length !== 2)
    throw new BusinessError("INVALID_INPUT", "格式：俱乐部 贡献 [金币|登神分] [数值]");
  const currency = parseCurrency(ctx.args[0]),
    amount = Number(ctx.args[1]);
  const result = await ctx.service.donate(ctx.uid, currency, amount, ctx.event.eventId);
  return {
    type: "text",
    content: CLUB_MESSAGES.donated(
      currency === "gold" ? "金币" : "登神分",
      amount,
      result.status.levelName,
      result.titles,
    ),
  };
}

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
      const fields = useGameplayInterface(context, ADMIN_FIELDS_API);
      const definitions = [
        ["俱乐部缴费次数", "feeCount"],
        ["俱乐部金币贡献", "goldContribution"],
        ["俱乐部登神贡献", "ascensionContribution"],
      ] as const;
      for (const [name, field] of definitions)
        context.track(
          fields.register({
            name,
            description: "只修改会员累计数据，不改变贡献池。",
            async change(operation) {
              const result = await service.adjustStats(
                operation.targetUid,
                field,
                operation.delta,
                operation.operationId,
              );
              return CLUB_MESSAGES.statsChanged(operation.targetUid, name, result.stats[field]);
            },
          }),
        );
      const admin = useGameplayInterface(context, ADMIN_COMMANDS_API);
      context.track(
        admin.register({
          business: "club",
          command: "俱乐部",
          description: "执行分成或调整贡献池",
          async execute({ actorUid, args, requestId }) {
            if (args[0] === "分成" && args.length === 1) {
              const result = await service.distribute(actorUid, requestId ?? `${Date.now()}`);
              return {
                type: "text",
                content: CLUB_MESSAGES.distributed(result.paid, result.gold, result.ascension),
              };
            }
            if (args[0] === "总贡献" && args.length === 2) {
              const delta = Number(args[1]);
              const result = await service.adjustPoolBoth(actorUid, delta, requestId);
              return {
                type: "text",
                content: CLUB_MESSAGES.poolChanged(result.gold, result.ascension),
              };
            }
            if (args[0] === "总贡献" && args.length === 3) {
              const currency = parseCurrency(args[1]),
                delta = Number(args[2]);
              const result = await service.adjustPool(actorUid, currency, delta, requestId);
              return {
                type: "text",
                content: CLUB_MESSAGES.poolChanged(result.gold, result.ascension),
              };
            }
            throw new BusinessError(
              "INVALID_INPUT",
              "格式：信仰管理 俱乐部 分成\n信仰管理 俱乐部 总贡献 [+/-数值]\n信仰管理 俱乐部 总贡献 [金币|登神分] [+/-数值]",
            );
          },
        }),
      );

      return service;
    },
    ready(service) {
      return service.initialize();
    },
    reload(service, config) {
      service.configure(config);
    },
    commands: {
      club: {
        triggers: ["俱乐部", "椰汁俱乐部"],
        scenes: ["group"],
        description: "椰汁俱乐部",
        run: handleClub,
        children: {
          join: {
            triggers: ["加入"],
            run: handleClubJoin,
          },
          quit: {
            triggers: ["退出"],
            run: handleClubQuit,
          },
          aid: {
            triggers: ["救济"],
            run: handleClubAid,
          },
          donate: {
            triggers: ["贡献", "捐赠"],
            run: handleClubDonate,
          },
          info: {
            triggers: ["信息", "详情"],
            run: handleClub,
          },
        },
      },
    },
  });
}

export function createClubModule() {
  return adaptGameplayDefinition(createClubGameplay());
}
export const clubModule = createClubModule();
function parseCurrency(value: string) {
  if (value === "金币" || value === "gold") return "gold" as const;
  if (["登神分", "登神分数", "ascension_score"].includes(value)) return "ascension_score" as const;
  throw new BusinessError("INVALID_INPUT", "数值类型只能是金币或登神分。");
}
