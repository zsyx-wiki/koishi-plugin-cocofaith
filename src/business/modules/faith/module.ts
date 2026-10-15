import { collectGameplay, provideGameplayInterface } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import { defineAdvancedGameplay, type BusinessCommandContext, type BusinessResult } from "../../framework/types";
import { FAITH_BEFORE_ABANDON, FAITH_INFO, FAITH_REGISTRY_API } from "../../shared/contracts";
import { formatItem } from "../../shared/item-format";
import { MESSAGES } from "../../shared/messages";
import { FAITH_CONFIG } from "./config";
import { FaithOpenItemService } from "./open";
import { FaithSaleService, parseSaleArgs } from "./sale";
import { FaithGameplayService, formatFaithInfo, type FaithGameplayConfig } from "./service";
export function createFaithModule() {
    let gameplay: FaithGameplayService;
    let sale: FaithSaleService;
    let opener: FaithOpenItemService;
    const information = async (ctx: BusinessCommandContext): Promise<BusinessResult> => {
        const uid = requireUid(ctx.uid), user = await gameplay.info(uid);
        const profession = user.profession_id ? ctx.core.professions.get(user.profession_id) : undefined;
        const extensions = await collectGameplay(ctx, FAITH_INFO, Object.freeze({ uid }));
        return { type: "text", content: [formatFaithInfo(user, profession), ...extensions.results].filter(Boolean).join("\n") };
    };
    return defineAdvancedGameplay<never, never, FaithGameplayConfig>({
        name: "faith",
        config: FAITH_CONFIG,
        init(context) {
            gameplay = new FaithGameplayService(context.core, context.config);
            sale = new FaithSaleService(context.core);
            opener = new FaithOpenItemService(context.core);
            provideGameplayInterface(context, FAITH_REGISTRY_API, Object.freeze({
                get: context.core.faiths.get, has: context.core.faiths.has, all: context.core.faiths.all, byPath: context.core.faiths.byPath,
            }), { version: "1.0.0" });
        },
        commands: [{
                id: "faith", triggers: ["信仰"], description: "信仰基础功能", run: information,
                children: [
                    {
                        id: "info", triggers: ["信息", "info"], run: information
                    },
                    {
                        id: "register", triggers: ["注册", "register"], guest: true, async run(ctx) {
                            if (!ctx.event.identity)
                                throw new BusinessError("INVALID_INPUT", "注册事件缺少平台身份。");
                            if (ctx.event.adapter?.allowRegistration !== true)
                                throw new BusinessError("NOT_ALLOWED", "当前接入端未开放新 UID 注册，请先完成跨平台绑定或联系管理员开启注册。");
                            const faith = ctx.args.join(" ").trim();
                            const user = await gameplay.register(ctx.event.identity, faith);
                            return { type: "text", content: MESSAGES.faith.registered(user.faiths[0], user.gold) };
                        }
                    },
                    {
                        id: "abandon", triggers: ["弃誓"], async run(ctx) {
                            const uid = requireUid(ctx.uid);
                            const blockers = await collectGameplay(ctx, FAITH_BEFORE_ABANDON, Object.freeze({ uid, targetFaith: ctx.args.join(" ").trim() }));
                            if (blockers.results.length)
                                throw new BusinessError("NOT_ALLOWED", blockers.results.join("\n"));
                            const result = await gameplay.abandon(uid, ctx.args.join(" "));
                            return { type: "text", content: MESSAGES.faith.abandoned(result.oldFaith, result.newFaith, result.cost.ascensionCost, result.cost.audienceCost) };
                        }
                    },
                    {
                        id: "profession", triggers: ["职业"], async run(ctx) {
                            const uid = requireUid(ctx.uid), name = ctx.args.join(" ").trim(), user = await gameplay.info(uid);
                            if (!user.faiths[0])
                                throw new BusinessError("NOT_ALLOWED", "请先注册信仰。");
                            if (!name) {
                                const current = user.profession_id ? ctx.core.professions.get(user.profession_id) : undefined;
                                if (current)
                                    return { type: "text", content: MESSAGES.faith.currentProfession(current.type, current.name) };
                                const choices = gameplay.professions(user.faiths[0]);
                                return { type: "text", content: MESSAGES.faith.professionChoices(user.faiths[0], choices) };
                            }
                            const profession = await gameplay.chooseProfession(uid, name);
                            return { type: "text", content: MESSAGES.faith.professionChosen(profession.type, profession.name) };
                        }
                    },
                    {
                        id: "list_professions", triggers: ["职业查看"], async run(ctx) {
                            if (ctx.args.length !== 1)
                                throw new BusinessError("INVALID_INPUT", "格式：信仰 职业查看 [信仰名]");
                            const faith = ctx.args[0];
                            return MESSAGES.faith.professionChoices(faith, gameplay.professions(faith));
                        }
                    },
                    {
                        id: "change_profession", triggers: ["变更职业", "更换职业"], async run(ctx) {
                            const result = await gameplay.changeProfession(requireUid(ctx.uid), ctx.args.join(" "));
                            return { type: "text", content: MESSAGES.faith.professionChanged(result.old?.name ?? "未知", result.profession.type, result.profession.name, result.cost.gold, result.cost.ascension) };
                        }
                    },
                    {
                        id: "sell", triggers: ["卖出", "出售"], scenes: ["group"], async run(ctx) {
                            const input = parseSaleArgs(ctx.args), result = await sale.sell(requireUid(ctx.uid), input.item, input.quantity);
                            return { type: "text", content: MESSAGES.faith.sold(formatItem(result.item!), result.quantity, result.gold) };
                        }
                    },
                    {
                        id: "sell_level", triggers: ["卖出等级", "出售等级"], scenes: ["group"], async run(ctx) {
                            if (ctx.args.length !== 1)
                                throw new BusinessError("INVALID_INPUT", "格式：信仰 卖出等级 [等级]");
                            const result = await sale.sellLevel(requireUid(ctx.uid), ctx.args[0], false);
                            return { type: "text", content: MESSAGES.faith.soldLevel(result.level!, result.kinds, result.quantity, result.gold, true) };
                        }
                    },
                    {
                        id: "force_sell_level", triggers: ["强制卖出等级", "强制出售等级", "全卖等级"], scenes: ["group"], async run(ctx) {
                            if (ctx.args.length !== 1)
                                throw new BusinessError("INVALID_INPUT", "格式：信仰 强制卖出等级 [等级]");
                            const result = await sale.sellLevel(requireUid(ctx.uid), ctx.args[0], true);
                            return { type: "text", content: MESSAGES.faith.soldLevel(result.level!, result.kinds, result.quantity, result.gold, false) };
                        }
                    },
                    {
                        id: "open", triggers: ["打开", "开启"], scenes: ["group"], async run(ctx) {
                            const result = await opener.open(requireUid(ctx.uid), ctx.args);
                            const currencies = [
                                result.currencies.gold ? `金币 +${result.currencies.gold}` : "",
                                result.currencies.ascension_score ? `登神分 +${result.currencies.ascension_score}` : "",
                                result.currencies.audience_score ? `觐见分 +${result.currencies.audience_score}` : "",
                            ].filter(Boolean);
                            const items = Object.entries(result.items).map(([id, count]) => `${formatItem(ctx.core.items.require(id))}×${count}`);
                            return { type: "text", content: MESSAGES.faith.opened(formatItem(result.item), result.quantity, [...currencies, ...items]) };
                        }
                    },
                ],
            }],
    });
}
export const faithModule = createFaithModule();
export * from "./open";
export * from "./sale";
function requireUid(uid: number | null) {
    if (uid === null)
        throw new BusinessError("UNREGISTERED", MESSAGES.common.unregistered);
    return uid;
}
