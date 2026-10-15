import { createHash } from "node:crypto";
import { BusinessError } from "../../framework/errors";
import type { AdvancedGameplayCommand, BusinessCommandContext, BusinessResult } from "../../framework/types";
import type { ContainerConfig } from "./config";
import { containerCustomizationText, containerText } from "./messages";
import type { ContainerService } from "./service";
export function createContainerCommands(getService: () => ContainerService): readonly AdvancedGameplayCommand<ContainerConfig>[] {
    const view = async (ctx: BusinessCommandContext<ContainerConfig>): Promise<BusinessResult> => ({
        type: "text",
        content: containerText.status(await getService().status(requireUid(ctx.uid)), ctx.config.maxCapacity, ctx.config.passiveMaxDivinity, ctx.config.goldPerDivinity, ctx.config.ascensionPerDivinity, ctx.config.maxConsecrationCharges),
    });
    return [{
            id: "container", triggers: ["容器", "神性容器"], description: "与神性容器互动", run: view,
            children: [
                {
                    id: "view", triggers: ["查看", "状态"], run: view
                },
                {
                    id: "infuse", triggers: ["投入", "注入"], async run(ctx) {
                        if (ctx.args.length < 2)
                            throw new BusinessError("INVALID_INPUT", "格式：容器 投入 [轮盘赌荣誉|神性碎片] [数量]");
                        const type = ctx.args[0], amount = Number(ctx.args[1]), uid = requireUid(ctx.uid), operationId = eventOperationId(ctx);
                        const service = getService();
                        if (type === "竞标荣誉")
                            throw new BusinessError("NOT_ALLOWED", "v3 尚未迁移竞标玩法，因此不能投入竞标荣誉。");
                        const result = type === "神性碎片"
                            ? await service.infuseFragment(uid, amount, operationId)
                            : type === "轮盘赌荣誉"
                                ? await service.infuseRouletteHonor(uid, amount, operationId)
                                : (() => {
                                    throw new BusinessError("INVALID_INPUT", "投入类型只能是轮盘赌荣誉或神性碎片。");
                                })();
                        return { type: "text", content: `投入成功：神性 +${result.gained.toFixed(2)}，当前 ${result.divinity.toFixed(2)}。` };
                    }
                },
                {
                    id: "consecrate", triggers: ["觐献"], async run(ctx) {
                        const result = await getService().consecrate(requireUid(ctx.uid), ctx.args[0] === undefined ? 1 : Number(ctx.args[0]), eventOperationId(ctx));
                        return { type: "text", content: `觐献 ${result.count} 次，消耗 ${result.spent} 神性，获得 ${result.reward} 觐见分。剩余神性 ${result.divinity.toFixed(2)}，觐献次数 ${result.charges}。` };
                    }
                },
                {
                    id: "subgod", triggers: ["从神"], async run(ctx) {
                        if (ctx.args.length !== 1)
                            throw new BusinessError("INVALID_INPUT", "格式：容器 从神 [神名]");
                        const result = await getService().ascendSubgod(requireUid(ctx.uid), ctx.args[0], eventOperationId(ctx));
                        const player = ctx.event.displayName ?? `UID ${ctx.uid}`;
                        return {
                            type: "text", content: `你已凝聚从神神格，神名【${result.godName}】。`, broadcast: { id: `container:subgod:${ctx.uid}:${result.godName}`, content: `恭喜【${player}】成为【${result.faith}】从神，神名【${result.godName}】！` }
                        };
                    }
                },
                {
                    id: "truegod", triggers: ["真神"], async run(ctx) {
                        if (ctx.args.length < 3)
                            throw new BusinessError("INVALID_INPUT", "格式：容器 真神 [神名] [命途] [SP 道具名]");
                        const result = await getService().ascendTrueGod(requireUid(ctx.uid), ctx.args[0], ctx.args[1], ctx.args.slice(2).join(" "), eventOperationId(ctx));
                        const player = ctx.event.displayName ?? `UID ${ctx.uid}`;
                        return {
                            type: "text", content: `你已登临【${result.path}】命途真神之位，信仰【${result.godName}】已经建立。`, broadcast: { id: `container:truegod:${ctx.uid}:${result.godName}`, content: `真实宇宙震动：【${player}】在【${result.path}】命途登临为【${result.godName}】之神！` }
                        };
                    }
                },
            ],
        }, {
            id: "truegod", triggers: ["真神"], description: "真神信仰设置",
            children: [{
                    id: "prayer", triggers: ["设置祷词"], async run(ctx) {
                        if (ctx.args.length !== 1)
                            throw new BusinessError("INVALID_INPUT", "格式：真神 设置祷词 [祷词]");
                        const faith = await getService().setPrayerWord(requireUid(ctx.uid), ctx.args[0]);
                        return containerCustomizationText.prayer(faith.name, faith.prayer_word!);
                    },
                }, {
                    id: "profession", triggers: ["设置职业"], async run(ctx) {
                        if (ctx.args.length !== 2)
                            throw new BusinessError("INVALID_INPUT", "格式：真神 设置职业 [职业类型] [职业名]");
                        const faith = await getService().setCustomProfession(requireUid(ctx.uid), ctx.args[0], ctx.args[1]);
                        return containerCustomizationText.profession(faith.name, ctx.args[0], ctx.args[1]);
                    },
                }],
        }];
}
function requireUid(uid: number | null) {
    if (uid === null)
        throw new BusinessError("UNREGISTERED");
    return uid;
}
function eventOperationId(ctx: BusinessCommandContext) {
    return ctx.event.eventId ? createHash("sha256").update(JSON.stringify([ctx.uid, ctx.event.roomKey, ctx.event.channelId, ctx.event.eventId, ctx.path])).digest("hex").slice(0, 48) : undefined;
}
