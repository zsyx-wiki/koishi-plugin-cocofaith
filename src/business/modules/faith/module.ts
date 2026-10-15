import type { GameplayOutput } from "cocofaith-sdk/gameplay";
import {
  collectGameplay,
  defineGameplay,
  provideGameplayInterface,
  type GameplayCommandContext,
  type GameplaySetupContext,
} from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { adaptGameplayDefinition } from "../../framework/gameplay-adapter";
import { FAITH_BEFORE_ABANDON, FAITH_INFO, FAITH_REGISTRY_API } from "../../shared/contracts";
import { formatItem } from "../../shared/item-format";
import { FAITH_CONFIG } from "./config";
import { FAITH_MESSAGES } from "./messages";
import { FaithOpenItemService } from "./open";
import { FaithSaleService, parseSaleArgs } from "./sale";
import { FaithGameplayService, formatFaithInfo, type FaithGameplayConfig } from "./service";
type Services = {
  gameplay: FaithGameplayService;
  sale: FaithSaleService;
  opener: FaithOpenItemService;
  collect: GameplaySetupContext<FaithGameplayConfig>["collect"];
};
type Context = GameplayCommandContext<FaithGameplayConfig, Services>;
type GuestContext = GameplayCommandContext<FaithGameplayConfig, Services, number | null>;

async function handleFaithRegister(ctx: GuestContext): Promise<GameplayOutput> {
  if (!ctx.event.identity) throw new BusinessError("INVALID_INPUT", "注册事件缺少平台身份。");
  if (ctx.event.adapter?.allowRegistration !== true)
    throw new BusinessError(
      "NOT_ALLOWED",
      "当前接入端未开放新 UID 注册，请先完成跨平台绑定或联系管理员开启注册。",
    );
  const faith = ctx.args.join(" ").trim();
  const user = await ctx.service.gameplay.register(ctx.event.identity, faith);
  return { type: "text", content: FAITH_MESSAGES.registered(user.faiths[0], user.gold) };
}

async function handleFaithAbandon(ctx: Context): Promise<GameplayOutput> {
  const uid = ctx.uid;
  const blockers = await collectGameplay(
    ctx.service,
    FAITH_BEFORE_ABANDON,
    Object.freeze({ uid, targetFaith: ctx.args.join(" ").trim() }),
  );
  if (blockers.results.length) throw new BusinessError("NOT_ALLOWED", blockers.results.join("\n"));
  const result = await ctx.service.gameplay.abandon(uid, ctx.args.join(" "));
  return {
    type: "text",
    content: FAITH_MESSAGES.abandoned(
      result.oldFaith,
      result.newFaith,
      result.cost.ascensionCost,
      result.cost.audienceCost,
    ),
  };
}

async function handleFaithProfession(ctx: Context): Promise<GameplayOutput> {
  const uid = ctx.uid,
    name = ctx.args.join(" ").trim(),
    user = await ctx.service.gameplay.info(uid);
  if (!user.faiths[0]) throw new BusinessError("NOT_ALLOWED", "请先注册信仰。");
  if (!name) {
    const current = user.profession_id ? ctx.core.professions.get(user.profession_id) : undefined;
    if (current)
      return {
        type: "text",
        content: FAITH_MESSAGES.currentProfession(current.type, current.name),
      };
    const choices = ctx.service.gameplay.professions(user.faiths[0]);
    return { type: "text", content: FAITH_MESSAGES.professionChoices(user.faiths[0], choices) };
  }
  const profession = await ctx.service.gameplay.chooseProfession(uid, name);
  return {
    type: "text",
    content: FAITH_MESSAGES.professionChosen(profession.type, profession.name),
  };
}

async function handleFaithListProfessions(ctx: Context): Promise<GameplayOutput> {
  if (ctx.args.length !== 1)
    throw new BusinessError("INVALID_INPUT", "格式：信仰 职业查看 [信仰名]");
  const faith = ctx.args[0];
  return FAITH_MESSAGES.professionChoices(faith, ctx.service.gameplay.professions(faith));
}

async function handleFaithChangeProfession(ctx: Context): Promise<GameplayOutput> {
  const result = await ctx.service.gameplay.changeProfession(ctx.uid, ctx.args.join(" "));
  return {
    type: "text",
    content: FAITH_MESSAGES.professionChanged(
      result.old?.name ?? "未知",
      result.profession.type,
      result.profession.name,
      result.cost.gold,
      result.cost.ascension,
    ),
  };
}

async function handleFaithSell(ctx: Context): Promise<GameplayOutput> {
  const input = parseSaleArgs(ctx.args),
    result = await ctx.service.sale.sell(ctx.uid, input.item, input.quantity);
  return {
    type: "text",
    content: FAITH_MESSAGES.sold(formatItem(result.item!), result.quantity, result.gold),
  };
}

