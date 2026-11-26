import type { GameplayInput, GameplayCommandContext, GameplayOutput } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import type { ClubConfig } from "./config";
import type { ClubService } from "./service";
import { CLUB_MESSAGES } from "./messages";
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

export function createClubCommands(): GameplayInput<ClubConfig, ClubService>["commands"] {
  return {
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
  };
}
export function parseCurrency(value: string) {
  if (value === "金币" || value === "gold") return "gold" as const;
  if (["登神分", "登神分数", "ascension_score"].includes(value)) return "ascension_score" as const;
  throw new BusinessError("INVALID_INPUT", "数值类型只能是金币或登神分。");
}
