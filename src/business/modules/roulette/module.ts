import { provideGameplayInterface, useGameplayInterface } from "cocofaith-sdk/gameplay";
import type { BusinessCommandContext } from "../../framework/types";
import { defineAdvancedGameplay } from "../../framework/types";
import { ROOMS_API, ROULETTE_API, TITLE_API } from "../../shared/contracts";
import { MESSAGES } from "../../shared/messages";
import type { TitleServiceApi } from "../title";
import { ROULETTE_CONFIG } from "./config";
import { RouletteService } from "./service";
import type { RouletteConfig } from "./types";
export interface RouletteGameplayApi {
    registerPath: RouletteService["rules"]["registerPath"];
    registerField: RouletteService["rules"]["registerField"];
    registerHook: RouletteService["rules"]["registerHook"];
    stats(uid: number): ReturnType<RouletteService["stats"]>;
    changeHonor(uid: number, delta: number, idempotencyKey?: string): ReturnType<RouletteService["changeHonor"]>;
}
export function createRouletteModule() {
    let service: RouletteService, registration: {
        dispose(): Promise<void>;
    }, titles: TitleServiceApi;
    const run = (action: string) => async (ctx: BusinessCommandContext) => {
        const result = await service.command(ctx.event, action, ctx.args);
        return result;
    };
    async function grantMaxTitle(uid: number) {
        const stats = await service.stats(uid);
        if (stats.level >= 10)
            await titles.grant(uid, "demon-gambler");
    }
    return defineAdvancedGameplay<never, never, RouletteConfig>({
        name: "roulette", dependencies: ["rooms", "title"], config: ROULETTE_CONFIG,
        init(ctx) {
            const rooms = useGameplayInterface(ctx, ROOMS_API);
            service = new RouletteService(ctx.core, rooms, ctx.config);
            titles = useGameplayInterface(ctx, TITLE_API);
            service.onCommitted = async (room) => {
                for (const uid of room.state.maxLevelUids)
                    await titles.grant(uid, "demon-gambler");
                if (room.status === "ended")
                    await ctx.core.hooks.emit("settled", {
                        roomId: room.id, mode: room.state.mode, aborted: !!room.state.aborted,
                        participants: room.members.map((p) => p.uid), maxLevelUids: [...room.state.maxLevelUids],
                        rewards: structuredClone(room.state.rewards),
                    });
            };
            registration = rooms.register(service);
            provideGameplayInterface(ctx, ROULETTE_API, Object.freeze({
                registerPath: service.rules.registerPath.bind(service.rules), registerField: service.rules.registerField.bind(service.rules),
                registerHook: service.rules.registerHook.bind(service.rules), stats: service.stats.bind(service), changeHonor: service.changeHonor.bind(service),
            }));
        },
        reload(ctx) {
            service.configure(ctx.config);
        },
        dispose: () => registration.dispose(),
        commands: [{
                id: "roulette", triggers: ["恶魔轮盘"], scenes: ["group"],
                run: () => ({ type: "text", content: MESSAGES.roulette.help }),
                children: [
                    {
                        id: "create", triggers: ["发起", "创建"], run: (ctx) => service.create(ctx.event, "normal")
                    },
                    {
                        id: "gambler", triggers: ["发起赌徒"], run: (ctx) => service.create(ctx.event, "gambler")
                    },
                    {
                        id: "crazy", triggers: ["发起疯狂"], run: (ctx) => service.create(ctx.event, "crazy")
                    },
                    ...[["join", "加入"], ["leave", "退出"], ["start", "开始"], ["abort", "结束"], ["view", "对局"], ["force_abort", "强制结束"],
                        ["开枪", "开枪"], ["恐惧", "恐惧"], ["无畏", "无畏"], ["退缩", "退缩"]].map(([action, command], i) => ({
                        id: `action_${i}`, triggers: [command], run: run(action)
                    })),
                    {
                        id: "ability", triggers: ["能力"], run: (ctx) => service.command(ctx.event, ctx.args[0] ?? "", ctx.args.slice(1))
                    },
                    {
                        id: "stats", triggers: ["状态"], async run(ctx) {
                            const s = await service.stats(ctx.uid!);
                            await grantMaxTitle(ctx.uid!);
                            return { type: "text", content: MESSAGES.roulette.stats(s) };
                        }
                    },
                ],
            }],
    });
}
export const rouletteModule = createRouletteModule();