async function handleFaithSellLevel(ctx: Context): Promise<GameplayOutput> {
  if (ctx.args.length !== 1) throw new BusinessError("INVALID_INPUT", "格式：信仰 卖出等级 [等级]");
  const result = await ctx.service.sale.sellLevel(ctx.uid, ctx.args[0], false);
  return {
    type: "text",
    content: FAITH_MESSAGES.soldLevel(
      result.level!,
      result.kinds,
      result.quantity,
      result.gold,
      true,
    ),
  };
}

async function handleFaithForceSellLevel(ctx: Context): Promise<GameplayOutput> {
  if (ctx.args.length !== 1)
    throw new BusinessError("INVALID_INPUT", "格式：信仰 强制卖出等级 [等级]");
  const result = await ctx.service.sale.sellLevel(ctx.uid, ctx.args[0], true);
  return {
    type: "text",
    content: FAITH_MESSAGES.soldLevel(
      result.level!,
      result.kinds,
      result.quantity,
      result.gold,
      false,
    ),
  };
}

async function handleFaithOpen(ctx: Context): Promise<GameplayOutput> {
  const result = await ctx.service.opener.open(ctx.uid, ctx.args);
  const currencies = [
    result.currencies.gold ? `金币 +${result.currencies.gold}` : "",
    result.currencies.ascension_score ? `登神分 +${result.currencies.ascension_score}` : "",
    result.currencies.audience_score ? `觐见分 +${result.currencies.audience_score}` : "",
  ].filter(Boolean);
  const items = Object.entries(result.items).map(
    ([id, count]) => `${formatItem(ctx.core.items.require(id))}×${count}`,
  );
  return {
    type: "text",
    content: FAITH_MESSAGES.opened(formatItem(result.item), result.quantity, [
      ...currencies,
      ...items,
    ]),
  };
}

export function createFaithGameplay() {
  const information = async (ctx: Context): Promise<GameplayOutput> => {
    const uid = ctx.uid,
      user = await ctx.service.gameplay.info(uid);
    const profession = user.profession_id
      ? ctx.core.professions.get(user.profession_id)
      : undefined;
    const extensions = await collectGameplay(ctx.service, FAITH_INFO, Object.freeze({ uid }));
    return {
      type: "text",
      content: [formatFaithInfo(user, profession), ...extensions.results]
        .filter(Boolean)
        .join("\n"),
    };
  };
  return defineGameplay({
    name: "faith",
    config: FAITH_CONFIG,
    setup(context) {
      const gameplay = new FaithGameplayService(context.core, context.config);
      const sale = new FaithSaleService(context.core);
      const opener = new FaithOpenItemService(context.core);
      provideGameplayInterface(
        context,
        FAITH_REGISTRY_API,
        Object.freeze({
          get: context.core.faiths.get,
          has: context.core.faiths.has,
          all: context.core.faiths.all,
          byPath: context.core.faiths.byPath,
        }),
        { version: "1.0.0" },
      );

      return { gameplay, sale, opener, collect: context.collect };
    },
    commands: {
      faith: {
        triggers: ["信仰"],
        description: "信仰基础功能",
        run: information,
        children: {
          info: {
            triggers: ["信息", "info"],
            run: information,
          },
          register: {
            triggers: ["注册", "register"],
            guest: true,
            run: handleFaithRegister,
          },
          abandon: {
            triggers: ["弃誓"],
            run: handleFaithAbandon,
          },
          profession: {
            triggers: ["职业"],
            run: handleFaithProfession,
          },
          list_professions: {
            triggers: ["职业查看"],
            run: handleFaithListProfessions,
          },
          change_profession: {
            triggers: ["变更职业", "更换职业"],
            run: handleFaithChangeProfession,
          },
          sell: {
            triggers: ["卖出", "出售"],
            scenes: ["group"],
            run: handleFaithSell,
          },
          sell_level: {
            triggers: ["卖出等级", "出售等级"],
            scenes: ["group"],
            run: handleFaithSellLevel,
          },
          force_sell_level: {
            triggers: ["强制卖出等级", "强制出售等级", "全卖等级"],
            scenes: ["group"],
            run: handleFaithForceSellLevel,
          },
          open: {
            triggers: ["打开", "开启"],
            scenes: ["group"],
            run: handleFaithOpen,
          },
        },
      },
    },
    reload(service, config) {
      service.gameplay.configure(config);
    },
  });
}
export function createFaithModule() {
  return adaptGameplayDefinition(createFaithGameplay());
}
export const faithModule = createFaithModule();
export * from "./open";
export * from "./sale";
